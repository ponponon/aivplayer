import { app, ipcMain } from 'electron'
import { downloadPersonMatteModel } from '../core/ai/person-matte-downloader'
import { getPersonMatteModelStatus } from '../core/ai/person-matte-model'
import { PersonMatteRuntime } from '../core/ai/person-matte-runtime'
import { buildPersonMatteTrack } from '../core/ai/person-matte-track'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { PersonMatteModelDownloadResult, PersonMatteModelStatus, PersonMatteTrackRequest, PersonMatteTrackResult } from '../shared/person-matte-types'
import { createMediaFile } from './media/media-protocol'
import { resolveResourcePath } from './desktop-services'

let downloadPromise: Promise<PersonMatteModelDownloadResult> | null = null
const trackPromises = new Map<string, Promise<PersonMatteTrackResult>>()

function getCurrentPersonMatteStatus(): PersonMatteModelStatus {
  return getPersonMatteModelStatus(resolveResourcePath(), app.getPath('userData'))
}

export function registerPersonMatteIpc(): void {
  ipcMain.handle(IPC_CHANNELS.PERSON_MATTE_STATUS, (): PersonMatteModelStatus => getCurrentPersonMatteStatus())
  ipcMain.handle(IPC_CHANNELS.PERSON_MATTE_DOWNLOAD, async (event): Promise<PersonMatteModelDownloadResult> => {
    if (downloadPromise) return downloadPromise
    const sender = event.sender
    downloadPromise = (async () => {
      try {
        await downloadPersonMatteModel({
          modelRoot: app.getPath('userData'),
          onProgress: (progress) => {
            if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.PERSON_MATTE_DOWNLOAD_PROGRESS, progress)
          }
        })
        const status = getCurrentPersonMatteStatus()
        return { success: status.available, message: status.available ? '人物抠像模型下载完成' : status.message, status }
      } catch (error) {
        const status = getCurrentPersonMatteStatus()
        return { success: false, message: error instanceof Error ? error.message : String(error), status }
      } finally {
        downloadPromise = null
      }
    })()
    return downloadPromise
  })
  ipcMain.handle(IPC_CHANNELS.PERSON_MATTE_TRACK, async (event, request: PersonMatteTrackRequest): Promise<PersonMatteTrackResult> => {
    const key = [request.sourceFingerprint, request.sourceStartSeconds, request.sourceEndSeconds, request.sampleFps ?? 'default'].join('|')
    const existing = trackPromises.get(key)
    if (existing) return existing
    const sender = event.sender
    const promise = (async (): Promise<PersonMatteTrackResult> => {
      const baseResult = { sourceFingerprint: request.sourceFingerprint, sourceStartSeconds: request.sourceStartSeconds, sourceEndSeconds: request.sourceEndSeconds, sampleFps: request.sampleFps ?? 15 }
      try {
        const status = getCurrentPersonMatteStatus()
        if (!status.available) return { success: false, message: status.message, ...baseResult, frames: [] }
        const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)
        if (!ffmpegPath) return { success: false, message: '找不到 FFmpeg，无法生成人物抠像轨道', ...baseResult, frames: [] }
        const runtime = new PersonMatteRuntime({ resourcePath: resolveResourcePath(), userDataPath: app.getPath('userData') })
        const track = await buildPersonMatteTrack({
          ffmpegPath,
          sourcePath: request.sourcePath,
          sourceFingerprint: request.sourceFingerprint,
          sourceStartSeconds: request.sourceStartSeconds,
          sourceEndSeconds: request.sourceEndSeconds,
          sampleFps: request.sampleFps,
          cacheRoot: app.getPath('userData'),
          runtime,
          onProgress: (progress) => {
            if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.PERSON_MATTE_TRACK_PROGRESS, progress)
          }
        })
        return { success: true, message: '人物抠像轨道已就绪', sourceFingerprint: track.sourceFingerprint, sourceStartSeconds: track.sourceStartSeconds, sourceEndSeconds: track.sourceEndSeconds, sampleFps: track.sampleFps, frames: track.frames.map((frame) => ({ sourceSeconds: frame.sourceSeconds, url: createMediaFile(frame.path).url })) }
      } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : String(error), ...baseResult, frames: [] }
      }
    })()
    trackPromises.set(key, promise)
    void promise.finally(() => trackPromises.delete(key))
    return promise
  })
}
