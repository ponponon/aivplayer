import { serializeEditingCaptionsToSrt } from '../../../core/editing/caption-serialization'
import { buildAssSubtitleFromEditingCaptions } from '../../../core/media/subtitle-ass'
import type { ClipExportMode } from '../../../shared/clip-export'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

export async function exportEditingTimeline(model: AppModel, derived: AppDerived, requestedMode?: ClipExportMode, outputVideoPath?: string): Promise<void> {
  const project = model.editingProject
  const primarySource = project?.sources[0]
  if (!project || !primarySource || project.videoClips.length === 0 || model.isExportingClip) return
  const sourceById = new Map(project.sources.map((source) => [source.id, source.path]))
  const clips = project.videoClips.flatMap((clip) => {
    const mediaPath = sourceById.get(clip.sourceId)
    return mediaPath ? [{ mediaPath, startSeconds: clip.sourceStartSeconds, endSeconds: clip.sourceEndSeconds, volume: clip.volume, muted: clip.muted, treatment: clip.treatment, treatmentScale: clip.treatmentScale, treatmentAnchor: clip.treatmentAnchor, filter: clip.filter, transitionIn: clip.transitionIn }] : []
  })
  const videoBlocks = (project.videoBlocks ?? []).flatMap((block) => {
    const mediaPath = sourceById.get(block.sourceId)
    return mediaPath ? [{ mediaPath, sourceStartSeconds: block.sourceStartSeconds, sourceEndSeconds: block.sourceEndSeconds, startSeconds: block.startSeconds, durationSeconds: block.durationSeconds, position: block.position, sizePercent: block.sizePercent, borderRadius: block.borderRadius, borderWidth: block.borderWidth, enterMotion: block.enterMotion, exitMotion: block.exitMotion, motionDurationSeconds: block.motionDurationSeconds }] : []
  })
  if (clips.length === 0) return
  const subtitleText = serializeEditingCaptionsToSrt(project.captions)
  const hasProjectSubtitle = subtitleText.length > 0
  const mode = hasProjectSubtitle || derived.hasClipExportSubtitle ? requestedMode ?? model.appSettings.capture.clipExportMode : 'video'
  const subtitleAssText = hasProjectSubtitle && mode === 'burn-subtitle'
    ? buildAssSubtitleFromEditingCaptions(project.captions, { ...model.appSettings.subtitles, playResX: primarySource.width, playResY: primarySource.height })
    : undefined
  model.setIsExportingClip(true)
  try {
    const result = await window.aiv.exportMediaTimeline({ mediaPath: primarySource.path, clips, graphics: project.graphics, videoBlocks, mode, subtitleText: hasProjectSubtitle ? subtitleText : undefined, subtitleAssText, subtitlePath: hasProjectSubtitle ? undefined : derived.subtitlePath ?? undefined, subtitleSrtPath: hasProjectSubtitle ? undefined : derived.subtitleSrtPath ?? undefined, subtitleRender: model.appSettings.subtitles, targetWidth: primarySource.width, targetHeight: primarySource.height, outputVideoPath })
    if (!result.canceled) model.setAsrNotice(result)
  } catch (error) {
    model.setAsrNotice({ success: false, message: `${derived.copy.runtime.clipExportFailed}：${error instanceof Error ? error.message : String(error)}` })
  } finally {
    model.setIsExportingClip(false)
  }
}
