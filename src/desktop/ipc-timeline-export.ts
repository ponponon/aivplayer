import { app, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MediaClipExportResult, MediaTimelineExportPathRequest, MediaTimelineExportPathResult, MediaTimelineExportRequest } from '../shared/media-types'
import { getAppCopy } from '../shared/i18n'
import { buildTimelineExportDefaultVideoPath, runTimelineExport, type TimelineExportPersonMatteTrack } from '../core/media/timeline-export'
import { buildPersonMatteTrack } from '../core/ai/person-matte-track'
import { PersonMatteRuntime } from '../core/ai/person-matte-runtime'
import { getPersonMatteModelStatus } from '../core/ai/person-matte-model'
import { createMediaProbeMetadata } from '../core/media/media-metadata'
import { createMediaFile } from './media/media-protocol'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { promptForSavePath } from './media-dialogs'
import { getCurrentLocale } from './desktop-settings'
import { resolveResourcePath } from './desktop-services'
import { renderTimelineGraphicAssets } from './timeline-graphic-rasterizer'
import { probeFfmpegCapabilities } from '../core/media/ffmpeg-capabilities'

export function registerTimelineExportIpc(): void {
  const chooseTimelineExportPath = async (request: MediaTimelineExportPathRequest): Promise<MediaTimelineExportPathResult> => {
    const copy = getAppCopy(getCurrentLocale())
    const durationSeconds = Math.max(0, Number.isFinite(request.durationSeconds) ? request.durationSeconds : 0)
    const defaultVideoPath = request.suggestedPath?.trim() || buildTimelineExportDefaultVideoPath(request.mediaPath, request.clipCount, durationSeconds, request.mode)
    const selectedVideoPath = await promptForSavePath({ title: copy.runtimeDialog.clipExportSaveTitle, defaultPath: defaultVideoPath, buttonLabel: copy.runtimeDialog.clipExportSaveConfirm, filters: [{ name: 'MP4 video', extensions: ['mp4'] }] })
    return selectedVideoPath ? { success: true, message: '', filePath: selectedVideoPath, canceled: false } : { success: false, message: '', canceled: true }
  }

  ipcMain.handle(IPC_CHANNELS.MEDIA_CHOOSE_TIMELINE_EXPORT_PATH, async (_event, request: MediaTimelineExportPathRequest): Promise<MediaTimelineExportPathResult> => chooseTimelineExportPath(request))

  ipcMain.handle(IPC_CHANNELS.MEDIA_GET_FFMPEG_CAPABILITIES, async (): Promise<import('../shared/media-types').MediaFfmpegCapabilities> => {
    const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)
    return ffmpegPath ? probeFfmpegCapabilities(ffmpegPath) : { available: false, subtitleBurnIn: false, subtitleFilter: null }
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_EXPORT_TIMELINE, async (_event, request: MediaTimelineExportRequest): Promise<MediaClipExportResult> => {
    const copy = getAppCopy(getCurrentLocale())
    const resourcePath = resolveResourcePath()
    const ffmpegPath = await resolveFfmpegPath(resourcePath, process.env, undefined)
    if (!ffmpegPath) return { success: false, message: copy.runtime.ffmpegMissing, canceled: false }
    if (request.mode === 'burn-subtitle' && !(await probeFfmpegCapabilities(ffmpegPath)).subtitleBurnIn) return { success: false, message: copy.runtime.clipExportSubtitleBurnInUnavailable, canceled: false }
    const durationSeconds = request.clips.reduce((total, clip) => total + Math.max(0, clip.endSeconds - clip.startSeconds), 0)
    const selectedVideoPath = request.outputVideoPath?.trim() || (await chooseTimelineExportPath({ mediaPath: request.mediaPath, clipCount: request.clips.length, durationSeconds, mode: request.mode })).filePath
    if (!selectedVideoPath) return { success: false, message: '', canceled: true }
    try {
      const mediaPaths = [...new Set([...request.clips.map((clip) => clip.mediaPath), ...(request.videoBlocks ?? []).map((block) => block.mediaPath)])]
      const metadataEntries = await Promise.all(mediaPaths.map(async (mediaPath) => [mediaPath, await createMediaProbeMetadata(mediaPath, { resourcePath, env: process.env }).catch(() => null)] as const))
      const metadataByPath = new Map(metadataEntries)
      const primaryMetadata = metadataByPath.get(request.mediaPath)
      const clips = request.clips.map((clip) => {
        const metadata = metadataByPath.get(clip.mediaPath)
        return { ...clip, hasAudio: metadata == null ? undefined : metadata.audio !== null }
      })
      const personMatteTrackPromises = new Map<string, Promise<TimelineExportPersonMatteTrack>>()
      const exportClips = await Promise.all(clips.map(async (clip) => {
        if (!clip.personMatte?.enabled) return clip
        const fingerprint = clip.personMatteSourceFingerprint?.trim()
        if (!fingerprint) throw new Error('人物抠像片段缺少素材指纹，无法导出')
        const userDataPath = app.getPath('userData')
        const status = getPersonMatteModelStatus(resourcePath, userDataPath)
        if (!status.available) throw new Error(status.message)
        const key = [fingerprint, clip.startSeconds, clip.endSeconds].join('|')
        let trackPromise = personMatteTrackPromises.get(key)
        if (!trackPromise) {
          const runtime = new PersonMatteRuntime({ resourcePath, userDataPath })
          trackPromise = buildPersonMatteTrack({ ffmpegPath, sourcePath: clip.mediaPath, sourceFingerprint: fingerprint, sourceStartSeconds: clip.startSeconds, sourceEndSeconds: clip.endSeconds, cacheRoot: userDataPath, runtime }).then((track) => {
            const firstFrame = track.frames[0]
            if (!firstFrame) throw new Error('人物抠像轨道为空')
            return { sampleFps: track.sampleFps, framePattern: join(dirname(firstFrame.path), 'mask-%06d.png'), frameCount: track.frames.length }
          })
          personMatteTrackPromises.set(key, trackPromise)
        }
        return { ...clip, personMatteTrack: await trackPromise }
      }))
      const result = await runTimelineExport({
        ffmpegPath,
        mediaPath: request.mediaPath,
        clips: exportClips,
        graphics: request.graphics,
        videoBlocks: request.videoBlocks,
        renderGraphics: renderTimelineGraphicAssets,
        overlayTrackOrder: request.overlayTrackOrder,
        outputVideoPath: selectedVideoPath,
        mode: request.mode,
        subtitlePath: request.subtitlePath,
        subtitleSrtPath: request.subtitleSrtPath,
        subtitleText: request.subtitleText,
        subtitleAssText: request.subtitleAssText,
        subtitleRender: request.subtitleRender,
        frameId: request.frameId,
        outputFormat: { width: request.targetWidth ?? primaryMetadata?.video?.width ?? undefined, height: request.targetHeight ?? primaryMetadata?.video?.height ?? undefined, fitMode: request.fitMode ?? 'contain', frameRate: primaryMetadata?.video?.frameRate ?? undefined, audioSampleRate: 48000, audioChannels: 2 },
        getLocale: getCurrentLocale
      })
      const videoFile = createMediaFile(result.videoPath)
      const subtitleSrtFile = result.subtitleSrtPath ? createMediaFile(result.subtitleSrtPath) : null
      const message = request.mode === 'burn-subtitle' ? copy.runtime.clipExportBurnedSuccess : request.mode === 'external-subtitle' ? copy.runtime.clipExportWithSubtitleSuccess : copy.runtime.clipExportSuccess
      return { success: true, message, videoPath: result.videoPath, videoUrl: videoFile.url, subtitleSrtPath: subtitleSrtFile?.path, subtitleSrtUrl: subtitleSrtFile?.url }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), canceled: false }
    }
  })
}
