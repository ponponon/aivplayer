import { serializeEditingCaptionsToSrt } from '../../../core/editing/caption-serialization'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

export async function exportEditingTimeline(model: AppModel, derived: AppDerived): Promise<void> {
  const project = model.editingProject
  const primarySource = project?.sources[0]
  if (!project || !primarySource || project.videoClips.length === 0 || model.isExportingClip) return
  const sourceById = new Map(project.sources.map((source) => [source.id, source.path]))
  const clips = project.videoClips.flatMap((clip) => {
    const mediaPath = sourceById.get(clip.sourceId)
    return mediaPath ? [{ mediaPath, startSeconds: clip.sourceStartSeconds, endSeconds: clip.sourceEndSeconds, volume: clip.volume, muted: clip.muted }] : []
  })
  if (clips.length === 0) return
  const subtitleText = serializeEditingCaptionsToSrt(project.captions)
  const hasProjectSubtitle = subtitleText.length > 0
  const mode = hasProjectSubtitle || derived.hasClipExportSubtitle ? model.appSettings.capture.clipExportMode : 'video'
  model.setIsExportingClip(true)
  try {
    const result = await window.aiv.exportMediaTimeline({ mediaPath: primarySource.path, clips, mode, subtitleText: hasProjectSubtitle ? subtitleText : undefined, subtitlePath: hasProjectSubtitle ? undefined : derived.subtitlePath ?? undefined, subtitleSrtPath: hasProjectSubtitle ? undefined : derived.subtitleSrtPath ?? undefined, targetWidth: primarySource.width, targetHeight: primarySource.height })
    if (!result.canceled) model.setAsrNotice(result)
  } catch (error) {
    model.setAsrNotice({ success: false, message: `${derived.copy.runtime.clipExportFailed}：${error instanceof Error ? error.message : String(error)}` })
  } finally {
    model.setIsExportingClip(false)
  }
}
