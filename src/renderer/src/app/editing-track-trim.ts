import { snapEditedTime } from '../../../core/editing/timeline-snapping'

export type EditingTrackTrimEdge = 'start' | 'end'

export type EditingTrackTrimState = {
  id: string
  edge: EditingTrackTrimEdge
  startSeconds: number
  endSeconds: number
  moved: boolean
}

export function editingTimeFromTimelinePointer(clientX: number, element: HTMLElement, durationSeconds: number): number {
  const bounds = element.getBoundingClientRect()
  const ratio = bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0
  return Math.min(Math.max(0, ratio * durationSeconds), durationSeconds)
}

export function updateEditingTrackTrim(state: EditingTrackTrimState, pointerSeconds: number, timelineDurationSeconds: number, minimumDurationSeconds: number, snapPoints: readonly number[] = []): EditingTrackTrimState {
  const safeTimelineDuration = Math.max(0, Number.isFinite(timelineDurationSeconds) ? timelineDurationSeconds : 0)
  const minimumDuration = Math.max(0.01, minimumDurationSeconds)
  const safePointer = Number.isFinite(pointerSeconds) ? pointerSeconds : 0
  if (state.edge === 'start') {
    const maximumStart = Math.max(0, state.endSeconds - minimumDuration)
    const nextStart = Math.min(maximumStart, snapEditedTime(safePointer, maximumStart, snapPoints))
    return { ...state, startSeconds: nextStart, moved: state.moved || Math.abs(nextStart - state.startSeconds) > 0.01 }
  }
  const minimumEnd = Math.min(safeTimelineDuration, state.startSeconds + minimumDuration)
  const nextEnd = Math.max(minimumEnd, snapEditedTime(safePointer, safeTimelineDuration, snapPoints))
  return { ...state, endSeconds: nextEnd, moved: state.moved || Math.abs(nextEnd - state.endSeconds) > 0.01 }
}
