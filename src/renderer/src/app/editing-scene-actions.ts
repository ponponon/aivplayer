import { filterSceneCutsForSourceRange } from '../../../core/media/scene-detection'
import { splitVideoClipAtSourceCuts } from '../../../core/editing/timeline-operations'
import { editedTimeToSource } from '../../../core/editing/timeline-math'
import { getEditingSceneCopy } from '../../../shared/editing-scene-copy'
import type { AppModel } from './app-types'
import { applyEditingTimelineChange } from './editing-action-helpers'

export function createEditingSceneActions(model: AppModel) {
  const detectEditingScenes = async (): Promise<void> => {
    if (model.isDetectingEditingScenes) return
    const project = model.editingProject
    if (!project) return
    const selectedClip = project.videoClips.find((clip) => clip.id === model.editingSelectedClipId)
    const targetClip = selectedClip ?? editedTimeToSource(project.videoClips, model.editingCurrentTime)?.clip
    if (!targetClip) return
    const source = project.sources.find((candidate) => candidate.id === targetClip.sourceId)
    if (!source) return
    const copy = getEditingSceneCopy(model.appSettings.ui.locale)

    model.setIsDetectingEditingScenes(true)
    try {
      const result = await window.aiv.detectMediaScenes({ mediaPath: source.path, threshold: 0.18, minSceneDurationSeconds: 0.8 })
      if (!result.success) {
        model.setEditingProjectStatus({ success: false, message: result.message || copy.failed })
        return
      }
      const cuts = filterSceneCutsForSourceRange(result.cuts.map((cut) => cut.timestampSeconds), targetClip.sourceStartSeconds, targetClip.sourceEndSeconds)
      const currentProject = model.editingProject
      if (!currentProject || currentProject.id !== project.id) return
      const split = splitVideoClipAtSourceCuts(currentProject.videoClips, targetClip.id, cuts)
      if (split.splitCount === 0) {
        model.setEditingProjectStatus({ success: true, message: copy.noCuts })
        return
      }
      applyEditingTimelineChange(model, split.clips, null)
      model.setEditingProjectStatus({ success: true, message: copy.splitDone(split.splitCount) })
    } catch (error) {
      model.setEditingProjectStatus({ success: false, message: `${copy.failed}：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      model.setIsDetectingEditingScenes(false)
    }
  }

  return { detectEditingScenes }
}
