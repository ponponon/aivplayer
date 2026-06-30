import type { TranscriptSegment } from '../../shared/media-types.ts'

const VTT_TIMESTAMP_PATTERN = /^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})$/
const VTT_TIMECODE_PATTERN =
  /^(?<start>(?:(?:\d+):)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*(?<end>(?:(?:\d+):)?\d{2}:\d{2}[.,]\d{3})(?:\s+.*)?$/

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0')
}

function parseTimestamp(timestamp: string): number {
  const match = timestamp.trim().match(VTT_TIMESTAMP_PATTERN)

  if (!match) {
    throw new Error(`无法解析 VTT 时间戳：${timestamp}`)
  }

  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const milliseconds = Number(match[4])

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

function normalizeCueLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function decodeCueHtmlEntities(text: string): string {
  const namedEntities: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    '#39': "'",
    lrm: '',
    rlm: '',
    hellip: '…',
    ndash: '–',
    mdash: '—',
    bull: '•',
    middot: '·',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“'
  }

  const decodeCodePoint = (value: string, radix: number): string => {
    const codePoint = Number.parseInt(value, radix)

    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
      return ''
    }

    try {
      return String.fromCodePoint(codePoint)
    } catch {
      return ''
    }
  }

  return text.replace(/&([a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#x[0-9a-fA-F]+);/g, (match, entityBody) => {
    const normalizedEntityBody = String(entityBody).toLowerCase()

    if (normalizedEntityBody.startsWith('#x')) {
      return decodeCodePoint(normalizedEntityBody.slice(2), 16) || match
    }

    if (normalizedEntityBody.startsWith('#')) {
      return decodeCodePoint(normalizedEntityBody.slice(1), 10) || match
    }

    return namedEntities[normalizedEntityBody] ?? match
  })
}

function stripVttInlineMarkup(text: string): string {
  return text
    .replace(/<\/?v(?:\s+[^>]*)?>/gi, '')
    .replace(/<[^>\n]+>/g, '')
}

function normalizeSrtCueText(text: string): string {
  const withoutRubyAnnotations = text
    .replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, '')
    .replace(/<\/?rp\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')

  const lines = withoutRubyAnnotations
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => normalizeCueLine(decodeCueHtmlEntities(stripVttInlineMarkup(line))))

  while (lines.length > 0 && lines[0] === '') {
    lines.shift()
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return lines.join('\n')
}

function escapeVttText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function parseVttTimecodeLine(line: string): { startSeconds: number; endSeconds: number } | null {
  const match = line.trim().match(VTT_TIMECODE_PATTERN)

  if (!match?.groups) {
    return null
  }

  return {
    startSeconds: parseTimestamp(match.groups.start ?? ''),
    endSeconds: parseTimestamp(match.groups.end ?? '')
  }
}

function skipUntilBlankLine(lines: string[], index: number): number {
  let nextIndex = index

  while (nextIndex < lines.length) {
    if ((lines[nextIndex] ?? '').trim() === '') {
      return nextIndex + 1
    }

    nextIndex += 1
  }

  return nextIndex
}

export function formatSrtTimestamp(seconds: number): string {
  const millisecondsTotal = Math.max(0, Math.round(seconds * 1000))
  const hours = Math.floor(millisecondsTotal / 3_600_000)
  const minutes = Math.floor((millisecondsTotal % 3_600_000) / 60_000)
  const secs = Math.floor((millisecondsTotal % 60_000) / 1000)
  const milliseconds = millisecondsTotal % 1000

  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(milliseconds, 3)}`
}

export function formatVttTimestamp(seconds: number): string {
  return formatSrtTimestamp(seconds).replace(',', '.')
}

export function parseVtt(text: string): TranscriptSegment[] {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const segments: TranscriptSegment[] = []
  let index = 0

  while (index < lines.length) {
    const rawLine = lines[index] ?? ''
    const line = rawLine.trim()

    if (!line) {
      index += 1
      continue
    }

    if (line === 'WEBVTT' || line.startsWith('WEBVTT ')) {
      index += 1
      continue
    }

    if (
      line === 'STYLE' ||
      line.startsWith('STYLE ') ||
      line === 'REGION' ||
      line.startsWith('REGION ') ||
      line === 'NOTE' ||
      line.startsWith('NOTE ')
    ) {
      index = skipUntilBlankLine(lines, index + 1)
      continue
    }

    if (line.startsWith('X-TIMESTAMP-MAP=')) {
      index += 1
      continue
    }

    let parsedTimecode = parseVttTimecodeLine(line)

    if (!parsedTimecode) {
      const nextLine = lines[index + 1]?.trim() ?? ''
      parsedTimecode = parseVttTimecodeLine(nextLine)

      if (!parsedTimecode) {
        index += 1
        continue
      }

      index += 1
    }

    index += 1
    const cueLines: string[] = []

    while (index < lines.length) {
      const cueLine = lines[index] ?? ''
      if (cueLine.trim() === '') {
        break
      }

      cueLines.push(cueLine)
      index += 1
    }

    segments.push({
      startSeconds: parsedTimecode.startSeconds,
      endSeconds: parsedTimecode.endSeconds,
      text: cueLines.join('\n')
    })
  }

  return segments
}

export function convertVttToSrt(text: string): string {
  return writeSrt(parseVtt(text))
}

export function writeSrt(segments: TranscriptSegment[]): string {
  if (segments.length === 0) {
    return ''
  }

  return `${segments
    .map((segment, index) => {
      const text = normalizeSrtCueText(segment.text)
      return `${index + 1}\n${formatSrtTimestamp(segment.startSeconds)} --> ${formatSrtTimestamp(segment.endSeconds)}\n${text}`
    })
    .join('\n\n')}\n`
}

export function writeVtt(segments: TranscriptSegment[]): string {
  return `WEBVTT\n\n${segments
    .map((segment) => {
      const text = segment.text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => escapeVttText(normalizeCueLine(line)))
        .join('\n')
      return `${formatVttTimestamp(segment.startSeconds)} --> ${formatVttTimestamp(segment.endSeconds)}\n${text}`
    })
    .join('\n\n')}\n`
}
