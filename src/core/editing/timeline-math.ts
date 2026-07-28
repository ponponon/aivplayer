import type { EditingTimedItem, EditingVideoClip } from '../../shared/editing-types'

export const EDITING_TIME_EPSILON_SECONDS = 0.001

export type EditingVideoClipSpan = {
  index: number
  clip: EditingVideoClip
  editedStartSeconds: number
  editedEndSeconds: number
}

export type EditedSourcePoint = {
  index: number
  clip: EditingVideoClip
  editedStartSeconds: number
  editedEndSeconds: number
  sourceSeconds: number
}

export type EditedRange = {
  startSeconds: number
  endSeconds: number
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function videoClipDurationSeconds(clip: EditingVideoClip): number {
  const start = finiteOr(clip.sourceStartSeconds, 0)
  const end = finiteOr(clip.sourceEndSeconds, start)
  return Math.max(0, end - start)
}

/** Returns the sequential edited-time spans for the main video track. */
export function getVideoClipSpans(clips: readonly EditingVideoClip[]): EditingVideoClipSpan[] {
  let editedStartSeconds = 0
  const spans: EditingVideoClipSpan[] = []

  clips.forEach((clip, index) => {
    const durationSeconds = videoClipDurationSeconds(clip)
    if (durationSeconds <= EDITING_TIME_EPSILON_SECONDS) return

    const editedEndSeconds = editedStartSeconds + durationSeconds
    spans.push({ index, clip, editedStartSeconds, editedEndSeconds })
    editedStartSeconds = editedEndSeconds
  })

  return spans
}

export function editedDurationSeconds(clips: readonly EditingVideoClip[]): number {
  const spans = getVideoClipSpans(clips)
  return spans.length > 0 ? spans[spans.length - 1]!.editedEndSeconds : 0
}

/**
 * Maps edited time to source time. At an exact clip boundary the preceding
 * clip owns the point; playback code should advance to the next span once it
 * reaches that span's end.
 */
export function editedTimeToSource(
  clips: readonly EditingVideoClip[],
  editedSeconds: number
): EditedSourcePoint | null {
  const spans = getVideoClipSpans(clips)
  if (spans.length === 0) return null

  const durationSeconds = spans[spans.length - 1]!.editedEndSeconds
  const safeEditedSeconds = clamp(finiteOr(editedSeconds, 0), 0, durationSeconds)

  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index]!
    const isLast = index === spans.length - 1
    if (safeEditedSeconds <= span.editedEndSeconds || isLast) {
      const offsetSeconds = clamp(safeEditedSeconds - span.editedStartSeconds, 0, videoClipDurationSeconds(span.clip))
      return {
        ...span,
        sourceSeconds: span.clip.sourceStartSeconds + offsetSeconds
      }
    }
  }

  return null
}

/** Returns null when the source time is inside a removed range. */
export function sourceTimeToEdited(
  clips: readonly EditingVideoClip[],
  sourceId: string,
  sourceSeconds: number
): number | null {
  const safeSourceSeconds = finiteOr(sourceSeconds, 0)

  for (const span of getVideoClipSpans(clips)) {
    if (span.clip.sourceId !== sourceId) continue
    if (safeSourceSeconds < span.clip.sourceStartSeconds - EDITING_TIME_EPSILON_SECONDS) continue
    if (safeSourceSeconds > span.clip.sourceEndSeconds + EDITING_TIME_EPSILON_SECONDS) continue

    return span.editedStartSeconds + clamp(
      safeSourceSeconds - span.clip.sourceStartSeconds,
      0,
      videoClipDurationSeconds(span.clip)
    )
  }

  return null
}

/** Maps a source range to all surviving edited ranges, including across cuts. */
export function sourceRangeToEditedRanges(
  clips: readonly EditingVideoClip[],
  sourceId: string,
  sourceStartSeconds: number,
  sourceEndSeconds: number
): EditedRange[] {
  const startSeconds = Math.min(finiteOr(sourceStartSeconds, 0), finiteOr(sourceEndSeconds, 0))
  const endSeconds = Math.max(finiteOr(sourceStartSeconds, 0), finiteOr(sourceEndSeconds, 0))
  if (endSeconds - startSeconds <= EDITING_TIME_EPSILON_SECONDS) return []

  return getVideoClipSpans(clips)
    .filter(({ clip }) => clip.sourceId === sourceId)
    .flatMap(({ clip, editedStartSeconds }) => {
      const overlapStart = Math.max(startSeconds, clip.sourceStartSeconds)
      const overlapEnd = Math.min(endSeconds, clip.sourceEndSeconds)
      if (overlapEnd - overlapStart <= EDITING_TIME_EPSILON_SECONDS) return []

      return [{
        startSeconds: editedStartSeconds + overlapStart - clip.sourceStartSeconds,
        endSeconds: editedStartSeconds + overlapEnd - clip.sourceStartSeconds
      }]
    })
}

/** Compresses time-based overlay items after an edited range is removed. */
export function removeEditedInterval<T extends EditingTimedItem>(
  items: readonly T[],
  startSeconds: number,
  endSeconds: number,
  minimumDurationSeconds = 0.1
): T[] {
  const start = Math.min(finiteOr(startSeconds, 0), finiteOr(endSeconds, 0))
  const end = Math.max(finiteOr(startSeconds, 0), finiteOr(endSeconds, 0))
  const gapSeconds = end - start
  if (gapSeconds <= EDITING_TIME_EPSILON_SECONDS) return [...items]

  return items.flatMap((item) => {
    const itemStart = finiteOr(item.startSeconds, 0)
    const itemEnd = itemStart + Math.max(0, finiteOr(item.durationSeconds, 0))

    if (itemEnd <= start) return [item]
    if (itemStart >= end) return [{ ...item, startSeconds: itemStart - gapSeconds }]

    const keptBefore = Math.max(0, start - itemStart)
    const keptAfter = Math.max(0, itemEnd - end)
    const durationSeconds = keptBefore + keptAfter
    if (durationSeconds < minimumDurationSeconds) return []

    return [{
      ...item,
      startSeconds: Math.min(itemStart, start),
      durationSeconds
    }]
  })
}
