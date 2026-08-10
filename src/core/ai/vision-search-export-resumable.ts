import { createHash } from 'node:crypto'
import { access, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { VisionSearchResult, VisionSearchResultsExportFormat } from '../../shared/vision-types'
import {
  renderVisionSearchResultsExportChunk,
  renderVisionSearchResultsExportEpilogue,
  renderVisionSearchResultsExportPreamble,
  VISION_SEARCH_EXPORT_CHUNK_SIZE,
  isVisionSearchExportAbortError
} from './vision-search-export'

export type VisionSearchExportPartProgress = {
  partIndex: number
  partCount: number
  writtenCount: number
  totalCount: number
  hash: string
  reused: boolean
}

export type VisionSearchExportResumableOptions = {
  outputPath: string
  partsDirectory: string
  assemblyPath: string
  chunkSize?: number
  completedParts?: Readonly<Record<string, string>>
  signal?: AbortSignal
  onPartComplete?: (progress: VisionSearchExportPartProgress) => void | Promise<void>
}

export type VisionSearchExportResumableResult = {
  resultCount: number
  partCount: number
  completedParts: Record<string, string>
}

function abortIfRequested(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('视觉搜索导出已取消')
  error.name = 'AbortError'
  throw error
}

function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function partPath(partsDirectory: string, partIndex: number): string {
  return join(partsDirectory, `${String(partIndex).padStart(6, '0')}.part`)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function replaceFile(temporaryPath: string, outputPath: string): Promise<void> {
  try {
    await rename(temporaryPath, outputPath)
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (code !== 'EEXIST' && code !== 'EPERM') throw error
    await unlink(outputPath).catch(() => undefined)
    await rename(temporaryPath, outputPath)
  }
}

async function writePart(partPathname: string, content: string): Promise<void> {
  const temporaryPath = `${partPathname}.${process.pid}.tmp`
  await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600 })
  await replaceFile(temporaryPath, partPathname)
}

async function isReusablePart(pathname: string, expectedHash: string): Promise<boolean> {
  if (!await fileExists(pathname)) return false
  try {
    return contentHash(await readFile(pathname, 'utf8')) === expectedHash
  } catch {
    return false
  }
}

export async function writeVisionSearchResultsExportResumable(
  results: readonly VisionSearchResult[],
  format: VisionSearchResultsExportFormat,
  options: VisionSearchExportResumableOptions
): Promise<VisionSearchExportResumableResult> {
  const chunkSize = Math.min(10_000, Math.max(1, Math.floor(options.chunkSize ?? VISION_SEARCH_EXPORT_CHUNK_SIZE)))
  const partCount = Math.ceil(results.length / chunkSize)
  const completedParts: Record<string, string> = {}
  await mkdir(options.partsDirectory, { recursive: true })

  for (let partIndex = 0; partIndex < partCount; partIndex += 1) {
    abortIfRequested(options.signal)
    const startIndex = partIndex * chunkSize
    const chunk = results.slice(startIndex, startIndex + chunkSize)
    const content = renderVisionSearchResultsExportChunk(chunk, format, startIndex)
    const hash = contentHash(content)
    const pathname = partPath(options.partsDirectory, partIndex)
    const reused = options.completedParts?.[String(partIndex)] === hash && await isReusablePart(pathname, hash)
    if (!reused) {
      await writePart(pathname, content)
    }
    completedParts[String(partIndex)] = hash
    await options.onPartComplete?.({ partIndex, partCount, writtenCount: startIndex + chunk.length, totalCount: results.length, hash, reused })
    await new Promise<void>((resolve) => setImmediate(resolve))
  }

  const temporaryAssemblyPath = `${options.assemblyPath}.${process.pid}.tmp`
  const handle = await open(temporaryAssemblyPath, 'w')
  try {
    abortIfRequested(options.signal)
    await handle.write(renderVisionSearchResultsExportPreamble(format), undefined, 'utf8')
    for (let partIndex = 0; partIndex < partCount; partIndex += 1) {
      abortIfRequested(options.signal)
      const pathname = partPath(options.partsDirectory, partIndex)
      const content = await readFile(pathname, 'utf8')
      if (contentHash(content) !== completedParts[String(partIndex)]) throw new Error(`导出 part ${partIndex + 1} 校验失败`)
      await handle.write(content, undefined, 'utf8')
    }
    abortIfRequested(options.signal)
    await handle.write(renderVisionSearchResultsExportEpilogue(format), undefined, 'utf8')
  } catch (error) {
    await handle.close()
    await unlink(temporaryAssemblyPath).catch(() => undefined)
    if (isVisionSearchExportAbortError(error)) throw error
    throw error
  }
  await handle.close()
  await replaceFile(temporaryAssemblyPath, options.outputPath)
  return { resultCount: results.length, partCount, completedParts }
}
