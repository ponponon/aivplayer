import type { EditingCaption, EditingCaptionWord, EditingScriptSegment } from '../../shared/editing-types'
import { joinSubtitleWords } from '../../shared/subtitle-timing'

const EPSILON_SECONDS = 0.05

function overlapSeconds(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): number {
  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart))
}

function normalizeScriptText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function sameEditingScriptWord(left: EditingCaptionWord, right: EditingCaptionWord): boolean {
  return Math.abs(left.startSeconds - right.startSeconds) < 0.001 && Math.abs(left.endSeconds - right.endSeconds) < 0.001 && left.text === right.text
}

function normalizeReplacementText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Maps a script word's row-relative timing back to the source file timeline. */
export function getEditingScriptWordSourceRange(segment: Pick<EditingScriptSegment, 'sourceStartSeconds' | 'sourceEndSeconds'>, word: EditingCaptionWord): { startSeconds: number; endSeconds: number } | null {
  const startSeconds = Math.max(segment.sourceStartSeconds, segment.sourceStartSeconds + word.startSeconds)
  const endSeconds = Math.min(segment.sourceEndSeconds, segment.sourceStartSeconds + word.endSeconds)
  return Number.isFinite(startSeconds) && Number.isFinite(endSeconds) && endSeconds - startSeconds > 0.001 ? { startSeconds, endSeconds } : null
}

/** Conservative filler-word matcher shared by the script panel and batch action. */
export function isEditingScriptFillerWord(word: Pick<EditingCaptionWord, 'text'>): boolean {
  return /^(嗯+|呃+|唔+|诶+|额+|um+|uh+|emm+|hmm+)[,。,.!?!?…]?$/iu.test(word.text.trim())
}

/** Removes one timed word from a script row while keeping the remaining text joinable. */
export function removeEditingScriptWord(segment: EditingScriptSegment, word: EditingCaptionWord): EditingScriptSegment {
  if (!segment.words) return segment
  const words = segment.words.filter((candidate) => !sameEditingScriptWord(candidate, word))
  if (words.length === segment.words.length) return segment
  return { ...segment, text: joinSubtitleWords(words), words }
}

/** Removes several timed words from a script row in one pure operation. */
export function removeEditingScriptWords(segment: EditingScriptSegment, wordsToRemove: readonly EditingCaptionWord[]): EditingScriptSegment {
  if (!segment.words || wordsToRemove.length === 0) return segment
  const words = segment.words.filter((candidate) => !wordsToRemove.some((word) => sameEditingScriptWord(candidate, word)))
  if (words.length === segment.words.length) return segment
  return { ...segment, text: joinSubtitleWords(words), words }
}

/** Replaces one word while deliberately preserving its original timing. */
export function replaceEditingScriptWord(segment: EditingScriptSegment, word: EditingCaptionWord, replacementText: string): EditingScriptSegment {
  if (!segment.words) return segment
  const normalizedText = normalizeReplacementText(replacementText)
  if (!normalizedText) return segment
  let replaced = false
  const words = segment.words.map((candidate) => {
    if (!sameEditingScriptWord(candidate, word)) return candidate
    replaced = true
    return { ...candidate, text: normalizedText }
  })
  return replaced ? { ...segment, text: joinSubtitleWords(words), words } : segment
}

/** Updates one persisted script row without changing its source timing or deletion state. */
export function updateEditingScriptSegmentText(segments: readonly EditingScriptSegment[], segmentId: string, text: string): EditingScriptSegment[] {
  const normalizedText = normalizeScriptText(text)
  if (!normalizedText) return [...segments]
  return segments.map((segment) => {
    if (segment.id !== segmentId || segment.text === normalizedText) return segment
    const next = { ...segment, text: normalizedText }
    if (segment.words) delete next.words
    return next
  })
}

/** Keeps the materialized source caption in sync with its editable script row. */
export function updateEditingSourceCaptionText(captions: readonly EditingCaption[], captionId: string, text: string): EditingCaption[] {
  const normalizedText = normalizeScriptText(text)
  if (!normalizedText) return [...captions]
  return captions.map((caption) => {
    if (caption.id !== captionId || caption.kind !== 'source' || caption.text === normalizedText) return caption
    const next = { ...caption, text: normalizedText }
    if (caption.words) delete next.words
    return next
  })
}

/** Updates a source caption's visible text without discarding its surviving word timings. */
export function syncEditingSourceCaptionText(captions: readonly EditingCaption[], captionId: string, text: string): EditingCaption[] {
  const normalizedText = normalizeScriptText(text)
  if (!normalizedText) return [...captions]
  return captions.map((caption) => caption.id === captionId && caption.kind === 'source' && caption.text !== normalizedText
    ? { ...caption, text: normalizedText }
    : caption)
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
      text: old?.text ?? caption.text,
      ...(old?.words && old.words.length > 0 ? { words: old.words } : caption.words && caption.words.length > 0 ? { words: caption.words } : {}),
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
    durationSeconds,
    ...(segment.words && segment.words.length > 0 ? { words: segment.words } : {})
  }
}
