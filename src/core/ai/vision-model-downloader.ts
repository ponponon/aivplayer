import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { VISION_MODEL_FILES, VISION_MODEL_REPOSITORY, VISION_MODEL_REVISION, type VisionModelDownloadProgress } from '../../shared/vision-types'
import { getVisionUserDataModelPaths, type VisionModelPaths } from './vision-model'

const DEFAULT_BASE_URL = 'https://huggingface.co'

export type DownloadVisionModelOptions = {
  modelRoot: string
  repository?: string
  revision?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  onProgress?: (progress: VisionModelDownloadProgress) => void
}

function buildDownloadUrl(baseUrl: string, repository: string, revision: string, relativePath: string): string {
  const encodedPath = relativePath.split('/').map((part) => encodeURIComponent(part)).join('/')
  return `${baseUrl.replace(/\/$/u, '')}/${repository}/resolve/${revision}/${encodedPath}`
}

async function getPositiveFileSize(filePath: string): Promise<number | null> {
  try {
    const fileStat = await stat(filePath)
    return fileStat.isFile() && fileStat.size > 0 ? fileStat.size : null
  } catch {
    return null
  }
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
}

function emitProgress(onProgress: DownloadVisionModelOptions['onProgress'], progress: VisionModelDownloadProgress): void {
  onProgress?.(progress)
}

function toPercent(receivedBytes: number, totalBytes: number | null): number | null {
  return totalBytes && totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : null
}

async function downloadFile(
  fileUrl: string,
  targetPath: string,
  file: string,
  fileIndex: number,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
  onProgress: DownloadVisionModelOptions['onProgress']
): Promise<void> {
  await rm(`${targetPath}.download`, { force: true })
  await ensureParentDirectory(targetPath)
  const response = await fetchImpl(fileUrl, { redirect: 'follow', signal })
  if (!response.ok) throw new Error(`视觉模型下载失败：${file}，HTTP ${response.status} ${response.statusText}`)

  const contentLength = Number(response.headers.get('content-length'))
  const totalBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null
  const temporaryPath = `${targetPath}.download`
  const output = await open(temporaryPath, 'w')
  let receivedBytes = 0
  try {
    if (!response.body) {
      const content = new Uint8Array(await response.arrayBuffer())
      await output.write(content)
      receivedBytes = content.byteLength
      emitProgress(onProgress, { status: 'downloading', relativePath: file, fileIndex, fileCount: VISION_MODEL_FILES.length, receivedBytes, totalBytes, percent: toPercent(receivedBytes, totalBytes) })
    } else {
      const reader = response.body.getReader()
      while (true) {
        if (signal?.aborted) throw new Error('视觉模型下载已取消')
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        await output.write(value)
        receivedBytes += value.byteLength
        emitProgress(onProgress, { status: 'downloading', relativePath: file, fileIndex, fileCount: VISION_MODEL_FILES.length, receivedBytes, totalBytes, percent: toPercent(receivedBytes, totalBytes) })
      }
    }
  } finally {
    await output.close()
  }

  if (receivedBytes <= 0) {
    await rm(temporaryPath, { force: true })
    throw new Error(`视觉模型下载结果为空：${file}`)
  }
  await rename(temporaryPath, targetPath)
  emitProgress(onProgress, { status: 'completed', relativePath: file, fileIndex, fileCount: VISION_MODEL_FILES.length, receivedBytes, totalBytes: totalBytes ?? receivedBytes, percent: 1 })
}

export async function downloadVisionModel(options: DownloadVisionModelOptions): Promise<VisionModelPaths> {
  const paths = getVisionUserDataModelPaths(options.modelRoot)
  const repository = options.repository ?? process.env.VISION_MODEL_REPOSITORY ?? VISION_MODEL_REPOSITORY
  const revision = options.revision ?? process.env.VISION_MODEL_REVISION ?? VISION_MODEL_REVISION
  const baseUrl = options.baseUrl ?? process.env.HF_ENDPOINT ?? DEFAULT_BASE_URL
  const fetchImpl = options.fetchImpl ?? fetch

  for (const [index, file] of VISION_MODEL_FILES.entries()) {
    const targetPath = join(paths.modelDirectory, file)
    const existingSize = await getPositiveFileSize(targetPath)
    if (existingSize !== null) {
      emitProgress(options.onProgress, { status: 'cached', relativePath: file, fileIndex: index + 1, fileCount: VISION_MODEL_FILES.length, receivedBytes: existingSize, totalBytes: existingSize, percent: 1 })
      continue
    }
    await downloadFile(buildDownloadUrl(baseUrl, repository, revision, file), targetPath, file, index + 1, fetchImpl, options.signal, options.onProgress)
  }
  return paths
}
