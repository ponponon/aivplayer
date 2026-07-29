import type { EditingVideoClip } from '../../shared/editing-types'
import { normalizeEditingClipTransitions } from './transition-operations'
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

export type VideoClipBatchEditResult = {
  clips: EditingVideoClip[]
  removedRanges: EditedRange[]
}

export type EditingClipBoundary = 'start' | 'end'

export type SourceRangeEditResult = {
  clips: EditingVideoClip[]
  removedRanges: EditedRange[]
}

export type RestoreSourceRangeResult = {
  clips: EditingVideoClip[]
  restored: boolean
}

export type SceneSplitResult = {
  clips: EditingVideoClip[]
  splitCount: number
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

/** Removes several ranges from one edited timeline in descending order so earlier coordinates stay stable. */
export function removeEditedVideoRanges(
  clips: readonly EditingVideoClip[],
  ranges: readonly EditedRange[],
  createRightClip: CreateRightClip = defaultCreateRightClip
): VideoClipBatchEditResult {
  const normalized = ranges
    .map((range) => ({ startSeconds: Math.min(range.startSeconds, range.endSeconds), endSeconds: Math.max(range.startSeconds, range.endSeconds) }))
    .filter((range) => Number.isFinite(range.startSeconds) && Number.isFinite(range.endSeconds) && range.endSeconds - range.startSeconds > EDITING_TIME_EPSILON_SECONDS)
    .sort((left, right) => left.startSeconds - right.startSeconds)
    .reduce<EditedRange[]>((merged, range) => {
      const previous = merged.at(-1)
      if (previous && range.startSeconds <= previous.endSeconds + EDITING_TIME_EPSILON_SECONDS) previous.endSeconds = Math.max(previous.endSeconds, range.endSeconds)
      else merged.push({ ...range })
      return merged
    }, [])
  let nextClips = [...clips]
  const removedRanges: EditedRange[] = []
  for (const range of [...normalized].reverse()) {
    const result = removeEditedVideoRange(nextClips, range.startSeconds, range.endSeconds, createRightClip)
    if (!result.removedRange) continue
    nextClips = result.clips
    removedRanges.unshift(result.removedRange)
  }
  return { clips: nextClips, removedRanges }
}

/** Splits one clip at source-clock scene cuts without changing edited duration. */
export function splitVideoClipAtSourceCuts(
  clips: readonly EditingVideoClip[],
  clipId: string,
  sourceCuts: readonly number[],
  minimumSegmentSeconds = 0.4
): SceneSplitResult {
  const index = clips.findIndex((clip) => clip.id === clipId)
  const target = index >= 0 ? clips[index] : null
  if (!target) return { clips: [...clips], splitCount: 0 }
  const minimum = Number.isFinite(minimumSegmentSeconds) ? Math.max(0.1, minimumSegmentSeconds) : 0.4
  const cuts: number[] = []
  for (const sourceCut of [...sourceCuts].sort((left, right) => left - right)) {
    if (!Number.isFinite(sourceCut) || sourceCut <= target.sourceStartSeconds + minimum || sourceCut >= target.sourceEndSeconds - minimum) continue
    if (cuts.length === 0 || sourceCut - cuts[cuts.length - 1]! >= minimum) cuts.push(sourceCut)
  }
  if (cuts.length === 0) return { clips: [...clips], splitCount: 0 }

  const { transitionIn, ...withoutTransition } = target
  const boundaries = [target.sourceStartSeconds, ...cuts, target.sourceEndSeconds]
  const parts = boundaries.slice(0, -1).map((sourceStartSeconds, partIndex) => ({
    ...(partIndex === 0 && transitionIn ? { ...withoutTransition, transitionIn } : withoutTransition),
    id: partIndex === 0 ? target.id : `${target.id}-scene-${partIndex}`,
    sourceStartSeconds,
    sourceEndSeconds: boundaries[partIndex + 1]!
  }))
  return {
    clips: normalizeEditingClipTransitions([...clips.slice(0, index), ...parts, ...clips.slice(index + 1)]),
    splitCount: cuts.length
  }
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
    clips: normalizeEditingClipTransitions([...clips.slice(0, hit.index), left, right, ...clips.slice(hit.index + 1)]),
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
    clips: normalizeEditingClipTransitions(next),
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
    clips: normalizeEditingClipTransitions(next),
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
      clips: normalizeEditingClipTransitions(clips.map((clip) => clip.id === clipId ? { ...clip, sourceStartSeconds: sourceBoundary } : clip)),
      removedRange: { startSeconds: span.editedStartSeconds, endSeconds: safeEditedSeconds }
    }
  }

  if (sourceBoundary <= span.clip.sourceStartSeconds + EDITING_TIME_EPSILON_SECONDS || sourceBoundary >= span.clip.sourceEndSeconds - EDITING_TIME_EPSILON_SECONDS) return unchanged(clips)
  return {
    clips: normalizeEditingClipTransitions(clips.map((clip) => clip.id === clipId ? { ...clip, sourceEndSeconds: sourceBoundary } : clip)),
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
    clips: normalizeEditingClipTransitions(next),
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
    clips: normalizeEditingClipTransitions(clips.filter((_, index) => index !== hit.index)),
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
  return normalizeEditingClipTransitions(next)
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
  return { clips: normalizeEditingClipTransitions(next), insertedClipIds: insertClips.map((clip) => clip.id), editedInsertSeconds: safeEditedSeconds }
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

/**
 * Restores a source-time gap without changing the order of clips from other
 * sources. The source track is temporarily sorted by source time, matching
 * the transcript's coordinate system, then foreign clips are reattached after
 * the same source predecessor they originally followed.
 */
export function restoreSourceVideoRange(
  clips: readonly EditingVideoClip[],
  sourceId: string,
  sourceStartSeconds: number,
  sourceEndSeconds: number,
  createClip: (sourceStartSeconds: number, sourceEndSeconds: number) => EditingVideoClip
): RestoreSourceRangeResult {
  const startSeconds = Math.min(sourceStartSeconds, sourceEndSeconds)
  const endSeconds = Math.max(sourceStartSeconds, sourceEndSeconds)
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds - startSeconds <= EDITING_TIME_EPSILON_SECONDS) {
    return { clips: [...clips], restored: false }
  }

  const sourceClips = clips.filter((clip) => clip.sourceId === sourceId)
  if (sourceClips.length === 0) {
    return { clips: [createClip(startSeconds, endSeconds), ...clips], restored: true }
  }

  const sorted = [...sourceClips].sort((left, right) => left.sourceStartSeconds - right.sourceStartSeconds)
  const gaps: Array<[number, number]> = []
  let cursor = startSeconds
  for (const clip of sorted) {
    if (clip.sourceEndSeconds <= cursor + EDITING_TIME_EPSILON_SECONDS) continue
    if (clip.sourceStartSeconds >= endSeconds - EDITING_TIME_EPSILON_SECONDS) break
    if (clip.sourceStartSeconds > cursor + EDITING_TIME_EPSILON_SECONDS) {
      gaps.push([cursor, Math.min(clip.sourceStartSeconds, endSeconds)])
    }
    cursor = Math.max(cursor, clip.sourceEndSeconds)
    if (cursor >= endSeconds - EDITING_TIME_EPSILON_SECONDS) break
  }
  if (cursor < endSeconds - EDITING_TIME_EPSILON_SECONDS) gaps.push([cursor, endSeconds])

  const realGaps = gaps.filter(([gapStart, gapEnd]) => gapEnd - gapStart > EDITING_TIME_EPSILON_SECONDS)
  if (realGaps.length === 0) return { clips: [...clips], restored: false }

  let restoredSourceClips = sorted
  for (const [gapStart, gapEnd] of realGaps) {
    const previousIndex = restoredSourceClips.findIndex((clip) => Math.abs(clip.sourceEndSeconds - gapStart) <= 0.03)
    if (previousIndex >= 0) {
      restoredSourceClips = restoredSourceClips.map((clip, index) => index === previousIndex ? { ...clip, sourceEndSeconds: gapEnd } : clip)
      continue
    }

    const nextIndex = restoredSourceClips.findIndex((clip) => Math.abs(clip.sourceStartSeconds - gapEnd) <= 0.03)
    if (nextIndex >= 0) {
      restoredSourceClips = restoredSourceClips.map((clip, index) => index === nextIndex ? { ...clip, sourceStartSeconds: gapStart } : clip)
      continue
    }

    const inserted = createClip(gapStart, gapEnd)
    const insertIndex = restoredSourceClips.findIndex((clip) => clip.sourceStartSeconds >= gapEnd - EDITING_TIME_EPSILON_SECONDS)
    restoredSourceClips = insertIndex < 0
      ? [...restoredSourceClips, inserted]
      : [...restoredSourceClips.slice(0, insertIndex), inserted, ...restoredSourceClips.slice(insertIndex)]
  }

  const sourceIds = new Set(sourceClips.map((clip) => clip.id))
  const anchors: Array<{ clip: EditingVideoClip; afterId: string | null }> = []
  let lastSourceId: string | null = null
  for (const clip of clips) {
    if (sourceIds.has(clip.id)) {
      lastSourceId = clip.id
      continue
    }
    anchors.push({ clip, afterId: lastSourceId })
  }

  const output: EditingVideoClip[] = []
  for (const clip of restoredSourceClips) {
    output.push(clip)
    for (const anchor of anchors) if (anchor.afterId === clip.id) output.push(anchor.clip)
  }
  for (const anchor of anchors) if (!output.includes(anchor.clip)) output.unshift(anchor.clip)

  return { clips: output, restored: true }
}

/** Returns the clip length after an edit, useful to callers building preview state. */
export function editedVideoDurationAfterEdit(clips: readonly EditingVideoClip[]): number {
  return clips.reduce((total, clip) => total + videoClipDurationSeconds(clip), 0)
}
