import type { EditingCaption, EditingVideoClip } from '../../shared/editing-types'

type EditingCaptionReplacementTarget = {
  clip: Pick<EditingVideoClip, 'sourceId'>
  editedStartSeconds: number
  editedEndSeconds: number
}

export function remapEditingCaptionsForReplacement(captions: readonly EditingCaption[], target: EditingCaptionReplacementTarget, sourceId: string): EditingCaption[] {
  return captions.map((caption) => {
    const overlapStart = Math.max(caption.startSeconds, target.editedStartSeconds)
    const overlapEnd = Math.min(caption.startSeconds + caption.durationSeconds, target.editedEndSeconds)
    if (caption.sourceId !== target.clip.sourceId || caption.sourceStartSeconds === undefined || caption.sourceEndSeconds === undefined || overlapEnd - overlapStart <= 0.001) return caption
    const durationSeconds = overlapEnd - overlapStart
    const wordOffsetSeconds = overlapStart - caption.startSeconds
    const words = caption.words?.flatMap((word) => {
      const startSeconds = Math.max(0, word.startSeconds - wordOffsetSeconds)
      const endSeconds = Math.min(durationSeconds, word.endSeconds - wordOffsetSeconds)
      return endSeconds > startSeconds ? [{ ...word, startSeconds, endSeconds }] : []
    })
    return { ...caption, sourceId, sourceStartSeconds: overlapStart - target.editedStartSeconds, sourceEndSeconds: overlapEnd - target.editedStartSeconds, startSeconds: overlapStart, durationSeconds, ...(caption.words ? { words: words && words.length > 0 ? words : undefined } : {}) }
  })
}

export function moveEditingCaption(captions: readonly EditingCaption[], captionId: string, startSeconds: number, timelineDurationSeconds: number): EditingCaption[] {
  const caption = captions.find((item) => item.id === captionId)
  if (!caption) return [...captions]
  const maxStartSeconds = Math.max(0, timelineDurationSeconds - caption.durationSeconds)
  const nextStartSeconds = Math.min(Math.max(Number.isFinite(startSeconds) ? startSeconds : 0, 0), maxStartSeconds)
  if (Math.abs(nextStartSeconds - caption.startSeconds) < 0.001) return [...captions]
  return captions.map((item) => {
    if (item.id !== captionId) return item
    const { sourceId: _sourceId, sourceStartSeconds: _sourceStartSeconds, sourceEndSeconds: _sourceEndSeconds, ...unanchored } = item
    return { ...unanchored, startSeconds: nextStartSeconds }
  })
}

/** Resizes a caption from either edge and intentionally removes source anchoring after a manual trim. */
export function resizeEditingCaption(captions: readonly EditingCaption[], captionId: string, startSeconds: number, endSeconds: number, timelineDurationSeconds: number): EditingCaption[] {
  const minimumDurationSeconds = 0.1
  const safeTimelineDuration = Math.max(0, Number.isFinite(timelineDurationSeconds) ? timelineDurationSeconds : 0)
  return captions.map((caption) => {
    if (caption.id !== captionId) return caption
    const nextStartSeconds = Math.min(Math.max(0, Number.isFinite(startSeconds) ? startSeconds : caption.startSeconds), Math.max(0, safeTimelineDuration - minimumDurationSeconds))
    const nextEndSeconds = Math.min(safeTimelineDuration, Math.max(nextStartSeconds + minimumDurationSeconds, Number.isFinite(endSeconds) ? endSeconds : nextStartSeconds + caption.durationSeconds))
    const durationSeconds = Math.max(minimumDurationSeconds, nextEndSeconds - nextStartSeconds)
    const wordOffsetSeconds = nextStartSeconds - caption.startSeconds
    const words = caption.words?.flatMap((word) => {
      const nextWordStartSeconds = Math.max(0, word.startSeconds - wordOffsetSeconds)
      const nextWordEndSeconds = Math.min(durationSeconds, word.endSeconds - wordOffsetSeconds)
      return nextWordEndSeconds > nextWordStartSeconds ? [{ ...word, startSeconds: nextWordStartSeconds, endSeconds: nextWordEndSeconds }] : []
    })
    const { sourceId: _sourceId, sourceStartSeconds: _sourceStartSeconds, sourceEndSeconds: _sourceEndSeconds, ...unanchored } = caption
    return { ...unanchored, startSeconds: nextStartSeconds, durationSeconds, ...(caption.words ? { words: words && words.length > 0 ? words : undefined } : {}) }
  })
}
