import { getSubtitlePreset, splitSubtitleTextByKeywords, type SubtitleRenderSettings } from '../../shared/subtitle-presets'
import type { EditingCaption, EditingCaptionEffect, EditingCaptionLayout } from '../../shared/editing-types'
import { chunkSubtitleWordsByWidth, createFallbackSubtitleWords, getSubtitleMaxWidthEm, joinSubtitleWords, type SubtitleWord } from '../../shared/subtitle-timing'
import { getEditingCaptionEffectAssPrefix } from '../editing/caption-effects'

export type SubtitleAssOptions = SubtitleRenderSettings & {
  presetId?: string
  playResX?: number
  playResY?: number
  captionLayout?: EditingCaptionLayout
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

function getAssCaptionLayoutTag(options: SubtitleAssOptions): string {
  const layout = options.captionLayout
  if (!layout) return ''
  const playResX = Math.max(320, Math.round(options.playResX ?? 1920))
  const playResY = Math.max(240, Math.round(options.playResY ?? 1080))
  return `{\\pos(${Math.round(playResX * layout.xPercent / 100)},${Math.round(playResY * layout.yPercent / 100)})}`
}

function getAssMaxEm(options: SubtitleAssOptions): number {
  const playResX = Math.max(320, Math.round(options.playResX ?? 1920))
  const layout = options.captionLayout
  return getSubtitleMaxWidthEm(options.fontSizePx ?? 14, playResX, layout?.widthPercent ?? 82, layout ? playResX : 720)
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

function canRenderKaraokeText(text: string, words: readonly SubtitleWord[] | undefined): words is readonly SubtitleWord[] {
  if (!words || words.length === 0) return false
  return joinSubtitleWords(words).replace(/\s+/gu, '') === text.replace(/\s+/gu, '')
}

function renderAssKaraokeText(text: string, words: readonly SubtitleWord[], effect: EditingCaptionEffect, options: SubtitleAssOptions): string {
  if (!canRenderKaraokeText(text, words)) return escapeAssText(text)
  return words.map((word, index) => {
    const durationCentiseconds = Math.max(1, Math.round(Math.max(0, word.endSeconds - word.startSeconds) * 100))
    const displayText = index === 0 ? word.text.trimStart() : word.text
    const renderedText = options.emphasisMode === 'keywords' ? renderAssText(displayText, options) : escapeAssText(displayText)
    return `${getEditingCaptionEffectAssPrefix(effect)}{\\k${durationCentiseconds}}${renderedText}`
  }).join('')
}

function buildKaraokeDialogue(startSeconds: number, endSeconds: number, words: readonly SubtitleWord[], effect: EditingCaptionEffect, options: SubtitleAssOptions): string {
  const text = joinSubtitleWords(words)
  return `Dialogue: 0,${formatAssTimestamp(startSeconds)},${formatAssTimestamp(endSeconds)},Default,,0,0,0,,${getAssCaptionLayoutTag(options)}${renderAssKaraokeText(text, words, effect, options)}`
}

function buildWordTimedDialogueEvents(startSeconds: number, endSeconds: number, words: readonly SubtitleWord[], maxEm: number, effect: EditingCaptionEffect, options: SubtitleAssOptions): string[] {
  const groups = effect === 'kinetic-slam' ? words.map((word) => [word]) : chunkSubtitleWordsByWidth(words, maxEm)
  if (groups.length === 0) return []

  return groups.map((group, index) => {
    const firstWord = group[0]
    const nextGroupFirstWord = groups[index + 1]?.[0]
    const groupStart = Math.max(startSeconds, startSeconds + (firstWord?.startSeconds ?? 0))
    const groupEnd = Math.min(endSeconds, nextGroupFirstWord ? startSeconds + nextGroupFirstWord.startSeconds : endSeconds)
    return buildKaraokeDialogue(groupStart, Math.max(groupStart + 0.01, groupEnd), group, effect, options)
  })
}

function buildAssDocument(events: string[], options: SubtitleAssOptions): string {
  const preset = getSubtitlePreset(options.presetId)
  const fontSize = Math.max(12, Math.min(96, Math.round(options.captionLayout?.fontSizePx ?? options.fontSizePx ?? 14)))
  const playResX = Math.max(320, Math.round(options.playResX ?? 1920))
  const playResY = Math.max(240, Math.round(options.playResY ?? 1080))
  const fontFamily = preset.fontFamily === 'serif' ? 'Georgia' : preset.fontFamily === 'mono' ? 'Courier New' : 'Arial'
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${playResX}\nPlayResY: ${playResY}\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${fontFamily},${fontSize},${preset.assPrimaryColor},${preset.assEmphasisColor},${preset.assOutlineColor},${preset.assBackColor},${preset.fontWeight >= 700 ? -1 : 0},${preset.italic ? -1 : 0},${options.captionLayout ? 5 : 2},60,60,54,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`
}

export function buildAssSubtitle(text: string, options: SubtitleAssOptions = {}): string {
  const cues = parseSrt(text)
  const maxEm = getAssMaxEm(options)
  const effect = options.effect ?? 'highlight'
  const events = options.emphasisMode === 'words'
    ? cues.flatMap((cue) => buildWordTimedDialogueEvents(cue.startSeconds, cue.endSeconds, createFallbackSubtitleWords(cue.text, 0, cue.endSeconds - cue.startSeconds), maxEm, effect, options))
    : cues.map((cue) => `Dialogue: 0,${formatAssTimestamp(cue.startSeconds)},${formatAssTimestamp(cue.endSeconds)},Default,,0,0,0,,${getAssCaptionLayoutTag(options)}${renderAssText(cue.text, options)}`)
  return buildAssDocument(events, options)
}

/** Builds an ASS track from edited captions while preserving relative word timing for karaoke highlighting. */
export function buildAssSubtitleFromEditingCaptions(captions: readonly EditingCaption[], options: SubtitleAssOptions = {}): string {
  const maxEm = getAssMaxEm(options)
  const effect = options.effect ?? 'highlight'
  const events = [...captions]
    .filter((caption) => caption.kind === 'source' && caption.text.trim() && caption.durationSeconds > 0)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))
    .map((caption) => {
      const startSeconds = Math.max(0, Number.isFinite(caption.startSeconds) ? caption.startSeconds : 0)
      const endSeconds = startSeconds + Math.max(0.1, caption.durationSeconds)
      if (options.emphasisMode === 'words' || effect !== 'none') {
        const words = canRenderKaraokeText(caption.text.trim(), caption.words) ? caption.words : createFallbackSubtitleWords(caption.text, 0, endSeconds - startSeconds)
        return buildWordTimedDialogueEvents(startSeconds, endSeconds, words, maxEm, effect, options).join('\n')
      }
      return `Dialogue: 0,${formatAssTimestamp(startSeconds)},${formatAssTimestamp(endSeconds)},Default,,0,0,0,,${getAssCaptionLayoutTag(options)}${renderAssText(caption.text.trim(), options)}`
    })
  return buildAssDocument(events, options)
}
