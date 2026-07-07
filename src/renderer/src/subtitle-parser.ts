export type SubtitleCue = {
  startSeconds: number
  endSeconds: number
  text: string
}

const VTT_TIMESTAMP_PATTERN = /^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})$/
const VTT_TIMECODE_PATTERN =
  /^(?<start>(?:(?:\d+):)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*(?<end>(?:(?:\d+):)?\d{2}:\d{2}[.,]\d{3})(?:\s+.*)?$/

function parseTimestamp(timestamp: string): number {
  const match = timestamp.trim().match(VTT_TIMESTAMP_PATTERN)

  if (!match) {
    return 0
  }

  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const milliseconds = Number(match[4])

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
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

function decodeHtmlEntities(text: string): string {
  const namedEntities: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    '#39': "'",
    hellip: '…',
    ndash: '–',
    mdash: '—'
  }

  return text.replace(/&([a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#x[0-9a-fA-F]+);/g, (match, entityBody) => {
    const normalizedEntityBody = String(entityBody).toLowerCase()

    if (normalizedEntityBody.startsWith('#x')) {
      const codePoint = Number.parseInt(normalizedEntityBody.slice(2), 16)
      if (!Number.isNaN(codePoint)) {
        try {
          return String.fromCodePoint(codePoint)
        } catch {
          return match
        }
      }
      return match
    }

    if (normalizedEntityBody.startsWith('#')) {
      const codePoint = Number.parseInt(normalizedEntityBody.slice(1), 10)
      if (!Number.isNaN(codePoint)) {
        try {
          return String.fromCodePoint(codePoint)
        } catch {
          return match
        }
      }
      return match
    }

    return namedEntities[normalizedEntityBody] ?? match
  })
}

function stripInlineMarkup(text: string): string {
  return text
    .replace(/<\/?v(?:\s+[^>]*)?>/gi, '')
    .replace(/<[^>\n]+>/g, '')
}

export function parseVtt(text: string): SubtitleCue[] {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const cues: SubtitleCue[] = []
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

    const text = cueLines
      .join('\n')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => decodeHtmlEntities(stripInlineMarkup(line)).replace(/\s+/g, ' ').trim())
      .filter((line) => line.length > 0)
      .join('\n')

    if (text) {
      cues.push({
        startSeconds: parsedTimecode.startSeconds,
        endSeconds: parsedTimecode.endSeconds,
        text
      })
    }
  }

  return cues
}

export function findActiveCue(cues: SubtitleCue[], currentTime: number): SubtitleCue | null {
  for (const cue of cues) {
    if (currentTime >= cue.startSeconds && currentTime <= cue.endSeconds) {
      return cue
    }
  }
  return null
}
