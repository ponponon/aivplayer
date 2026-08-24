import { dirname } from 'node:path'
import type {
  AsrModelDownloadProgress,
  AsrModelInfo,
  AsrModelManifest,
  AsrModelDownloadSource,
  AsrModelSourceId
} from '../../shared/media-types.ts'
import type { AppLocale } from '../../shared/localization'
import { getAppCopy } from '../../shared/i18n'
import {
  findWhisperModelManifest,
  getRecommendedWhisperModelManifest,
  selectWhisperModelDownloadSource
} from './asr-models.ts'
import { downloadVerifiedFile, getVerifiedFileSize, invalidateFileCache } from './model-download-utils'
import { ensureModelDirectory, getWhisperModelPath } from './model-manager.ts'

export type DownloadWhisperModelOptions = {
  modelDirectory: string
  modelId?: string
  sourceId?: AsrModelSourceId
  manifest?: AsrModelManifest
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  onProgress?: (progress: AsrModelDownloadProgress) => void
  getLocale?: () => AppLocale
}

function toPercent(receivedBytes: number, totalBytes: number | null): number | null {
  if (!totalBytes || totalBytes <= 0) return null
  return Math.min(1, receivedBytes / totalBytes)
}

function toModelInfo(manifest: AsrModelManifest, modelPath: string, sizeBytes: number): AsrModelInfo {
  return { id: manifest.id, name: manifest.name, path: modelPath, sizeBytes }
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

function getExpectedSha256(manifest: AsrModelManifest): string | undefined {
  return manifest.sha256 ?? manifest.sources.find((source) => source.sha256)?.sha256
}

export async function downloadWhisperModel(options: DownloadWhisperModelOptions): Promise<AsrModelInfo> {
  const copy = getAppCopy(options.getLocale?.())
  const manifest = options.manifest ?? (options.modelId
    ? findWhisperModelManifest(options.modelId) ?? getRecommendedWhisperModelManifest()
    : getRecommendedWhisperModelManifest())
  const sources = options.sourceId
    ? [selectWhisperModelDownloadSource(manifest, options.sourceId)]
    : manifest.sources
  if (sources.length === 0) throw new Error(`未找到模型下载源：${manifest.id}。`)

  const fetchImpl = options.fetchImpl ?? fetch
  const modelPath = getWhisperModelPath(options.modelDirectory, manifest)
  const expected = { sizeBytes: manifest.expectedSizeBytes, sha256: getExpectedSha256(manifest) }

  await ensureModelDirectory(dirname(modelPath))

  const cachedSize = await getVerifiedFileSize(modelPath, expected)
  if (cachedSize !== null) {
    emitProgress(manifest, sources[0]!, options.onProgress, cachedSize, cachedSize, copy.runtime.modelAlreadyCached)
    return toModelInfo(manifest, modelPath, cachedSize)
  }
  await invalidateFileCache(modelPath)

  const failures: string[] = []
  for (const source of sources) {
    emitProgress(manifest, source, options.onProgress, 0, manifest.expectedSizeBytes, copy.runtime.modelDownloadStart(source.name))
    try {
      const result = await downloadVerifiedFile({
        url: source.url,
        targetPath: modelPath,
        expected,
        fetchImpl,
        signal: options.signal,
        onProgress: ({ receivedBytes, totalBytes }) => {
          emitProgress(manifest, source, options.onProgress, receivedBytes, totalBytes, copy.runtime.modelDownloading)
        }
      })
      emitProgress(manifest, source, options.onProgress, result.sizeBytes, result.sizeBytes, copy.runtime.modelDownloadComplete)
      return toModelInfo(manifest, modelPath, result.sizeBytes)
    } catch (error) {
      if (options.signal?.aborted) throw error
      await invalidateFileCache(modelPath)
      const reason = error instanceof Error ? error.message : String(error)
      failures.push(`${source.name}: ${reason}`)
    }
  }

  throw new Error(`模型下载失败，已尝试 ${sources.map((source) => source.name).join('、')}。${failures.join('；')}`)
}
