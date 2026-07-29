import type { EditingVideoClip } from '../../shared/editing-types'
import {
  EDITING_TIME_EPSILON_SECONDS,
  editedTimeToSource,
  getVideoClipSpans,
  sourceRangeToEditedRanges,
  videoClipDurationSeconds,
  type EditedRange
} from './timeline-math'

export type VideoClipEditResult = {
  clips: EditingVideoClip[]
  removedRange: EditedRange | null
}

export type EditingClipBoundary = 'start' | 'end'

export type SourceRangeEditResult = {
  clips: EditingVideoClip[]
  removedRanges: EditedRange[]
}

export type InsertVideoClipsResult = {
  clips: EditingVideoClip[]
  insertedClipIds: string[]
  editedInsertSeconds: number
}

export type CreateRightClip = (
  base: EditingVideoClip,
  sourceStartSeconds: number,
  sourceEndSeconds: number
) => EditingVideoClip

function createEditingClipId(): string {
  return `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultCreateRightClip(
  base: EditingVideoClip,
  sourceStartSeconds: number,
  sourceEndSeconds: number
): EditingVideoClip {
  return { ...base, id: createEditingClipId(), sourceStartSeconds, sourceEndSeconds }
}

function unchanged(clips: readonly EditingVideoClip[]): VideoClipEditResult {
  return { clips: [...clips], removedRange: null }
}

/** Splits a surviving clip without changing the edited duration. */
export function splitVideoClipAtEdited(
  clips: readonly EditingVideoClip[],
  editedSeconds: number,
  createRightClip: CreateRightClip = defaultCreateRightClip
): VideoClipEditResult {
  const hit = editedTimeToSource(clips, editedSeconds)
  if (!hit) return unchanged(clips)

  const clip = hit.clip
  if (
    hit.sourceSeconds <= clip.sourceStartSeconds + EDITING_TIME_EPSILON_SECONDS ||
    hit.sourceSeconds >= clip.sourceEndSeconds - EDITING_TIME_EPSILON_SECONDS
  ) {
    return unchanged(clips)
  }

  const left = { ...clip, sourceEndSeconds: hit.sourceSeconds }
  const right = createRightClip(clip, hit.sourceSeconds, clip.sourceEndSeconds)
  return {
    clips: [...clips.slice(0, hit.index), left, right, ...clips.slice(hit.index + 1)],
    removedRange: null
  }
}

/** Removes the source footage to the left of the playhead within its clip. */
export function trimVideoClipLeftAtEdited(
  clips: readonly EditingVideoClip[],
  editedSeconds: number
): VideoClipEditResult {
  const hit = editedTimeToSource(clips, editedSeconds)
  if (!hit) return unchanged(clips)
  if (
    hit.sourceSeconds <= hit.clip.sourceStartSeconds + EDITING_TIME_EPSILON_SECONDS ||
    hit.sourceSeconds >= hit.clip.sourceEndSeconds - EDITING_TIME_EPSILON_SECONDS
  ) {
    return unchanged(clips)
  }

  const next = clips.map((clip, index) => index === hit.index
    ? { ...clip, sourceStartSeconds: hit.sourceSeconds }
    : clip)

  return {
    clips: next,
    removedRange: { startSeconds: hit.editedStartSeconds, endSeconds: editedSeconds }
  }
}

/** Removes the source footage to the right of the playhead within its clip. */
export function trimVideoClipRightAtEdited(
  clips: readonly EditingVideoClip[],
  editedSeconds: number
): VideoClipEditResult {
  const hit = editedTimeToSource(clips, editedSeconds)
  if (!hit) return unchanged(clips)
  if (
    hit.sourceSeconds <= hit.clip.sourceStartSeconds + EDITING_TIME_EPSILON_SECONDS ||
    hit.sourceSeconds >= hit.clip.sourceEndSeconds - EDITING_TIME_EPSILON_SECONDS
  ) {
    return unchanged(clips)
  }

  const next = clips.map((clip, index) => index === hit.index
    ? { ...clip, sourceEndSeconds: hit.sourceSeconds }
    : clip)

  return {
    clips: next,
    removedRange: { startSeconds: editedSeconds, endSeconds: hit.editedEndSeconds }
  }
}

/** Moves a clip edge inward from the edited timeline and reports the removed time. */
export function trimVideoClipBoundaryAtEdited(
  clips: readonly EditingVideoClip[],
  clipId: string,
  boundary: EditingClipBoundary,
  editedSeconds: number
): VideoClipEditResult {
  const span = getVideoClipSpans(clips).find((candidate) => candidate.clip.id === clipId)
  if (!span) return unchanged(clips)

  const safeEditedSeconds = Number.isFinite(editedSeconds)
    ? Math.min(span.editedEndSeconds, Math.max(span.editedStartSeconds, editedSeconds))
    : boundary === 'start' ? span.editedStartSeconds : span.editedEndSeconds
  const sourceBoundary = span.clip.sourceStartSeconds + safeEditedSeconds - span.editedStartSeconds
  if (boundary === 'start') {
    if (sourceBoundary <= span.clip.sourceStartSeconds + EDITING_TIME_EPSILON_SECONDS || sourceBoundary >= span.clip.sourceEndSeconds - EDITING_TIME_EPSILON_SECONDS) return unchanged(clips)
    return {
      clips: clips.map((clip) => clip.id === clipId ? { ...clip, sourceStartSeconds: sourceBoundary } : clip),
      removedRange: { startSeconds: span.editedStartSeconds, endSeconds: safeEditedSeconds }
    }
  }

  if (sourceBoundary <= span.clip.sourceStartSeconds + EDITING_TIME_EPSILON_SECONDS || sourceBoundary >= span.clip.sourceEndSeconds - EDITING_TIME_EPSILON_SECONDS) return unchanged(clips)
  return {
    clips: clips.map((clip) => clip.id === clipId ? { ...clip, sourceEndSeconds: sourceBoundary } : clip),
    removedRange: { startSeconds: safeEditedSeconds, endSeconds: span.editedEndSeconds }
  }
}

/** Erases an edited range and joins the remaining video clips. */
export function removeEditedVideoRange(
  clips: readonly EditingVideoClip[],
  startSeconds: number,
  endSeconds: number,
  createRightClip: CreateRightClip = defaultCreateRightClip
): VideoClipEditResult {
  const spans = getVideoClipSpans(clips)
  const totalDuration = spans.length > 0 ? spans[spans.length - 1]!.editedEndSeconds : 0
  const start = Math.max(0, Math.min(totalDuration, Math.min(startSeconds, endSeconds)))
  const end = Math.max(0, Math.min(totalDuration, Math.max(startSeconds, endSeconds)))
  if (end - start <= EDITING_TIME_EPSILON_SECONDS) return unchanged(clips)

  const next: EditingVideoClip[] = []
  for (const span of spans) {
    if (span.editedEndSeconds <= start + EDITING_TIME_EPSILON_SECONDS || span.editedStartSeconds >= end - EDITING_TIME_EPSILON_SECONDS) {
      next.push(span.clip)
      continue
    }

    if (span.editedStartSeconds < start - EDITING_TIME_EPSILON_SECONDS) {
      next.push({
        ...span.clip,
        sourceEndSeconds: span.clip.sourceStartSeconds + (start - span.editedStartSeconds)
      })
    }

    if (span.editedEndSeconds > end + EDITING_TIME_EPSILON_SECONDS) {
      next.push(createRightClip(
        span.clip,
        span.clip.sourceStartSeconds + (end - span.editedStartSeconds),
        span.clip.sourceEndSeconds
      ))
    }
  }

  // Keep the project renderable. A fully deleted main track is handled later
  // by an explicit "clear project" action, not an accidental drag.
  if (next.length === 0) return unchanged(clips)

  return {
    clips: next,
    removedRange: { startSeconds: start, endSeconds: end }
  }
}

/** Deletes the clip under the playhead, while keeping at least one clip. */
export function deleteVideoClipAtEdited(
  clips: readonly EditingVideoClip[],
  editedSeconds: number
): VideoClipEditResult {
  if (clips.length <= 1) return unchanged(clips)
  const hit = editedTimeToSource(clips, editedSeconds)
  if (!hit) return unchanged(clips)

  const span = getVideoClipSpans(clips).find((candidate) => candidate.index === hit.index)
  if (!span) return unchanged(clips)

  return {
    clips: clips.filter((_, index) => index !== hit.index),
    removedRange: { startSeconds: span.editedStartSeconds, endSeconds: span.editedEndSeconds }
  }
}

/** Reorders surviving clips without changing their source ranges or durations. */
export function reorderVideoClips(
  clips: readonly EditingVideoClip[],
  fromIndex: number,
  toIndex: number
): EditingVideoClip[] {
  if (clips.length <= 1 || fromIndex < 0 || fromIndex >= clips.length || toIndex < 0 || toIndex >= clips.length || fromIndex === toIndex) return [...clips]
  const next = [...clips]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return [...clips]
  next.splice(toIndex, 0, moved)
  return next
}

/** Inserts one or more source clips at the playhead, splitting the hit clip when needed. */
export function insertVideoClipsAtEdited(
  clips: readonly EditingVideoClip[],
  insertClips: readonly EditingVideoClip[],
  editedSeconds: number,
  createRightClip: CreateRightClip = defaultCreateRightClip
): InsertVideoClipsResult {
  if (insertClips.length === 0) return { clips: [...clips], insertedClipIds: [], editedInsertSeconds: 0 }
  const spans = getVideoClipSpans(clips)
  const totalDuration = spans.length > 0 ? spans[spans.length - 1]!.editedEndSeconds : 0
  const safeEditedSeconds = Math.max(0, Math.min(totalDuration, Number.isFinite(editedSeconds) ? editedSeconds : totalDuration))
  let next = [...clips]
  let insertionIndex = next.length
  const hit = editedTimeToSource(next, safeEditedSeconds)
  if (hit && safeEditedSeconds > hit.editedStartSeconds + EDITING_TIME_EPSILON_SECONDS && safeEditedSeconds < hit.editedEndSeconds - EDITING_TIME_EPSILON_SECONDS) {
    const split = splitVideoClipAtEdited(next, safeEditedSeconds, createRightClip)
    next = split.clips
    insertionIndex = hit.index + 1
  } else {
    const boundary = getVideoClipSpans(next).find((span) => safeEditedSeconds <= span.editedStartSeconds + EDITING_TIME_EPSILON_SECONDS)
    insertionIndex = boundary?.index ?? next.length
  }
  next.splice(insertionIndex, 0, ...insertClips)
  return { clips: next, insertedClipIds: insertClips.map((clip) => clip.id), editedInsertSeconds: safeEditedSeconds }
}

/** Deletes source-time ranges, resolving them against the current edit before each deletion. */
export function removeSourceVideoRanges(
  clips: readonly EditingVideoClip[],
  sourceId: string,
  ranges: readonly EditedRange[],
  createRightClip: CreateRightClip = defaultCreateRightClip
): SourceRangeEditResult {
  let current = [...clips]
  const removedRanges: EditedRange[] = []

  for (const range of ranges) {
    const editedRanges = sourceRangeToEditedRanges(
      current,
      sourceId,
      range.startSeconds,
      range.endSeconds
    ).sort((left, right) => right.startSeconds - left.startSeconds)

    for (const editedRange of editedRanges) {
      const result = removeEditedVideoRange(
        current,
        editedRange.startSeconds,
        editedRange.endSeconds,
        createRightClip
      )
      if (!result.removedRange) continue
      current = result.clips
      removedRanges.push(result.removedRange)
    }
  }

  return { clips: current, removedRanges }
}

/** Returns the clip length after an edit, useful to callers building preview state. */
export function editedVideoDurationAfterEdit(clips: readonly EditingVideoClip[]): number {
  return clips.reduce((total, clip) => total + videoClipDurationSeconds(clip), 0)
}
