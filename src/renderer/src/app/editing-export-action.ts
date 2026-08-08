import { getEditingCaptionsForSubtitleExport, serializeEditingCaptionsToSrt } from '../../../core/editing/caption-serialization'
import { getEditingCanvasDimensions } from '../../../core/editing/canvases'
import { getEditingCaptionLayout } from '../../../core/editing/caption-layout'
import { buildAssSubtitleFromEditingCaptions } from '../../../core/media/subtitle-ass'
import type { TimelineExportMode } from '../../../shared/clip-export'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

export async function exportEditingTimeline(model: AppModel, derived: AppDerived, requestedMode?: TimelineExportMode, outputVideoPath?: string): Promise<void> {
  const project = model.editingProject
  const primarySource = project?.sources[0]
  if (!project || !primarySource || project.videoClips.length === 0 || model.isExportingClip) return
  const canvas = getEditingCanvasDimensions(project.canvasPreset ?? 'source', primarySource.width, primarySource.height)
  const captionLayout = getEditingCaptionLayout(project.captionLayout)
  const sourceById = new Map(project.sources.map((source) => [source.id, source.path]))
  const clips = project.videoClips.flatMap((clip) => {
    const mediaPath = sourceById.get(clip.sourceId)
    const source = project.sources.find((item) => item.id === clip.sourceId)
    return mediaPath && source ? [{ mediaPath, startSeconds: clip.sourceStartSeconds, endSeconds: clip.sourceEndSeconds, volume: clip.volume, muted: clip.muted, treatment: clip.treatment, treatmentScale: clip.treatmentScale, treatmentAnchor: clip.treatmentAnchor, treatmentSize: clip.treatmentSize, filter: clip.filter, personMatte: clip.personMatte, personMatteSourceFingerprint: source.fingerprint, transitionIn: clip.transitionIn, enterMotion: clip.enterMotion, exitMotion: clip.exitMotion, motionDurationSeconds: clip.motionDurationSeconds }] : []
  })
  const videoBlocks = (project.videoBlocks ?? []).flatMap((block) => {
    const mediaPath = sourceById.get(block.sourceId)
    return mediaPath ? [{ mediaPath, sourceStartSeconds: block.sourceStartSeconds, sourceEndSeconds: block.sourceEndSeconds, startSeconds: block.startSeconds, durationSeconds: block.durationSeconds, position: block.position, sizePercent: block.sizePercent, borderRadius: block.borderRadius, borderWidth: block.borderWidth, enterMotion: block.enterMotion, exitMotion: block.exitMotion, motionDurationSeconds: block.motionDurationSeconds }] : []
  })
  if (clips.length === 0) return
  const configuredMode = requestedMode ?? model.appSettings.capture.clipExportMode
  const exportKind = configuredMode === 'translation-subtitle' ? 'translation' : 'source'
  const exportCaptions = getEditingCaptionsForSubtitleExport(project, exportKind)
  const subtitleText = serializeEditingCaptionsToSrt(exportCaptions, exportKind)
  const hasProjectSubtitle = subtitleText.length > 0
  const hasRequestedSubtitle = configuredMode === 'translation-subtitle' ? hasProjectSubtitle : hasProjectSubtitle || derived.hasClipExportSubtitle
  const mode = hasRequestedSubtitle ? configuredMode : 'video'
  const subtitleAssText = hasProjectSubtitle && mode === 'burn-subtitle'
    ? buildAssSubtitleFromEditingCaptions(exportCaptions, { ...model.appSettings.subtitles, fontSizePx: captionLayout.fontSizePx, effect: project.captionEffect ?? 'none', includeTranslation: model.appSettings.subtitles.displayMode !== 'source', captionLayout, playResX: canvas.width, playResY: canvas.height })
    : undefined
  model.setIsExportingClip(true)
  try {
    const result = await window.aiv.exportMediaTimeline({ mediaPath: primarySource.path, clips, graphics: project.graphics, videoBlocks, frameId: project.frameId, overlayTrackOrder: project.overlayTrackOrder, mode, subtitleText: hasProjectSubtitle ? subtitleText : undefined, subtitleAssText, subtitlePath: hasProjectSubtitle ? undefined : derived.subtitlePath ?? undefined, subtitleSrtPath: hasProjectSubtitle ? undefined : derived.subtitleSrtPath ?? undefined, subtitleRender: model.appSettings.subtitles, targetWidth: canvas.width, targetHeight: canvas.height, fitMode: canvas.fitMode, outputVideoPath })
    if (!result.canceled) model.setAsrNotice(result)
  } catch (error) {
    model.setAsrNotice({ success: false, message: `${derived.copy.runtime.clipExportFailed}：${error instanceof Error ? error.message : String(error)}` })
  } finally {
    model.setIsExportingClip(false)
  }
}
