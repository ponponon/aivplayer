import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { app, ipcMain } from 'electron'
import { buildFfmpegAudioExtractArgs } from '../core/ai/asr-subtitle-job'
import { getSpeakerDiarizationModelStatus } from '../core/ai/speaker-diarization-model'
import { SpeakerDiarizationRuntime } from '../core/ai/speaker-diarization-runtime'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { SpeakerDiarizationModelStatus, SpeakerDiarizationRunRequest, SpeakerDiarizationRunResult } from '../shared/speaker-diarization-types'
import { resolveResourcePath } from './desktop-services'

const execFileAsync = promisify(execFile)
const runPromises = new Map<string, Promise<SpeakerDiarizationRunResult>>()

function emptyResult(): null {
  return null
}

function getCurrentSpeakerDiarizationStatus(): SpeakerDiarizationModelStatus {
  return getSpeakerDiarizationModelStatus(app.getPath('userData'))
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

export function registerSpeakerDiarizationIpc(): void {
  ipcMain.handle(IPC_CHANNELS.SPEAKER_DIARIZATION_STATUS, (): SpeakerDiarizationModelStatus => getCurrentSpeakerDiarizationStatus())
  ipcMain.handle(IPC_CHANNELS.SPEAKER_DIARIZATION_RUN, async (_event, request: SpeakerDiarizationRunRequest): Promise<SpeakerDiarizationRunResult> => {
    const normalized = normalizeRequest(request)
    const status = getCurrentSpeakerDiarizationStatus()
    if (!normalized) return { success: false, message: '说话人分段请求无效', status, result: emptyResult() }
    const key = JSON.stringify(normalized)
    const existing = runPromises.get(key)
    if (existing) return existing

    const promise = (async (): Promise<SpeakerDiarizationRunResult> => {
      const temporaryDirectory = await mkdtemp(join(app.getPath('temp'), 'aivplayer-speaker-diarization-'))
      const audioPath = join(temporaryDirectory, 'audio.wav')
      try {
        if (!status.available) return { success: false, message: status.message, status, result: emptyResult() }
        const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)
        if (!ffmpegPath) return { success: false, message: '找不到 FFmpeg，无法执行说话人分段', status, result: emptyResult() }
        await execFileAsync(ffmpegPath, buildFfmpegAudioExtractArgs(normalized.mediaPath, audioPath), { maxBuffer: 4 * 1024 * 1024 })
        const runtime = new SpeakerDiarizationRuntime({ userDataPath: app.getPath('userData') })
        await runtime.prepare()
        const result = await runtime.diarizeWaveFile(audioPath, normalized)
        return { success: true, message: '说话人分段完成', status: runtime.getStatus(), result }
      } catch (error) {
        return { success: false, message: getFailureMessage(error), status, result: emptyResult() }
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
      }
    })()
    runPromises.set(key, promise)
    void promise.finally(() => runPromises.delete(key))
    return promise
  })
}
