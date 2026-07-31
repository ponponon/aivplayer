import type { CSSProperties, ReactElement } from 'react'
import { getSubtitlePreset, normalizeSubtitleKeywords, splitSubtitleTextByKeywords, type SubtitleEmphasisMode, type SubtitlePreset } from '../../shared/subtitle-presets'
import { chunkSubtitleWordsByWidth, getSubtitleMaxWidthEm, joinSubtitleWords, type SubtitleWord } from '../../shared/subtitle-timing'
import type { EditingCaptionEffect } from '../../shared/editing-types'
import { getEditingCaptionWordEffectState } from '../../core/editing/caption-effects'

type SubtitleTextProps = {
  text: string
  presetId: string
  emphasisMode: SubtitleEmphasisMode
  keywords: string
  wordTimings?: readonly SubtitleWord[]
  currentTime?: number
  effect?: EditingCaptionEffect
  fontSizePx: number
  lineHeight: number
  maxWidthPx?: number
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

type SubtitleKeywordRange = { start: number; end: number }

function getSubtitleKeywordRanges(text: string, keywordsText: string): readonly SubtitleKeywordRange[] {
  const normalizedText = text.toLocaleLowerCase()
  const ranges: SubtitleKeywordRange[] = []
  for (const keyword of normalizeSubtitleKeywords(keywordsText).split('\n').filter(Boolean)) {
    const normalizedKeyword = keyword.toLocaleLowerCase()
    let searchFrom = 0
    while (searchFrom < normalizedText.length) {
      const start = normalizedText.indexOf(normalizedKeyword, searchFrom)
      if (start < 0) break
      ranges.push({ start, end: start + normalizedKeyword.length })
      searchFrom = start + Math.max(1, normalizedKeyword.length)
    }
  }
  return ranges
}

function getJoinedWordRange(words: readonly SubtitleWord[], wordIndex: number): SubtitleKeywordRange {
  const prefix = joinSubtitleWords(words.slice(0, wordIndex))
  const throughWord = joinSubtitleWords(words.slice(0, wordIndex + 1))
  return { start: prefix.length, end: throughWord.length }
}

function renderTimedLine(line: string, words: readonly SubtitleWord[], currentTime: number, maxEm: number, effect: EditingCaptionEffect, emphasisMode: SubtitleEmphasisMode, keywords: string): ReactElement {
  const reconstructed = joinSubtitleWords(words)
  if (normalizeComparableText(reconstructed) !== normalizeComparableText(line)) {
    return <span>{line}</span>
  }

  const chunks = chunkSubtitleWordsByWidth(words, maxEm)
  const activeChunk = chunks.reduce<readonly SubtitleWord[]>((selected, chunk) => {
    const firstWord = chunk[0]
    return firstWord && currentTime >= firstWord.startSeconds ? chunk : selected
  }, chunks[0] ?? words)
  const keywordRanges = emphasisMode === 'keywords' ? getSubtitleKeywordRanges(reconstructed, keywords) : []

  return (
    <span className="subtitle-text-page">
      {activeChunk.map((word, index) => {
        const effectState = getEditingCaptionWordEffectState(effect, word.startSeconds, word.endSeconds, currentTime)
        const displayText = index === 0 ? word.text.trimStart() : word.text
        const effectStyle = effect === 'word-pop' || effect === 'kinetic-slam'
          ? { '--subtitle-word-scale': String(effectState.scale), '--subtitle-word-opacity': String(effectState.opacity), '--subtitle-word-y': `${effectState.translateY}px`, '--subtitle-word-rotate': `${effectState.rotate}deg` } as CSSProperties
          : undefined
        const wordRange = emphasisMode === 'keywords' ? getJoinedWordRange(words, words.indexOf(word)) : null
        const overlapsKeyword = wordRange !== null && keywordRanges.some((range) => range.start < wordRange.end && range.end > wordRange.start)
        const content = emphasisMode === 'keywords'
          ? (() => {
            const parts = splitSubtitleTextByKeywords(displayText, keywords)
            const hasDirectMatch = parts.some((part) => part.emphasized)
            if (!hasDirectMatch && overlapsKeyword && displayText) return <mark className="subtitle-emphasis">{displayText}</mark>
            return parts.map((part, partIndex) => part.emphasized ? <mark key={`${part.text}-${partIndex}`} className="subtitle-emphasis">{part.text}</mark> : <span key={`${part.text}-${partIndex}`}>{part.text}</span>)
          })()
          : displayText
        return <span key={`${word.startSeconds}-${word.endSeconds}-${index}`} className={`subtitle-word ${effectState.active ? 'is-active' : ''}`} style={effectStyle}>{content}</span>
      })}
    </span>
  )
}

export function SubtitleText({ text, presetId, emphasisMode, keywords, wordTimings, currentTime = 0, effect = 'none', fontSizePx, lineHeight, maxWidthPx }: SubtitleTextProps): ReactElement {
  const lines = text.split('\n')
  const viewportWidthPx = typeof window === 'undefined' ? 1280 : window.innerWidth
  const maxEm = maxWidthPx === undefined ? getSubtitleMaxWidthEm(fontSizePx, viewportWidthPx) : getSubtitleMaxWidthEm(fontSizePx, maxWidthPx, 100, maxWidthPx)
  return (
    <div className={`subtitle-text is-effect-${effect}`} style={getSubtitleStyle(presetId, fontSizePx, lineHeight)}>
      {lines.map((line, lineIndex) => (
        <span key={`${line}-${lineIndex}`} className="subtitle-text-line">
          {(emphasisMode === 'words' || effect !== 'none') && wordTimings && wordTimings.length > 0 && lineIndex === 0
            ? renderTimedLine(line, wordTimings, currentTime, maxEm, effect, emphasisMode, keywords)
            : (emphasisMode === 'keywords' ? splitSubtitleTextByKeywords(line, keywords) : [{ text: line, emphasized: false }]).map((part, partIndex) => (
              part.emphasized ? <mark key={`${part.text}-${partIndex}`} className="subtitle-emphasis">{part.text}</mark> : <span key={`${part.text}-${partIndex}`}>{part.text}</span>
            ))}
          {lineIndex < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </div>
  )
}
