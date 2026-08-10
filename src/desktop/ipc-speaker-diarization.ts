import { execFile } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { app, ipcMain } from 'electron'
import { buildFfmpegAudioExtractArgs } from '../core/ai/asr-subtitle-job'
import { createSpeakerDiarizationEvidence } from '../core/ai/speaker-diarization-evidence'
import { getSpeakerDiarizationModelStatus } from '../core/ai/speaker-diarization-model'
import { SpeakerDiarizationRuntime } from '../core/ai/speaker-diarization-runtime'
import { createVisionSourceFingerprint, createVisionSourceId } from '../core/ai/vision-evidence'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { SpeakerDiarizationCatalogPatch } from '../shared/speaker-diarization-catalog-types'
import type { SpeakerDiarizationEvidenceBatchClearRequest, SpeakerDiarizationEvidenceBatchClearResult, SpeakerDiarizationEvidenceClearResult, SpeakerDiarizationEvidenceSource, SpeakerDiarizationEvidenceSourceRequest, SpeakerDiarizationModelStatus, SpeakerDiarizationRunRequest, SpeakerDiarizationRunResult } from '../shared/speaker-diarization-types'
import { getSpeakerDiarizationCatalogStore, getVisionLibrary, resolveResourcePath } from './desktop-services'
import { desktopState } from './desktop-state'

const execFileAsync = promisify(execFile)
const runPromises = new Map<string, Promise<SpeakerDiarizationRunResult>>()
const MAX_SPEAKER_EVIDENCE_BATCH = 500

function emptyResult(): null {
  return null
}

function getCurrentSpeakerDiarizationStatus(): SpeakerDiarizationModelStatus {
  return getSpeakerDiarizationModelStatus(app.getPath('userData'), process.platform, process.arch, desktopState.currentAppSettings.vision.speakerModelDirectory)
}

function normalizeRequest(request: SpeakerDiarizationRunRequest): SpeakerDiarizationRunRequest | null {
  if (!request || typeof request.mediaPath !== 'string' || !request.mediaPath.trim()) return null
  const numberOption = (value: unknown, minimum: number): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= minimum ? value : undefined
  const numClusters = typeof request.numClusters === 'number' && Number.isInteger(request.numClusters) && request.numClusters >= -1 ? request.numClusters : undefined
  return {
    mediaPath: request.mediaPath,
    numClusters,
    threshold: numberOption(request.threshold, 0),
    minDurationOn: numberOption(request.minDurationOn, 0),
    minDurationOff: numberOption(request.minDurationOff, 0)
  }
}

function getFailureMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.trim()) return error.stderr.trim().slice(-1800)
  return error instanceof Error ? error.message : String(error)
}

function normalizeCatalogPatch(value: unknown): SpeakerDiarizationCatalogPatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const patch = value as Partial<SpeakerDiarizationCatalogPatch>
  if (typeof patch.sourceFingerprint !== 'string' || !patch.sourceFingerprint.trim()) return null
  if (typeof patch.videoPath !== 'string' || !patch.videoPath.trim()) return null
  if (typeof patch.fileName !== 'string') return null
  if (typeof patch.speakerId !== 'number' || !Number.isInteger(patch.speakerId) || patch.speakerId < 0) return null
  if (typeof patch.name !== 'string' || !patch.name.trim()) return null
  const aliases = Array.isArray(patch.aliases) ? patch.aliases.filter((alias): alias is string => typeof alias === 'string') : []
  return {
    sourceFingerprint: patch.sourceFingerprint.trim(),
    videoPath: patch.videoPath.trim(),
    fileName: patch.fileName.trim(),
    speakerId: patch.speakerId,
    name: patch.name,
    aliases
  }
}

export function registerSpeakerDiarizationIpc(): void {
  ipcMain.handle(IPC_CHANNELS.SPEAKER_DIARIZATION_STATUS, (): SpeakerDiarizationModelStatus => getCurrentSpeakerDiarizationStatus())
  ipcMain.handle(IPC_CHANNELS.SPEAKER_DIARIZATION_RUN, async (_event, request: SpeakerDiarizationRunRequest): Promise<SpeakerDiarizationRunResult> => {
    const normalized = normalizeRequest(request)
    const status = getCurrentSpeakerDiarizationStatus()
    if (!normalized) return { success: false, message: '说话人分段请求无效', status, result: emptyResult(), evidencePersisted: false, evidenceCount: 0 }
    const key = JSON.stringify(normalized)
    const existing = runPromises.get(key)
    if (existing) return existing

    const promise = (async (): Promise<SpeakerDiarizationRunResult> => {
      const temporaryDirectory = await mkdtemp(join(app.getPath('temp'), 'aivplayer-speaker-diarization-'))
      const audioPath = join(temporaryDirectory, 'audio.wav')
      try {
        if (!status.available) return { success: false, message: status.message, status, result: emptyResult(), evidencePersisted: false, evidenceCount: 0 }
        const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)
        if (!ffmpegPath) return { success: false, message: '找不到 FFmpeg，无法执行说话人分段', status, result: emptyResult(), evidencePersisted: false, evidenceCount: 0 }
        await execFileAsync(ffmpegPath, buildFfmpegAudioExtractArgs(normalized.mediaPath, audioPath), { maxBuffer: 4 * 1024 * 1024 })
        const runtime = new SpeakerDiarizationRuntime({ userDataPath: app.getPath('userData'), modelDirectory: desktopState.currentAppSettings.vision.speakerModelDirectory })
        await runtime.prepare()
        const result = await runtime.diarizeWaveFile(audioPath, normalized)
        let evidencePersisted = false
        let evidenceCount = 0
        let sourceFingerprint: string | undefined
        let evidenceMessage: string | undefined
        try {
          const sourceFile = await stat(normalized.mediaPath)
          sourceFingerprint = createVisionSourceFingerprint(normalized.mediaPath, sourceFile.size, sourceFile.mtimeMs)
          const evidence = createSpeakerDiarizationEvidence({
            sourceId: createVisionSourceId(normalized.mediaPath),
            videoPath: normalized.mediaPath,
            fileName: basename(normalized.mediaPath),
            sourceFingerprint,
            durationSeconds: result.durationSeconds,
            segments: result.segments
          })
          await getVisionLibrary().replaceSpeakerEvidence(normalized.mediaPath, evidence)
          evidencePersisted = true
          evidenceCount = evidence.length
        } catch (error) {
          evidenceMessage = error instanceof Error ? error.message : String(error)
        }
        return {
          success: true,
          message: evidencePersisted ? `说话人分段完成，已写入 ${evidenceCount} 条视觉证据` : '说话人分段完成，但视觉证据未写入',
          status: runtime.getStatus(),
          result,
          evidencePersisted,
          evidenceCount,
          sourceFingerprint: evidencePersisted ? sourceFingerprint : undefined,
          evidenceMessage
        }
      } catch (error) {
        return { success: false, message: getFailureMessage(error), status, result: emptyResult(), evidencePersisted: false, evidenceCount: 0 }
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
      }
    })()
    runPromises.set(key, promise)
    void promise.finally(() => runPromises.delete(key))
    return promise
  })
  ipcMain.handle(IPC_CHANNELS.SPEAKER_DIARIZATION_CLEAR_EVIDENCE, async (_event, value: unknown): Promise<SpeakerDiarizationEvidenceClearResult> => {
    const mediaPath = typeof value === 'string' ? value.trim() : ''
    if (!mediaPath) return { success: false, message: '说话人证据清理请求无效' }
    try {
      await getVisionLibrary().clearSpeakerEvidence(mediaPath)
      return { success: true, message: '当前视频的说话人证据已清理' }
    } catch (error) {
      return { success: false, message: getFailureMessage(error) }
    }
  })
  ipcMain.handle(IPC_CHANNELS.SPEAKER_DIARIZATION_EVIDENCE_SOURCES, (_event, value: SpeakerDiarizationEvidenceSourceRequest = {}): Promise<SpeakerDiarizationEvidenceSource[]> => {
    const limit = typeof value?.limit === 'number' && Number.isFinite(value.limit) ? value.limit : undefined
    const offset = typeof value?.offset === 'number' && Number.isFinite(value.offset) ? value.offset : undefined
    return getVisionLibrary().listSpeakerEvidenceSources(limit, offset)
  })
  ipcMain.handle(IPC_CHANNELS.SPEAKER_DIARIZATION_BATCH_CLEAR_EVIDENCE, async (_event, value: unknown): Promise<SpeakerDiarizationEvidenceBatchClearResult> => {
    const request = value as Partial<SpeakerDiarizationEvidenceBatchClearRequest> | null
    const mediaPaths = Array.isArray(request?.mediaPaths)
      ? request.mediaPaths.filter((path): path is string => typeof path === 'string').map((path) => path.trim()).filter(Boolean)
      : []
    const uniqueMediaPaths = [...new Set(mediaPaths)]
    if (uniqueMediaPaths.length === 0) return { success: false, message: '说话人证据清理列表为空', clearedSources: 0, clearedEvidenceCount: 0 }
    if (uniqueMediaPaths.length > MAX_SPEAKER_EVIDENCE_BATCH) return { success: false, message: `一次最多清理 ${MAX_SPEAKER_EVIDENCE_BATCH} 个视频`, clearedSources: 0, clearedEvidenceCount: 0 }
    try {
      return await getVisionLibrary().clearSpeakerEvidenceBatch(uniqueMediaPaths)
    } catch (error) {
      return { success: false, message: getFailureMessage(error), clearedSources: 0, clearedEvidenceCount: 0 }
    }
  })
  ipcMain.handle(IPC_CHANNELS.SPEAKER_DIARIZATION_CATALOG_GET, () => getSpeakerDiarizationCatalogStore().get())
  ipcMain.handle(IPC_CHANNELS.SPEAKER_DIARIZATION_CATALOG_UPDATE, async (_event, value: unknown) => {
    const patch = normalizeCatalogPatch(value)
    const store = getSpeakerDiarizationCatalogStore()
    const nextCatalog = patch ? store.update(patch) : store.get()
    await store.flush()
    return nextCatalog
  })
}
