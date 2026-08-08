import { parseVtt } from './subtitle-writer'

const TIMECODE_PATTERN = /^(?:(?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*(?:(?:\d+:)?\d{2}:\d{2}[.,]\d{3})(?:\s+.*)?$/

export type SubtitleValidationReason = 'empty' | 'no-cues' | 'invalid-cues'

export type SubtitleValidationResult = {
  valid: boolean
  cueCount: number
  reason?: SubtitleValidationReason
}

function isMetadataBlock(block: string[]): boolean {
  const firstLine = block[0]?.trim() ?? ''
  return firstLine === 'STYLE' || firstLine.startsWith('STYLE ') || firstLine === 'REGION' || firstLine.startsWith('REGION ') || firstLine === 'NOTE' || firstLine.startsWith('NOTE ')
}

function hasMalformedCueBlock(text: string, cueCount: number): boolean {
  const blocks = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n\s*\n/)
  let timecodeCount = 0

  for (const block of blocks) {
    const lines = block.split('\n')
    if (isMetadataBlock(lines)) continue

    const arrowLines = lines.filter((line) => line.includes('-->'))
    if (arrowLines.length === 0) continue

    const validTimecodeLines = arrowLines.filter((line) => TIMECODE_PATTERN.test(line.trim()))
    if (validTimecodeLines.length === 0 || validTimecodeLines.length > 1) return true
    timecodeCount += 1
  }

  return timecodeCount !== cueCount
}

export function validateSubtitleText(text: string): SubtitleValidationResult {
  if (!text.trim()) return { valid: false, cueCount: 0, reason: 'empty' }

  const cues = parseVtt(text)
  if (cues.length === 0) return { valid: false, cueCount: 0, reason: 'no-cues' }
  if (hasMalformedCueBlock(text, cues.length)) return { valid: false, cueCount: cues.length, reason: 'invalid-cues' }
  if (cues.some((cue) => !Number.isFinite(cue.startSeconds) || !Number.isFinite(cue.endSeconds) || cue.endSeconds <= cue.startSeconds || !cue.text.trim())) {
    return { valid: false, cueCount: cues.length, reason: 'invalid-cues' }
  }

  return { valid: true, cueCount: cues.length }
}
