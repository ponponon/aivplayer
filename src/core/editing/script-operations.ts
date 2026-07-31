import type { EditingCaption, EditingScriptSegment } from '../../shared/editing-types'

const EPSILON_SECONDS = 0.05

function overlapSeconds(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): number {
  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart))
}

function normalizeScriptText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Updates one persisted script row without changing its source timing or deletion state. */
export function updateEditingScriptSegmentText(segments: readonly EditingScriptSegment[], segmentId: string, text: string): EditingScriptSegment[] {
  const normalizedText = normalizeScriptText(text)
  if (!normalizedText) return [...segments]
  return segments.map((segment) => segment.id === segmentId && segment.text !== normalizedText ? { ...segment, text: normalizedText } : segment)
}

/** Keeps the materialized source caption in sync with its editable script row. */
export function updateEditingSourceCaptionText(captions: readonly EditingCaption[], captionId: string, text: string): EditingCaption[] {
  const normalizedText = normalizeScriptText(text)
  if (!normalizedText) return [...captions]
  return captions.map((caption) => caption.id === captionId && caption.kind === 'source' && caption.text !== normalizedText ? { ...caption, text: normalizedText } : caption)
}

function translationFor(source: EditingCaption, translations: readonly EditingCaption[]): EditingCaption | null {
  if (!source.sourceId || source.sourceStartSeconds === undefined || source.sourceEndSeconds === undefined) return null
  return translations
    .filter((caption) => caption.sourceId === source.sourceId && caption.sourceStartSeconds !== undefined && caption.sourceEndSeconds !== undefined)
    .map((caption) => ({ caption, overlap: overlapSeconds(source.sourceStartSeconds!, source.sourceEndSeconds!, caption.sourceStartSeconds!, caption.sourceEndSeconds!) }))
    .filter(({ overlap }) => overlap > EPSILON_SECONDS)
    .sort((left, right) => right.overlap - left.overlap)[0]?.caption ?? null
}

/** Merges newly loaded sidecar captions into the persistent script rows. */
export function mergeEditingScriptSegments(
  existing: readonly EditingScriptSegment[] | undefined,
  captions: readonly EditingCaption[]
): EditingScriptSegment[] {
  const previous = new Map((existing ?? []).map((segment) => [segment.id, segment]))
  const sources = captions.filter((caption) => caption.kind === 'source' && caption.sourceId && caption.sourceStartSeconds !== undefined && caption.sourceEndSeconds !== undefined)
  const translations = captions.filter((caption) => caption.kind === 'translation')

  for (const caption of sources) {
    const old = previous.get(caption.id)
    const translation = translationFor(caption, translations)
    previous.set(caption.id, {
      id: caption.id,
      sourceId: caption.sourceId!,
      sourceStartSeconds: caption.sourceStartSeconds!,
      sourceEndSeconds: caption.sourceEndSeconds!,
      text: caption.text,
      ...(translation?.text || old?.translationText ? { translationText: translation?.text ?? old?.translationText } : {}),
      ...(old?.deleted ? { deleted: true } : {})
    })
  }

  return [...previous.values()].sort((left, right) => left.sourceStartSeconds - right.sourceStartSeconds || left.id.localeCompare(right.id))
}

export function setEditingScriptSegmentDeleted(
  segments: readonly EditingScriptSegment[],
  segmentId: string,
  deleted: boolean
): EditingScriptSegment[] {
  return segments.map((segment) => segment.id === segmentId ? { ...segment, ...(deleted ? { deleted: true } : { deleted: undefined }) } : segment)
}

export function scriptSegmentCaption(
  segment: EditingScriptSegment,
  kind: EditingCaption['kind'],
  text: string,
  startSeconds: number,
  durationSeconds: number
): EditingCaption {
  return {
    id: kind === 'source' ? segment.id : `${kind}-${segment.id}`,
    sourceId: segment.sourceId,
    sourceStartSeconds: segment.sourceStartSeconds,
    sourceEndSeconds: segment.sourceEndSeconds,
    kind,
    text,
    startSeconds,
    durationSeconds
  }
}
