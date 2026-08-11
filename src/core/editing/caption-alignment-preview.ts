import type { EditingCaption } from '../../shared/editing-types'

const TIME_EPSILON_SECONDS = 0.001

export type EditingCaptionAlignmentEvidence = 'current-playhead'
export type EditingCaptionAlignmentConfidence = 'manual-visual-anchor'

export type EditingCaptionAlignmentPreview = {
  captionIds: string[]
  sourceStartSeconds: number
  sourceEndSeconds: number
  targetStartSeconds: number
  targetEndSeconds: number
  offsetSeconds: number
  evidence: EditingCaptionAlignmentEvidence
  confidence: EditingCaptionAlignmentConfidence
  canApply: boolean
}

/**
 * Builds a read-only shift candidate from the current playhead.
 *
 * The playhead is an explicit visual anchor, not an inferred audio match. The
 * candidate keeps the selected caption span and durations unchanged; callers
 * must still show it and ask for confirmation before applying it.
 */
export function proposeEditingCaptionAlignment(
  captions: readonly EditingCaption[],
  anchorSeconds: number,
  timelineDurationSeconds: number
): EditingCaptionAlignmentPreview | null {
  const selected = captions
    .filter((caption) => Number.isFinite(caption.startSeconds) && Number.isFinite(caption.durationSeconds) && caption.durationSeconds > TIME_EPSILON_SECONDS)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))
  if (selected.length === 0 || !Number.isFinite(anchorSeconds)) return null

  const sourceStartSeconds = selected[0].startSeconds
  const sourceEndSeconds = Math.max(...selected.map((caption) => caption.startSeconds + caption.durationSeconds))
  const offsetSeconds = anchorSeconds - sourceStartSeconds
  const targetStartSeconds = sourceStartSeconds + offsetSeconds
  const targetEndSeconds = sourceEndSeconds + offsetSeconds
  const timelineDuration = Number.isFinite(timelineDurationSeconds) ? Math.max(0, timelineDurationSeconds) : 0
  const canApply = targetStartSeconds >= -TIME_EPSILON_SECONDS && targetEndSeconds <= timelineDuration + TIME_EPSILON_SECONDS && targetEndSeconds > targetStartSeconds + TIME_EPSILON_SECONDS

  return {
    captionIds: selected.map((caption) => caption.id),
    sourceStartSeconds,
    sourceEndSeconds,
    targetStartSeconds,
    targetEndSeconds,
    offsetSeconds,
    evidence: 'current-playhead',
    confidence: 'manual-visual-anchor',
    canApply
  }
}
