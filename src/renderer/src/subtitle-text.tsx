import type { CSSProperties, ReactElement } from 'react'
import { getSubtitlePreset, splitSubtitleTextByKeywords, type SubtitleEmphasisMode, type SubtitlePreset } from '../../shared/subtitle-presets'
import { chunkSubtitleWordsByWidth, getSubtitleMaxWidthEm, joinSubtitleWords, type SubtitleWord } from '../../shared/subtitle-timing'

type SubtitleTextProps = {
  text: string
  presetId: string
  emphasisMode: SubtitleEmphasisMode
  keywords: string
  wordTimings?: readonly SubtitleWord[]
  currentTime?: number
  fontSizePx: number
  lineHeight: number
}

export function getSubtitleStyle(presetId: string, fontSizePx: number, lineHeight: number): CSSProperties {
  const preset = getSubtitlePreset(presetId)
  return {
    '--subtitle-font-size': `${fontSizePx}px`,
    '--subtitle-line-height': String(lineHeight),
    '--subtitle-font-family': getFontFamily(preset),
    '--subtitle-font-weight': String(preset.fontWeight),
    '--subtitle-font-style': preset.italic ? 'italic' : 'normal',
    '--subtitle-text-color': preset.textColor,
    '--subtitle-background': preset.backgroundColor,
    '--subtitle-emphasis-background': preset.emphasisBackgroundColor,
    '--subtitle-emphasis-text-color': preset.emphasisTextColor,
    '--subtitle-text-shadow': preset.textShadow,
    '--subtitle-border-radius': `${preset.borderRadiusPx}px`,
    '--subtitle-emphasis-decoration': preset.emphasisDecoration
  } as CSSProperties
}

function getFontFamily(preset: SubtitlePreset): string {
  if (preset.fontFamily === 'serif') return 'Georgia, "Times New Roman", serif'
  if (preset.fontFamily === 'mono') return 'ui-monospace, SFMono-Regular, Menlo, monospace'
  return 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
}

function normalizeComparableText(text: string): string {
  return text.replace(/\s+/gu, '')
}

function renderTimedLine(line: string, words: readonly SubtitleWord[], currentTime: number, maxEm: number): ReactElement {
  const reconstructed = joinSubtitleWords(words)
  if (normalizeComparableText(reconstructed) !== normalizeComparableText(line)) {
    return <span>{line}</span>
  }

  const chunks = chunkSubtitleWordsByWidth(words, maxEm)
  const activeChunk = chunks.reduce<readonly SubtitleWord[]>((selected, chunk) => {
    const firstWord = chunk[0]
    return firstWord && currentTime >= firstWord.startSeconds ? chunk : selected
  }, chunks[0] ?? words)

  return (
    <span className="subtitle-text-page">
      {activeChunk.map((word, index) => {
        const isActive = currentTime >= word.startSeconds && currentTime < word.endSeconds
        const displayText = index === 0 ? word.text.trimStart() : word.text
        return <span key={`${word.startSeconds}-${word.endSeconds}-${index}`} className={`subtitle-word ${isActive ? 'is-active' : ''}`}>{displayText}</span>
      })}
    </span>
  )
}

export function SubtitleText({ text, presetId, emphasisMode, keywords, wordTimings, currentTime = 0, fontSizePx, lineHeight }: SubtitleTextProps): ReactElement {
  const lines = text.split('\n')
  const viewportWidthPx = typeof window === 'undefined' ? 1280 : window.innerWidth
  const maxEm = getSubtitleMaxWidthEm(fontSizePx, viewportWidthPx)
  return (
    <div className="subtitle-text" style={getSubtitleStyle(presetId, fontSizePx, lineHeight)}>
      {lines.map((line, lineIndex) => (
        <span key={`${line}-${lineIndex}`} className="subtitle-text-line">
          {emphasisMode === 'words' && wordTimings && wordTimings.length > 0 && lineIndex === 0
            ? renderTimedLine(line, wordTimings, currentTime, maxEm)
            : (emphasisMode === 'keywords' ? splitSubtitleTextByKeywords(line, keywords) : [{ text: line, emphasized: false }]).map((part, partIndex) => (
              part.emphasized ? <mark key={`${part.text}-${partIndex}`} className="subtitle-emphasis">{part.text}</mark> : <span key={`${part.text}-${partIndex}`}>{part.text}</span>
            ))}
          {lineIndex < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </div>
  )
}
