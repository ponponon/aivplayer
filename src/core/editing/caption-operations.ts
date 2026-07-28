import type { EditingCaption } from '../../shared/editing-types'

export function moveEditingCaption(captions: readonly EditingCaption[], captionId: string, startSeconds: number, timelineDurationSeconds: number): EditingCaption[] {
  const caption = captions.find((item) => item.id === captionId)
  if (!caption) return [...captions]
  const maxStartSeconds = Math.max(0, timelineDurationSeconds - caption.durationSeconds)
  const nextStartSeconds = Math.min(Math.max(Number.isFinite(startSeconds) ? startSeconds : 0, 0), maxStartSeconds)
  if (Math.abs(nextStartSeconds - caption.startSeconds) < 0.001) return [...captions]
  return captions.map((item) => {
    if (item.id !== captionId) return item
    return {
      id: item.id,
      startSeconds: nextStartSeconds,
      durationSeconds: item.durationSeconds,
      text: item.text,
      kind: item.kind
    }
  })
}
