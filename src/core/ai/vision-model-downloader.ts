import { createHash } from 'node:crypto'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { VISION_MODEL_BASE_URL, VISION_MODEL_FILES, VISION_MODEL_REPOSITORY, VISION_MODEL_REVISION, type VisionModelDownloadProgress } from '../../shared/vision-types'
import { getVisionUserDataModelPaths, type VisionModelPaths } from './vision-model'

const DEFAULT_BASE_URL = VISION_MODEL_BASE_URL

export type DownloadVisionModelOptions = {
  modelRoot: string
  repository?: string
  revision?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  onProgress?: (progress: VisionModelDownloadProgress) => void
}

type RemoteVisionModelManifest = {
  revision: string
  files: Array<{ relativePath: string; sha256: string; sizeBytes: number }>
}

function buildDownloadUrl(baseUrl: string, repository: string, revision: string, relativePath: string): string {
  if (baseUrl.includes('{repository}') || baseUrl.includes('{revision}')) {
    return baseUrl
      .replaceAll('{repository}', repository)
      .replaceAll('{revision}', revision)
      .replace(/\/$/u, '') + `/${relativePath}`
  }
  if (baseUrl === DEFAULT_BASE_URL || baseUrl.includes('/models/siglip2/')) {
    return `${baseUrl.replace(/\/$/u, '')}/${relativePath}`
  }
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
  onProgress: DownloadVisionModelOptions['onProgress'],
  expected?: { sha256: string; sizeBytes: number }
): Promise<void> {
  await rm(`${targetPath}.download`, { force: true })
  await ensureParentDirectory(targetPath)
  const response = await fetchImpl(fileUrl, { redirect: 'follow', signal })
  if (!response.ok) throw new Error(`视觉模型下载失败：${file}，HTTP ${response.status} ${response.statusText}`)

  const contentLength = Number(response.headers.get('content-length'))
  const totalBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null
  const temporaryPath = `${targetPath}.download`
  const output = await open(temporaryPath, 'w')
  const hash = createHash('sha256')
  let receivedBytes = 0
  try {
    if (!response.body) {
      const content = new Uint8Array(await response.arrayBuffer())
      await output.write(content)
      hash.update(content)
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
        hash.update(value)
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
  const actualSha256 = hash.digest('hex')
  if (expected && (actualSha256 !== expected.sha256 || receivedBytes !== expected.sizeBytes)) {
    await rm(temporaryPath, { force: true })
    throw new Error(`视觉模型校验失败：${file}`)
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
  const missingFiles: string[] = []
  for (const file of VISION_MODEL_FILES) {
    if ((await getPositiveFileSize(join(paths.modelDirectory, file))) === null) missingFiles.push(file)
  }
  if (missingFiles.length === 0) {
    for (const [index, file] of VISION_MODEL_FILES.entries()) {
      const existingSize = await getPositiveFileSize(join(paths.modelDirectory, file))
      if (existingSize !== null) emitProgress(options.onProgress, { status: 'cached', relativePath: file, fileIndex: index + 1, fileCount: VISION_MODEL_FILES.length, receivedBytes: existingSize, totalBytes: existingSize, percent: 1 })
    }
    return paths
  }
  let remoteManifest: RemoteVisionModelManifest | null = null
  if (baseUrl === DEFAULT_BASE_URL || baseUrl.includes('/models/siglip2/')) {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/u, '')}/manifest.json`, { redirect: 'follow', signal: options.signal })
    if (!response.ok) throw new Error(`视觉模型清单下载失败：HTTP ${response.status} ${response.statusText}`)
    const candidate = await response.json() as Partial<RemoteVisionModelManifest>
    if (candidate.revision !== revision || !Array.isArray(candidate.files)) throw new Error('视觉模型清单无效或 revision 不匹配')
    const files = candidate.files.filter((file): file is { relativePath: string; sha256: string; sizeBytes: number } => typeof file?.relativePath === 'string' && typeof file.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(file.sha256) && typeof file.sizeBytes === 'number' && file.sizeBytes > 0)
    if (files.length !== VISION_MODEL_FILES.length) throw new Error('视觉模型清单文件数量不匹配')
    remoteManifest = { revision, files }
  }

  for (const [index, file] of VISION_MODEL_FILES.entries()) {
    const targetPath = join(paths.modelDirectory, file)
    const existingSize = await getPositiveFileSize(targetPath)
    if (existingSize !== null) {
      emitProgress(options.onProgress, { status: 'cached', relativePath: file, fileIndex: index + 1, fileCount: VISION_MODEL_FILES.length, receivedBytes: existingSize, totalBytes: existingSize, percent: 1 })
      continue
    }
    const expected = remoteManifest?.files.find((candidate) => candidate.relativePath === file)
    await downloadFile(buildDownloadUrl(baseUrl, repository, revision, file), targetPath, file, index + 1, fetchImpl, options.signal, options.onProgress, expected)
  }
  return paths
}
