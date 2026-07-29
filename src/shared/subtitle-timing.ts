/**
 * Word timing is optional by design. SRT/VTT sidecars from older versions
 * only contain cue ranges, while whisper.cpp's full JSON output can provide
 * token-level timestamps that we normalize into displayable words.
 */
export type SubtitleWord = {
  startSeconds: number
  endSeconds: number
  text: string
}

type WhisperJsonToken = {
  text?: unknown
  timestamps?: {
    from?: unknown
    to?: unknown
  }
  offsets?: {
    from?: unknown
    to?: unknown
  }
}

type WhisperJsonSegment = {
  timestamps?: {
    from?: unknown
    to?: unknown
  }
  offsets?: {
    from?: unknown
    to?: unknown
  }
  text?: unknown
  tokens?: unknown
}

type WhisperJsonDocument = {
  transcription?: unknown
}

type TimedTextRange = {
  startSeconds: number
  endSeconds: number
  text: string
}

function parseTimestamp(value: unknown, offset = false): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, offset ? value / 1000 : value)
  }

  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized) return null
  const match = normalized.match(/^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})$/)
  if (!match) return null
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
}

function readRange(value: WhisperJsonSegment | WhisperJsonToken, fallback: TimedTextRange | null = null): TimedTextRange | null {
  const timestamps = value.timestamps
  const offsets = value.offsets
  const from = parseTimestamp(timestamps?.from) ?? parseTimestamp(offsets?.from, true)
  const to = parseTimestamp(timestamps?.to) ?? parseTimestamp(offsets?.to, true)
  if (from !== null && to !== null && to > from) {
    return { startSeconds: from, endSeconds: to, text: '' }
  }
  return fallback
}

function isCjkText(text: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(text)
}

function isIgnorableWhisperToken(text: string): boolean {
  const normalized = text.trim()
  return !normalized || /^<\|[^>]+\|>$/u.test(normalized) || /^\[[^\]]+\]$/u.test(normalized)
}

function normalizeWordText(text: string): string {
  return text.replace(/\r/g, '').replace(/\n/g, ' ')
}

function appendTokenWord(words: SubtitleWord[], current: SubtitleWord | null): void {
  if (!current || isIgnorableWhisperToken(current.text)) return
  const text = normalizeWordText(current.text)
  if (!text.trim()) return
  words.push({
    startSeconds: Math.max(0, current.startSeconds),
    endSeconds: Math.max(current.startSeconds, current.endSeconds),
    text
  })
}

function tokensToWords(tokens: WhisperJsonToken[], segmentRange: TimedTextRange): SubtitleWord[] {
  const words: SubtitleWord[] = []
  let current: SubtitleWord | null = null

  for (const token of tokens) {
    const text = typeof token.text === 'string' ? normalizeWordText(token.text) : ''
    if (isIgnorableWhisperToken(text)) continue
    const range = readRange(token, segmentRange)
    if (!range) continue

    // Whisper's BPE tokens use a leading space for Latin word boundaries.
    // For CJK, adjacent characters commonly have no spaces, so keeping each
    // token independently produces the useful karaoke/highlight cadence.
    const startsNewWord = current !== null && (/^\s/u.test(text) || isCjkText(text))
    if (startsNewWord) {
      appendTokenWord(words, current)
      current = null
    }

    if (!current) {
      current = { startSeconds: range.startSeconds, endSeconds: range.endSeconds, text }
    } else {
      current.text += text
      current.endSeconds = Math.max(current.endSeconds, range.endSeconds)
    }
  }

  appendTokenWord(words, current)
  return words.filter((word) => word.endSeconds >= word.startSeconds && word.text.trim().length > 0)
}

function createFallbackWords(text: string, startSeconds: number, endSeconds: number): SubtitleWord[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n/g, ' ').trim()
  if (!normalized || endSeconds <= startSeconds) return []

  const fragments = isCjkText(normalized)
    ? [...normalized].filter((fragment) => fragment.trim().length > 0)
    : (normalized.match(/\s*\S+/gu) ?? [])
  if (fragments.length === 0) return []

  const weights = fragments.map((fragment) => Math.max(1, fragment.trim().length))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  const duration = endSeconds - startSeconds
  let cursor = startSeconds

  return fragments.map((fragment, index) => {
    const next = index === fragments.length - 1 ? endSeconds : cursor + duration * (weights[index] ?? 1) / totalWeight
    const word = { startSeconds: cursor, endSeconds: next, text: fragment }
    cursor = next
    return word
  })
}

/** Parses whisper.cpp `-ojf/--output-json-full` output into display words. */
export function parseWhisperSubtitleWords(text: string): SubtitleWord[] {
  try {
    const document = JSON.parse(text) as WhisperJsonDocument
    if (!Array.isArray(document.transcription)) return []

    const words: SubtitleWord[] = []
    for (const rawSegment of document.transcription) {
      if (!rawSegment || typeof rawSegment !== 'object') continue
      const segment = rawSegment as WhisperJsonSegment
      const textValue = typeof segment.text === 'string' ? segment.text : ''
      const range = readRange(segment)
      if (!range || !Array.isArray(segment.tokens)) continue
      const tokens = segment.tokens.filter((token): token is WhisperJsonToken => Boolean(token && typeof token === 'object'))
      words.push(...tokensToWords(tokens, { ...range, text: textValue }))
    }
    return words.sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
  } catch {
    return []
  }
}

export function getSubtitleWordSidecarPath(subtitlePath: string): string | null {
  if (!subtitlePath.trim()) return null
  return /\.(?:srt|vtt)$/iu.test(subtitlePath) ? subtitlePath.replace(/\.(?:srt|vtt)$/iu, '.json') : null
}

export function attachSubtitleWords<T extends TimedTextRange>(segments: readonly T[], words: readonly SubtitleWord[], useFallback = false): Array<T & { words?: SubtitleWord[] }> {
  return segments.map((segment) => {
    const matched = words.filter((word) => word.endSeconds > segment.startSeconds + 0.001 && word.startSeconds < segment.endSeconds - 0.001)
    const resolved = matched.length > 0 ? matched : useFallback ? createFallbackWords(segment.text, segment.startSeconds, segment.endSeconds) : []
    return resolved.length > 0 ? { ...segment, words: resolved } : { ...segment }
  })
}

export function createFallbackSubtitleWords(text: string, startSeconds: number, endSeconds: number): SubtitleWord[] {
  return createFallbackWords(text, startSeconds, endSeconds)
}
