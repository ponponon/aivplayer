import { useEffect, useRef } from 'react'
import { editedTimeToSource, getVideoClipSpans, sourceTimeToEdited } from '../../../core/editing/timeline-math'
import { getEditingClipVolume, isEditingClipMuted } from '../../../core/editing/audio-operations'
import type { AppModel } from './app-types'

const EDITING_TIME_EPSILON_SECONDS = 0.001

export function useEditingPlaybackEffect(model: AppModel): void {
  const desiredEditingTimeRef = useRef(model.editingCurrentTime)
  const isPlayingRef = useRef(model.state.isPlaying)
  desiredEditingTimeRef.current = model.editingCurrentTime
  isPlayingRef.current = model.state.isPlaying
  useEffect(() => {
    const video = model.videoRef.current
    const project = model.editingProject
    const sourceId = model.editingPreviewSourceId ?? project?.sources[0]?.id
    if (!video || !project || !sourceId || !model.isEditingMode) return

    const applyClipAudio = (clip: NonNullable<typeof project>['videoClips'][number]): void => {
      video.volume = getEditingClipVolume(clip)
      video.muted = isEditingClipMuted(clip)
    }

    const syncEditingPlayback = (): void => {
      const sourceTime = video.currentTime
      const spans = getVideoClipSpans(project.videoClips)
      const activeIndex = spans.findIndex(({ clip }) => sourceTime >= clip.sourceStartSeconds - EDITING_TIME_EPSILON_SECONDS && sourceTime <= clip.sourceEndSeconds + EDITING_TIME_EPSILON_SECONDS)
      if (activeIndex >= 0) {
        const active = spans[activeIndex]!
        const next = spans[activeIndex + 1]
        if (active.clip.sourceId === sourceId) applyClipAudio(active.clip)
        if (sourceTime >= active.clip.sourceEndSeconds - EDITING_TIME_EPSILON_SECONDS) {
          if (next) {
            model.setEditingCurrentTime(next.editedStartSeconds)
            if (next.clip.sourceId !== sourceId) {
              model.editingResumePlaybackRef.current = !video.paused
              model.setEditingPreviewSourceId(next.clip.sourceId)
            } else {
              video.currentTime = next.clip.sourceStartSeconds
            }
            return
          }
          video.pause()
          model.setEditingCurrentTime(active.editedEndSeconds)
          model.setState((current) => ({ ...current, currentTime: active.clip.sourceEndSeconds, isPlaying: false }))
          return
        }
        const editedTime = sourceTimeToEdited(project.videoClips, sourceId, sourceTime)
        if (editedTime != null) model.setEditingCurrentTime(editedTime)
        return
      }

      const next = spans.find(({ clip }) => sourceTime < clip.sourceStartSeconds)
      if (next) {
        video.currentTime = next.clip.sourceStartSeconds
        model.setEditingCurrentTime(next.editedStartSeconds)
      }
    }

    const alignLoadedSource = (): void => {
      const desired = editedTimeToSource(project.videoClips, desiredEditingTimeRef.current)
      if (desired?.clip.sourceId === sourceId) { applyClipAudio(desired.clip); video.currentTime = desired.sourceSeconds }
      syncEditingPlayback()
      if (isPlayingRef.current || model.editingResumePlaybackRef.current) {
        model.editingResumePlaybackRef.current = false
        void video.play().catch(() => {})
      }
    }
    video.addEventListener('timeupdate', syncEditingPlayback)
    video.addEventListener('seeking', syncEditingPlayback)
    video.addEventListener('loadedmetadata', alignLoadedSource)
    syncEditingPlayback()
    return () => {
      video.removeEventListener('timeupdate', syncEditingPlayback)
      video.removeEventListener('seeking', syncEditingPlayback)
      video.removeEventListener('loadedmetadata', alignLoadedSource)
    }
  }, [model.editingProject, model.editingPreviewSourceId, model.isEditingMode, model.videoRef])
}
