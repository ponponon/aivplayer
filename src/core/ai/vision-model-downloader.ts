import { mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  VISION_MODEL_BASE_URL,
  VISION_MODEL_FILES,
  VISION_MODEL_REPOSITORY,
  VISION_MODEL_REVISION,
  type VisionModelDownloadProgress
} from '../../shared/vision-types'
import { getVisionUserDataModelPaths, type VisionModelPaths } from './vision-model'
import { downloadVerifiedFile, fetchRemoteModelManifest, getVerifiedFileSize, invalidateFileCache, type RemoteModelManifestFile } from './model-download-utils'

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

function buildDownloadUrl(baseUrl: string, repository: string, revision: string, relativePath: string): string {
  if (baseUrl.includes('{repository}') || baseUrl.includes('{revision}')) {
    return baseUrl
      .replaceAll('{repository}', repository)
      .replaceAll('{revision}', revision)
      .replace(/\/$/u, '') + `/${relativePath}`
  }
  if (usesRemoteManifest(baseUrl)) {
    return `${baseUrl.replace(/\/$/u, '')}/${relativePath}`
  }
  const encodedPath = relativePath.split('/').map((part) => encodeURIComponent(part)).join('/')
  return `${baseUrl.replace(/\/$/u, '')}/${repository}/resolve/${revision}/${encodedPath}`
}

function usesRemoteManifest(baseUrl: string): boolean {
  return baseUrl === DEFAULT_BASE_URL || baseUrl.includes('/models/siglip2/')
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
  expected: RemoteModelManifestFile | undefined
): Promise<void> {
  const result = await downloadVerifiedFile({
    url: fileUrl,
    targetPath,
    expected,
    fetchImpl,
    signal,
    onProgress: ({ receivedBytes, totalBytes }) => {
      emitProgress(onProgress, {
        status: 'downloading',
        relativePath: file,
        fileIndex,
        fileCount: VISION_MODEL_FILES.length,
        receivedBytes,
        totalBytes: totalBytes ?? expected?.sizeBytes ?? null,
        percent: toPercent(receivedBytes, totalBytes ?? expected?.sizeBytes ?? null)
      })
    }
  })
  emitProgress(onProgress, {
    status: 'completed',
    relativePath: file,
    fileIndex,
    fileCount: VISION_MODEL_FILES.length,
    receivedBytes: result.sizeBytes,
    totalBytes: result.sizeBytes,
    percent: 1
  })
}

export async function downloadVisionModel(options: DownloadVisionModelOptions): Promise<VisionModelPaths> {
  const paths = getVisionUserDataModelPaths(options.modelRoot)
  const repository = options.repository ?? process.env.VISION_MODEL_REPOSITORY ?? VISION_MODEL_REPOSITORY
  const revision = options.revision ?? process.env.VISION_MODEL_REVISION ?? VISION_MODEL_REVISION
  const baseUrl = options.baseUrl ?? process.env.HF_ENDPOINT ?? DEFAULT_BASE_URL
  const fetchImpl = options.fetchImpl ?? fetch
  let remoteManifest: { revision: string; files: RemoteModelManifestFile[] } | null = null

  // 默认 R2 清单必须先于缓存判断，避免旧版本或损坏文件被“非空”判断误认为可用。
  if (usesRemoteManifest(baseUrl)) {
    remoteManifest = await fetchRemoteModelManifest({
      url: `${baseUrl.replace(/\/$/u, '')}/manifest.json`,
      revision,
      expectedRelativePaths: VISION_MODEL_FILES,
      fetchImpl,
      signal: options.signal,
      label: '视觉模型'
    })
  }

  for (const [index, file] of VISION_MODEL_FILES.entries()) {
    const targetPath = join(paths.modelDirectory, file)
    const expected = remoteManifest?.files.find((candidate) => candidate.relativePath === file)
    const cachedSize = expected
      ? await getVerifiedFileSize(targetPath, expected)
      : await getPositiveFileSize(targetPath)

    if (cachedSize !== null) {
      emitProgress(options.onProgress, {
        status: 'cached',
        relativePath: file,
        fileIndex: index + 1,
        fileCount: VISION_MODEL_FILES.length,
        receivedBytes: cachedSize,
        totalBytes: cachedSize,
        percent: 1
      })
      continue
    }

    await invalidateFileCache(targetPath)
    await ensureParentDirectory(targetPath)
    await downloadFile(
      buildDownloadUrl(baseUrl, repository, revision, file),
      targetPath,
      file,
      index + 1,
      fetchImpl,
      options.signal,
      options.onProgress,
      expected
    )
  }
  return paths
}
