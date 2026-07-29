import { mergeSilenceIntervals } from '../../../core/media/silence-detection'
import { removeEditedVideoRanges } from '../../../core/editing/timeline-operations'
import { sourceRangeToEditedRanges } from '../../../core/editing/timeline-math'
import { getEditingSilenceCopy } from '../../../shared/editing-silence-copy'
import type { AppModel } from './app-types'
import { applyEditingTimelineChangeRanges } from './editing-action-helpers'

export function createEditingSilenceActions(model: AppModel) {
  const removeEditingSilence = async (): Promise<void> => {
    if (model.isDetectingEditingSilence) return
    const project = model.editingProject
    if (!project) return
    const copy = getEditingSilenceCopy(model.appSettings.ui.locale)
    const sources = project.sources.filter((source) => project.videoClips.some((clip) => clip.sourceId === source.id))
    if (sources.length === 0) return

    model.setIsDetectingEditingSilence(true)
    try {
      const results = await Promise.all(sources.map((source) => window.aiv.detectMediaSilence({ mediaPath: source.path, durationSeconds: source.durationSeconds, noiseDb: -35, minSilenceDurationSeconds: 0.45, paddingSeconds: 0.08 })))
      const failed = results.find((result) => !result.success)
      if (failed) {
        model.setEditingProjectStatus({ success: false, message: failed.message || copy.failed })
        return
      }
      const currentProject = model.editingProject
      if (!currentProject || currentProject.id !== project.id) return
      const editedRanges = sources.flatMap((source, index) => mergeSilenceIntervals(results[index]?.intervals ?? []).flatMap((interval) => sourceRangeToEditedRanges(currentProject.videoClips, source.id, interval.startSeconds, interval.endSeconds)))
      const removal = removeEditedVideoRanges(currentProject.videoClips, editedRanges)
      if (removal.removedRanges.length === 0) {
        model.setEditingProjectStatus({ success: true, message: copy.noSilence })
        return
      }
      applyEditingTimelineChangeRanges(model, removal.clips, removal.removedRanges)
      const removedDuration = removal.removedRanges.reduce((total, range) => total + range.endSeconds - range.startSeconds, 0)
      model.setEditingProjectStatus({ success: true, message: copy.removed(removal.removedRanges.length, removedDuration) })
    } catch (error) {
      model.setEditingProjectStatus({ success: false, message: `${copy.failed}：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      model.setIsDetectingEditingSilence(false)
    }
  }

  return { removeEditingSilence }
}
