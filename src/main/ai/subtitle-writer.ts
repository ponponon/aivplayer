import type { TranscriptSegment } from '../../shared/media-types.ts'

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0')
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

export function writeSrt(segments: TranscriptSegment[]): string {
  return `${segments
    .map((segment, index) => {
      const text = normalizeText(segment.text)
      return `${index + 1}\n${formatSrtTimestamp(segment.startSeconds)} --> ${formatSrtTimestamp(segment.endSeconds)}\n${text}`
    })
    .join('\n\n')}\n`
}

export function writeVtt(segments: TranscriptSegment[]): string {
  return `WEBVTT\n\n${segments
    .map((segment) => {
      const text = normalizeText(segment.text)
      return `${formatVttTimestamp(segment.startSeconds)} --> ${formatVttTimestamp(segment.endSeconds)}\n${text}`
    })
    .join('\n\n')}\n`
}
