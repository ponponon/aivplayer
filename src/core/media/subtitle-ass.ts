import { getSubtitlePreset, splitSubtitleTextByKeywords, type SubtitleRenderSettings } from '../../shared/subtitle-presets'
import type { EditingCaption } from '../../shared/editing-types'

export type SubtitleAssOptions = SubtitleRenderSettings & {
  presetId?: string
  playResX?: number
  playResY?: number
}

type AssCue = { startSeconds: number; endSeconds: number; text: string }

const SRT_TIME = /^(?:(\d+):)?(\d{2}):(\d{2}),(\d{3})$/
const SRT_CUE = /^(?<start>(?:(?:\d+):)?\d{2}:\d{2},\d{3})\s*-->\s*(?<end>(?:(?:\d+):)?\d{2}:\d{2},\d{3})/

function parseTimestamp(value: string): number {
  const match = value.trim().match(SRT_TIME)
  if (!match) return 0
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
}

function parseSrt(text: string): AssCue[] {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const cues: AssCue[] = []
  for (let index = 0; index < lines.length;) {
    while (index < lines.length && !(lines[index] ?? '').trim()) index += 1
    if (index >= lines.length) break
    if (/^\d+$/.test((lines[index] ?? '').trim())) index += 1
    const match = (lines[index] ?? '').trim().match(SRT_CUE)
    if (!match?.groups) { index += 1; continue }
    const startSeconds = parseTimestamp(match.groups.start ?? '')
    const endSeconds = parseTimestamp(match.groups.end ?? '')
    index += 1
    const cueLines: string[] = []
    while (index < lines.length && (lines[index] ?? '').trim()) cueLines.push(lines[index++] ?? '')
    if (endSeconds > startSeconds && cueLines.join('\n').trim()) cues.push({ startSeconds, endSeconds, text: cueLines.join('\n') })
  }
  return cues
}

function formatAssTimestamp(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const remaining = safe % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${remaining.toFixed(2).padStart(5, '0')}`
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/[{}]/g, '').replace(/\r/g, '')
}

function renderAssText(text: string, options: SubtitleAssOptions): string {
  const preset = getSubtitlePreset(options.presetId)
  const lines = text.split(/\r?\n/)
  return lines.map((line) => {
    const parts = options.emphasisMode === 'keywords' ? splitSubtitleTextByKeywords(line, options.keywords ?? '') : [{ text: line, emphasized: false }]
    return parts.map((part) => {
      const safeText = escapeAssText(part.text)
      if (!part.emphasized) return safeText
      const underline = preset.assEmphasisUnderline ? '\\u1' : ''
      return `{\\c${preset.assEmphasisColor}\\b1${underline}}${safeText}{\\rDefault}`
    }).join('')
  }).join('\\N')
}

function canRenderKaraokeText(text: string, words: EditingCaption['words']): words is NonNullable<EditingCaption['words']> {
  if (!words || words.length === 0) return false
  return words.map((word) => word.text).join('').replace(/\s+/gu, '') === text.replace(/\s+/gu, '')
}

function renderAssKaraokeText(text: string, words: EditingCaption['words']): string {
  if (!canRenderKaraokeText(text, words)) return escapeAssText(text)
  return words.map((word) => {
    const durationCentiseconds = Math.max(1, Math.round(Math.max(0, word.endSeconds - word.startSeconds) * 100))
    return `{\\k${durationCentiseconds}}${escapeAssText(word.text)}`
  }).join('')
}

function buildAssDocument(events: string[], options: SubtitleAssOptions): string {
  const preset = getSubtitlePreset(options.presetId)
  const fontSize = Math.max(12, Math.min(72, Math.round(options.fontSizePx ?? 14)))
  const playResX = Math.max(320, Math.round(options.playResX ?? 1920))
  const playResY = Math.max(240, Math.round(options.playResY ?? 1080))
  const fontFamily = preset.fontFamily === 'serif' ? 'Georgia' : preset.fontFamily === 'mono' ? 'Courier New' : 'Arial'
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${playResX}\nPlayResY: ${playResY}\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${fontFamily},${fontSize},${preset.assPrimaryColor},${preset.assEmphasisColor},${preset.assOutlineColor},${preset.assBackColor},${preset.fontWeight >= 700 ? -1 : 0},${preset.italic ? -1 : 0},2,60,60,54,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`
}

export function buildAssSubtitle(text: string, options: SubtitleAssOptions = {}): string {
  const cues = parseSrt(text)
  const events = cues.map((cue) => `Dialogue: 0,${formatAssTimestamp(cue.startSeconds)},${formatAssTimestamp(cue.endSeconds)},Default,,0,0,0,,${renderAssText(cue.text, options)}`)
  return buildAssDocument(events, options)
}

/** Builds an ASS track from edited captions while preserving relative word timing for karaoke highlighting. */
export function buildAssSubtitleFromEditingCaptions(captions: readonly EditingCaption[], options: SubtitleAssOptions = {}): string {
  const events = [...captions]
    .filter((caption) => caption.kind === 'source' && caption.text.trim() && caption.durationSeconds > 0)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))
    .map((caption) => {
      const startSeconds = Math.max(0, Number.isFinite(caption.startSeconds) ? caption.startSeconds : 0)
      const endSeconds = startSeconds + Math.max(0.1, caption.durationSeconds)
      const text = options.emphasisMode === 'words' ? renderAssKaraokeText(caption.text.trim(), caption.words) : renderAssText(caption.text.trim(), options)
      return `Dialogue: 0,${formatAssTimestamp(startSeconds)},${formatAssTimestamp(endSeconds)},Default,,0,0,0,,${text}`
    })
  return buildAssDocument(events, options)
}
