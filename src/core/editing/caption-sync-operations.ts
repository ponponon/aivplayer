import type { EditingCaption } from '../../shared/editing-types'

const MINIMUM_CAPTION_DURATION_SECONDS = 0.1
const TIME_EPSILON_SECONDS = 0.001

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/** Maps selected captions from one time span to another without changing text or media clips. */
export function syncEditingCaptionsBetweenPoints(
  captions: readonly EditingCaption[],
  captionIds: readonly string[],
  sourceStartSeconds: number,
  sourceEndSeconds: number,
  targetStartSeconds: number,
  targetEndSeconds: number,
  timelineDurationSeconds: number
): EditingCaption[] {
  const selectedIds = new Set(captionIds)
  const sourceSpan = sourceEndSeconds - sourceStartSeconds
  const targetSpan = targetEndSeconds - targetStartSeconds
  if (selectedIds.size === 0 || !Number.isFinite(sourceStartSeconds) || !Number.isFinite(sourceEndSeconds) || sourceSpan <= TIME_EPSILON_SECONDS || !Number.isFinite(targetStartSeconds) || !Number.isFinite(targetEndSeconds) || targetSpan <= TIME_EPSILON_SECONDS) return [...captions]
  const timelineDuration = Math.max(0, Number.isFinite(timelineDurationSeconds) ? timelineDurationSeconds : 0)
  const scale = targetSpan / sourceSpan

  return captions.map((caption) => {
    if (!selectedIds.has(caption.id) || !Number.isFinite(caption.startSeconds) || !Number.isFinite(caption.durationSeconds) || caption.durationSeconds <= TIME_EPSILON_SECONDS) return caption
    const mappedStart = targetStartSeconds + (caption.startSeconds - sourceStartSeconds) * scale
    const mappedDuration = Math.max(MINIMUM_CAPTION_DURATION_SECONDS, caption.durationSeconds * scale)
    const maxStart = Math.max(0, timelineDuration - mappedDuration)
    const startSeconds = clamp(mappedStart, 0, maxStart)
    const durationSeconds = Math.min(mappedDuration, Math.max(MINIMUM_CAPTION_DURATION_SECONDS, timelineDuration - startSeconds))
    const wordScale = durationSeconds / caption.durationSeconds
    const words = caption.words?.flatMap((word) => {
      const start = clamp(word.startSeconds * wordScale, 0, durationSeconds)
      const end = clamp(word.endSeconds * wordScale, 0, durationSeconds)
      return end - start > TIME_EPSILON_SECONDS ? [{ ...word, startSeconds: start, endSeconds: end }] : []
    })
    const { sourceId: _sourceId, sourceStartSeconds: _sourceStartSeconds, sourceEndSeconds: _sourceEndSeconds, ...unanchored } = caption
    return {
      ...unanchored,
      startSeconds,
      durationSeconds,
      ...(caption.words ? { words: words && words.length > 0 ? words : undefined } : {})
    }
  })
}
