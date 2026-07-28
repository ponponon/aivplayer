import type { CSSProperties, ReactElement, RefObject } from 'react'
import { useState, useEffect, useRef } from 'react'
import type { AppSettings } from '../../shared/app-settings'
import type { LocaleCopy } from '../../shared/i18n'
import { SubtitleDisplayControls, getDefaultSubtitleDisplaySettings } from './app/subtitle-display-controls'
import { parseVtt, findActiveCue } from './subtitle-parser'
import type { SubtitleCue } from './subtitle-parser'
import type { EditingCaption } from '../../shared/editing-types'

type SubtitleOverlayProps = {
  subtitlePath: string | null
  translationPath?: string | null
  editingCaptions?: readonly EditingCaption[] | null
  currentTime: number
  settings: AppSettings['subtitles']
  copy: LocaleCopy
  controlsRef?: RefObject<HTMLDetailsElement | null>
  onSettingsChange: (patch: Partial<AppSettings['subtitles']>) => void
  onResetSettings: () => void
}

const subtitleLineHeightMap: Record<AppSettings['subtitles']['lineHeight'], number> = {
  compact: 1.25,
  normal: 1.5,
  relaxed: 1.75
}

export function buildSubtitleDisplayText(options: {
  sourceText: string
  translationText: string | null
  displayMode: AppSettings['subtitles']['displayMode']
}): string {
  const hasTranslation = options.translationText != null && options.translationText.trim().length > 0

  if (options.displayMode === 'translation') {
    return hasTranslation ? options.translationText ?? options.sourceText : options.sourceText
  }

  if (options.displayMode === 'bilingual') {
    return hasTranslation ? `${options.sourceText}\n${options.translationText}` : options.sourceText
  }

  return options.sourceText
}

export function findActiveEditingCaption(captions: readonly EditingCaption[], currentTime: number, kind: EditingCaption['kind']): EditingCaption | null {
  return captions.find((caption) => caption.kind === kind && currentTime >= caption.startSeconds && currentTime < caption.startSeconds + caption.durationSeconds) ?? null
}

export function SubtitleOverlay({
  subtitlePath,
  translationPath = null,
  editingCaptions = null,
  currentTime,
  settings,
  copy,
  controlsRef,
  onSettingsChange,
  onResetSettings
}: SubtitleOverlayProps): ReactElement {
  const [cues, setCues] = useState<SubtitleCue[]>([])
  const [translationCues, setTranslationCues] = useState<SubtitleCue[]>([])
  const [activeCue, setActiveCue] = useState<SubtitleCue | null>(null)
  const [activeTranslationCue, setActiveTranslationCue] = useState<SubtitleCue | null>(null)
  const prevSubtitlePathRef = useRef<string | null>(null)
  const prevTranslationPathRef = useRef<string | null>(null)
  const hasSubtitles = editingCaptions ? editingCaptions.length > 0 : cues.length > 0 || translationCues.length > 0
  const activeEditingCue = editingCaptions ? findActiveEditingCaption(editingCaptions, currentTime, 'source') : null
  const activeEditingTranslationCue = editingCaptions ? findActiveEditingCaption(editingCaptions, currentTime, 'translation') : null

  useEffect(() => {
    if (!subtitlePath) {
      setCues([])
      setActiveCue(null)
      prevSubtitlePathRef.current = null
      return
    }

    if (subtitlePath === prevSubtitlePathRef.current) {
      return
    }

    prevSubtitlePathRef.current = subtitlePath

    const loadAndParse = async (): Promise<void> => {
      try {
        const text = await window.aiv.readFileContent(subtitlePath)
        const parsedCues = parseVtt(text)
        setCues(parsedCues)
      } catch (error) {
        console.error('Failed to load subtitle:', error)
      }
    }

    void loadAndParse()
  }, [subtitlePath])

  useEffect(() => {
    if (!translationPath) {
      setTranslationCues([])
      setActiveTranslationCue(null)
      prevTranslationPathRef.current = null
      return
    }

    if (translationPath === prevTranslationPathRef.current) {
      return
    }

    prevTranslationPathRef.current = translationPath

    const loadAndParse = async (): Promise<void> => {
      try {
        const text = await window.aiv.readFileContent(translationPath)
        const parsedCues = parseVtt(text)
        setTranslationCues(parsedCues)
      } catch (error) {
        console.error('Failed to load translated subtitle:', error)
      }
    }

    void loadAndParse()
  }, [translationPath])

  useEffect(() => {
    if (cues.length === 0) {
      setActiveCue(null)
      return
    }

    const cue = findActiveCue(cues, currentTime)
    setActiveCue(cue)
  }, [cues, currentTime])

  useEffect(() => {
    if (translationCues.length === 0) {
      setActiveTranslationCue(null)
      return
    }

    const cue = findActiveCue(translationCues, currentTime)
    setActiveTranslationCue(cue)
  }, [translationCues, currentTime])

  if (!hasSubtitles) {
    return <div className="subtitle-overlay empty" />
  }

  const displaySettings = settings ?? getDefaultSubtitleDisplaySettings()
  const subtitleStyle = {
    '--subtitle-font-size': `${displaySettings.fontSizePx}px`,
    '--subtitle-line-height': String(subtitleLineHeightMap[displaySettings.lineHeight])
  } as CSSProperties
  const sourceText = activeEditingCue?.text ?? activeCue?.text ?? '\u00A0'
  const translationText = activeEditingTranslationCue?.text ?? activeTranslationCue?.text ?? null
  const displayText = buildSubtitleDisplayText({
    sourceText,
    translationText,
    displayMode: displaySettings.displayMode
  })

  return (
    <div className="subtitle-overlay" style={subtitleStyle}>
      <div className="subtitle-text">{displayText}</div>
      <SubtitleDisplayControls
        copy={copy}
        settings={displaySettings}
        hasTranslation={editingCaptions ? editingCaptions.some((caption) => caption.kind === 'translation') : translationCues.length > 0}
        controlsRef={controlsRef}
        onChange={onSettingsChange}
        onReset={onResetSettings}
      />
    </div>
  )
}
