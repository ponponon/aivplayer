import type { AppSettingsSectionPatcher } from '../../../shared/app-settings'
import type { MediaStructureCorrection, MediaStructureSegment } from '../../../shared/media-types'
import { getPlaybackMediaKey } from '../../../shared/playback-memory'
import type { AppModel } from './app-types'

export function usePlaybackStructureActions(model: AppModel, patchSection: AppSettingsSectionPatcher) {
  const resolveSourceKey = (sourceKey?: string): string | null => {
    if (sourceKey?.trim()) return sourceKey.trim()
    return model.state.currentFile ? getPlaybackMediaKey(model.state.currentFile) : null
  }

  const ignorePlaybackStructureSegment = (segment: MediaStructureSegment, sourceKey?: string): void => {
    const key = resolveSourceKey(sourceKey)
    if (!key || !segment || segment.endSeconds <= segment.startSeconds) return
    const correction: MediaStructureCorrection = {
      segmentId: segment.id,
      kind: segment.kind,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      action: 'ignore',
      updatedAt: Date.now()
    }
    patchSection('playback', (current) => ({
      ...current,
      structureCorrectionsByFingerprint: {
        ...current.structureCorrectionsByFingerprint,
        [key]: [
          ...(current.structureCorrectionsByFingerprint[key] ?? []).filter((item) => item.segmentId !== segment.id),
          correction
        ].sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
      }
    }))
  }

  const restorePlaybackStructureSegment = (segmentId: string, sourceKey?: string): void => {
    const key = resolveSourceKey(sourceKey)
    if (!key || !segmentId.trim()) return
    patchSection('playback', (current) => ({
      ...current,
      structureCorrectionsByFingerprint: {
        ...current.structureCorrectionsByFingerprint,
        [key]: (current.structureCorrectionsByFingerprint[key] ?? []).filter((item) => item.segmentId !== segmentId)
      }
    }))
  }

  return { ignorePlaybackStructureSegment, restorePlaybackStructureSegment }
}
