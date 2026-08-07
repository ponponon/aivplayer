import type { MediaStructureSegment, MediaStructureSegmentKind } from '../../shared/media-types'

export const DEFAULT_MIN_BLACK_DURATION_SECONDS = 0.5
// FFmpeg blackdetect's pix_th is the per-pixel luma threshold, not the
// percentage of pixels that must be black. A value near 1 would classify
// saturated colors such as red as black.
export const DEFAULT_BLACK_PIXEL_THRESHOLD = 0.1

const BLACK_INTERVAL_PATTERN = /black_start:\s*(-?\d+(?:\.\d+)?)\s+black_end:\s*(-?\d+(?:\.\d+)?)/g

export type BlackInterval = { startSeconds: number; endSeconds: number }

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function parseBlackIntervals(output: string, durationSeconds?: number, minBlackDurationSeconds = DEFAULT_MIN_BLACK_DURATION_SECONDS): BlackInterval[] {
  const minimum = Math.max(0.1, finiteOr(minBlackDurationSeconds, DEFAULT_MIN_BLACK_DURATION_SECONDS))
  const duration = finiteOr(durationSeconds, Number.NaN)
  const intervals: BlackInterval[] = []
  for (const match of output.matchAll(BLACK_INTERVAL_PATTERN)) {
    const startSeconds = Math.max(0, Number(match[1]))
    const endSeconds = Number(match[2])
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds - startSeconds < minimum) continue
    intervals.push({ startSeconds, endSeconds: Number.isFinite(duration) ? Math.min(duration, endSeconds) : endSeconds })
  }
  return intervals.filter((interval) => interval.endSeconds - interval.startSeconds >= minimum)
}

export function mergeBlackIntervals(intervals: readonly BlackInterval[]): BlackInterval[] {
  const merged: BlackInterval[] = []
  for (const interval of [...intervals].map((value) => ({ startSeconds: Math.min(value.startSeconds, value.endSeconds), endSeconds: Math.max(value.startSeconds, value.endSeconds) })).filter((value) => Number.isFinite(value.startSeconds) && Number.isFinite(value.endSeconds) && value.endSeconds - value.startSeconds >= 0.1).sort((left, right) => left.startSeconds - right.startSeconds)) {
    const previous = merged.at(-1)
    if (previous && interval.startSeconds <= previous.endSeconds + 0.12) previous.endSeconds = Math.max(previous.endSeconds, interval.endSeconds)
    else merged.push({ ...interval })
  }
  return merged
}

function createSegment(kind: MediaStructureSegmentKind, startSeconds: number, endSeconds: number, confidence: number): MediaStructureSegment {
  return { id: `structure-${kind}-${Math.round(startSeconds * 1000)}-${Math.round(endSeconds * 1000)}`, kind, startSeconds: Number(startSeconds.toFixed(3)), endSeconds: Number(endSeconds.toFixed(3)), confidence: Number(Math.max(0, Math.min(1, confidence)).toFixed(3)) }
}

/** Builds human-reviewable black/intro/outro evidence from FFmpeg blackdetect intervals. */
export function buildMediaStructureSegments(intervals: readonly BlackInterval[], durationSeconds?: number): MediaStructureSegment[] {
  const merged = mergeBlackIntervals(intervals)
  const duration = finiteOr(durationSeconds, Number.NaN)
  const segments = merged.map((interval) => createSegment('black', interval.startSeconds, interval.endSeconds, 0.96))
  const leading = merged.find((interval) => interval.startSeconds <= 0.1)
  if (leading) segments.push(createSegment('intro', 0, leading.endSeconds, 0.9))
  const trailing = Number.isFinite(duration) ? [...merged].reverse().find((interval) => interval.endSeconds >= duration - 0.1) : undefined
  if (trailing && Number.isFinite(duration) && duration > trailing.startSeconds) segments.push(createSegment('outro', trailing.startSeconds, duration, 0.9))
  return segments.sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind))
}
