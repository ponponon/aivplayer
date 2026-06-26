import { open, rename, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  AsrModelDownloadProgress,
  AsrModelInfo,
  AsrModelManifest,
  AsrModelDownloadSource,
  AsrModelSourceId
} from '../../shared/media-types.ts'
import {
  findWhisperModelManifest,
  getRecommendedWhisperModelManifest,
  selectWhisperModelDownloadSource
} from './asr-models.ts'
import { ensureModelDirectory, getWhisperModelPath, pathExists } from './model-manager.ts'

export type DownloadWhisperModelOptions = {
  modelDirectory: string
  modelId?: string
  sourceId?: AsrModelSourceId
  fetchImpl?: typeof fetch
  onProgress?: (progress: AsrModelDownloadProgress) => void
}

function toPercent(receivedBytes: number, totalBytes: number | null): number | null {
  if (!totalBytes || totalBytes <= 0) {
    return null
  }

  return Math.min(1, receivedBytes / totalBytes)
}

function toModelInfo(manifest: AsrModelManifest, modelPath: string, sizeBytes: number): AsrModelInfo {
  return {
    id: manifest.id,
    name: manifest.name,
    path: modelPath,
    sizeBytes
  }
}

function emitProgress(
  manifest: AsrModelManifest,
  source: AsrModelDownloadSource,
  onProgress: ((progress: AsrModelDownloadProgress) => void) | undefined,
  receivedBytes: number,
  totalBytes: number | null,
  message: string
): void {
  onProgress?.({
    modelId: manifest.id,
    fileName: manifest.fileName,
    sourceId: source.id,
    sourceName: source.name,
    receivedBytes,
    totalBytes,
    percent: toPercent(receivedBytes, totalBytes),
    message
  })
}

export async function downloadWhisperModel(options: DownloadWhisperModelOptions): Promise<AsrModelInfo> {
  const manifest = options.modelId
    ? findWhisperModelManifest(options.modelId) ?? getRecommendedWhisperModelManifest()
    : getRecommendedWhisperModelManifest()
  const source = selectWhisperModelDownloadSource(manifest, options.sourceId)
  const fetchImpl = options.fetchImpl ?? fetch
  const modelPath = getWhisperModelPath(options.modelDirectory, manifest)

  await ensureModelDirectory(dirname(modelPath))

  if (await pathExists(modelPath)) {
    const modelStat = await stat(modelPath)
    emitProgress(manifest, source, options.onProgress, modelStat.size, modelStat.size, '模型已存在，直接使用本地缓存。')
    return toModelInfo(manifest, modelPath, modelStat.size)
  }

  const tempPath = join(options.modelDirectory, `${manifest.fileName}.download`)
  await unlink(tempPath).catch(() => undefined)

  emitProgress(manifest, source, options.onProgress, 0, manifest.expectedSizeBytes, `开始从 ${source.name} 下载 ASR 模型。`)

  const response = await fetchImpl(source.url)

  if (!response.ok) {
    throw new Error(`模型下载失败：HTTP ${response.status} ${response.statusText}`)
  }

  const contentLength = Number(response.headers.get('content-length'))
  const totalBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : manifest.expectedSizeBytes
  const file = await open(tempPath, 'w')
  let receivedBytes = 0

  try {
    if (!response.body) {
      const content = new Uint8Array(await response.arrayBuffer())
      await file.write(content)
      receivedBytes = content.byteLength
      emitProgress(manifest, source, options.onProgress, receivedBytes, totalBytes, '模型下载中。')
    } else {
      const reader = response.body.getReader()

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        if (value) {
          await file.write(value)
          receivedBytes += value.byteLength
          emitProgress(manifest, source, options.onProgress, receivedBytes, totalBytes, '模型下载中。')
        }
      }
    }
  } finally {
    await file.close()
  }

  await rename(tempPath, modelPath)
  emitProgress(manifest, source, options.onProgress, receivedBytes, totalBytes, '模型下载完成。')

  return toModelInfo(manifest, modelPath, receivedBytes)
}
