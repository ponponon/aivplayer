import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PERSON_MATTE_MODEL_FILES, getPersonMatteModelPaths, type PersonMatteModelPaths } from './person-matte-model'
import type { PersonMatteModelDownloadProgress } from '../../shared/person-matte-types'

export type { PersonMatteModelDownloadProgress } from '../../shared/person-matte-types'

export type DownloadPersonMatteModelOptions = {
  modelRoot: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  onProgress?: (progress: PersonMatteModelDownloadProgress) => void
}

export async function downloadPersonMatteModel(options: DownloadPersonMatteModelOptions): Promise<PersonMatteModelPaths> {
  const paths = getPersonMatteModelPaths(options.modelRoot)
  const fetchImpl = options.fetchImpl ?? fetch

  for (const [index, file] of PERSON_MATTE_MODEL_FILES.entries()) {
    const targetPath = join(paths.modelDirectory, file.relativePath)
    const existingSize = await getPositiveFileSize(targetPath)
    if (existingSize !== null) {
      emitProgress(options.onProgress, { status: 'cached', relativePath: file.relativePath, fileIndex: index + 1, fileCount: PERSON_MATTE_MODEL_FILES.length, receivedBytes: existingSize, totalBytes: existingSize, percent: 1 })
      continue
    }

    await rm(`${targetPath}.download`, { force: true })
    const response = await fetchImpl(file.url)
    if (!response.ok) throw new Error(`人物抠像模型下载失败：${file.relativePath}，HTTP ${response.status} ${response.statusText}`)

    const contentLength = Number(response.headers.get('content-length'))
    const totalBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null
    const temporaryPath = `${targetPath}.download`
    await ensureParentDirectory(targetPath)
    const output = await open(temporaryPath, 'w')
    let receivedBytes = 0
    try {
      if (!response.body) {
        const content = new Uint8Array(await response.arrayBuffer())
        await output.write(content)
        receivedBytes = content.byteLength
        emitProgress(options.onProgress, { status: 'downloading', relativePath: file.relativePath, fileIndex: index + 1, fileCount: PERSON_MATTE_MODEL_FILES.length, receivedBytes, totalBytes, percent: toPercent(receivedBytes, totalBytes) })
      } else {
        const reader = response.body.getReader()
        while (true) {
          if (options.signal?.aborted) throw new Error('人物抠像模型下载已取消')
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue
          await output.write(value)
          receivedBytes += value.byteLength
          emitProgress(options.onProgress, { status: 'downloading', relativePath: file.relativePath, fileIndex: index + 1, fileCount: PERSON_MATTE_MODEL_FILES.length, receivedBytes, totalBytes, percent: toPercent(receivedBytes, totalBytes) })
        }
      }
    } finally {
      await output.close()
    }

    if (receivedBytes <= 0) {
      await rm(temporaryPath, { force: true })
      throw new Error(`人物抠像模型下载结果为空：${file.relativePath}`)
    }
    await rename(temporaryPath, targetPath)
    emitProgress(options.onProgress, { status: 'completed', relativePath: file.relativePath, fileIndex: index + 1, fileCount: PERSON_MATTE_MODEL_FILES.length, receivedBytes, totalBytes: totalBytes ?? receivedBytes, percent: 1 })
  }

  return paths
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
}

async function getPositiveFileSize(filePath: string): Promise<number | null> {
  try {
    const fileStat = await stat(filePath)
    return fileStat.isFile() && fileStat.size > 0 ? fileStat.size : null
  } catch {
    return null
  }
}

function emitProgress(onProgress: DownloadPersonMatteModelOptions['onProgress'], progress: PersonMatteModelDownloadProgress): void {
  onProgress?.(progress)
}

function toPercent(receivedBytes: number, totalBytes: number | null): number | null {
  return totalBytes && totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : null
}
