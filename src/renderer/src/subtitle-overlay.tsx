import type { ReactElement, RefObject } from 'react'; import { useState, useEffect, useRef } from 'react'
import type { AppSettings } from '../../shared/app-settings'; import type { AppLocale } from '../../shared/localization'; import type { LocaleCopy } from '../../shared/i18n'
import { SubtitleDisplayControls, getDefaultSubtitleDisplaySettings } from './app/subtitle-display-controls'; import { parseVtt, findActiveCue } from './subtitle-parser'; import type { SubtitleCue } from './subtitle-parser'
import type { EditingCaption, EditingCaptionEffect, EditingCaptionLayout } from '../../shared/editing-types'; import type { EditingCanvasDimensions } from '../../core/editing/canvases'; import { SubtitleText } from './subtitle-text'
import { attachSubtitleWords, createFallbackSubtitleWords, getSubtitleWordSidecarPath, parseWhisperSubtitleWords, type SubtitleWord } from '../../shared/subtitle-timing'; import { getEditingCaptionEffect } from '../../core/editing/caption-effects'

type SubtitleOverlayProps = {
  subtitlePath: string | null
  subtitleRevision?: number
  translationPath?: string | null
  translationRevision?: number
  editingCaptions?: readonly EditingCaption[] | null
  editingCaptionEffect?: EditingCaptionEffect
  currentTime: number
  locale: AppLocale
  settings: AppSettings['subtitles']
  copy: LocaleCopy
  controlsRef?: RefObject<HTMLDetailsElement | null>
  onSettingsChange: (patch: Partial<AppSettings['subtitles']>) => void
  onResetSettings: () => void
  editingCaptionLayout?: EditingCaptionLayout | null
  editingCanvas?: EditingCanvasDimensions | null
  editingLayerZIndex?: number
  showControls?: boolean
}

const subtitleLineHeightMap: Record<AppSettings['subtitles']['lineHeight'], number> = { compact: 1.25, normal: 1.5, relaxed: 1.75 }

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
  subtitleRevision = 0,
  translationPath = null,
  translationRevision = 0,
  editingCaptions = null,
  editingCaptionEffect = 'none',
  currentTime,
  locale,
  settings,
  copy,
  controlsRef,
  onSettingsChange,
  onResetSettings,
  editingCaptionLayout = null,
  editingCanvas = null,
  editingLayerZIndex,
  showControls = true
}: SubtitleOverlayProps): ReactElement {
  const [cues, setCues] = useState<SubtitleCue[]>([]); const [translationCues, setTranslationCues] = useState<SubtitleCue[]>([]); const [activeCue, setActiveCue] = useState<SubtitleCue | null>(null); const [activeTranslationCue, setActiveTranslationCue] = useState<SubtitleCue | null>(null)
  const prevSubtitlePathRef = useRef<string | null>(null)
  const prevSubtitleRevisionRef = useRef(0)
  const prevTranslationPathRef = useRef<string | null>(null)
  const prevTranslationRevisionRef = useRef(0)
  const hasSubtitles = editingCaptions ? editingCaptions.length > 0 : cues.length > 0 || translationCues.length > 0
  const activeEditingCue = editingCaptions ? findActiveEditingCaption(editingCaptions, currentTime, 'source') : null
  const activeEditingTranslationCue = editingCaptions ? findActiveEditingCaption(editingCaptions, currentTime, 'translation') : null

  useEffect(() => {
    if (!subtitlePath) {
      setCues([])
      setActiveCue(null)
      prevSubtitlePathRef.current = null
      prevSubtitleRevisionRef.current = 0
      return
    }

    if (subtitlePath === prevSubtitlePathRef.current && subtitleRevision === prevSubtitleRevisionRef.current) {
      return
    }

    prevSubtitlePathRef.current = subtitlePath
    prevSubtitleRevisionRef.current = subtitleRevision
    let cancelled = false

    const loadAndParse = async (): Promise<void> => {
      try {
        const text = await window.aiv.readFileContent(subtitlePath)
        const wordSidecarPath = getSubtitleWordSidecarPath(subtitlePath)
        const wordText = wordSidecarPath ? await window.aiv.readFileContent(wordSidecarPath).catch(() => '') : ''
        const parsedCues = attachSubtitleWords(parseVtt(text), parseWhisperSubtitleWords(wordText), true)
        if (cancelled) return
        setCues(parsedCues)
      } catch (error) {
        if (!cancelled) console.error('Failed to load subtitle:', error)
      }
    }

    void loadAndParse()
    return () => { cancelled = true }
  }, [subtitlePath, subtitleRevision])

  useEffect(() => {
    if (!translationPath) {
      setTranslationCues([])
      setActiveTranslationCue(null)
      prevTranslationPathRef.current = null
      prevTranslationRevisionRef.current = 0
      return
    }

    if (translationPath === prevTranslationPathRef.current && translationRevision === prevTranslationRevisionRef.current) {
      return
    }

    prevTranslationPathRef.current = translationPath
    prevTranslationRevisionRef.current = translationRevision

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
  }, [translationPath, translationRevision])

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
  const sourceText = activeEditingCue?.text ?? activeCue?.text ?? '\u00A0'
  const translationText = activeEditingTranslationCue?.text ?? activeTranslationCue?.text ?? null
  const activeEffect = editingCaptions ? getEditingCaptionEffect(editingCaptionEffect) : 'none'
  const activeSourceWords = settings.emphasisMode === 'words' || activeEffect !== 'none'
    ? activeEditingCue?.words ?? (activeEditingCue ? createFallbackSubtitleWords(activeEditingCue.text, 0, activeEditingCue.durationSeconds) : activeCue?.words)
    : undefined
  const wordTime = activeEditingCue ? currentTime - activeEditingCue.startSeconds : currentTime
  const displayText = buildSubtitleDisplayText({
    sourceText,
    translationText,
    displayMode: displaySettings.displayMode
  })
  const editingLayoutStyle = editingCaptionLayout ? {
    '--editing-caption-x': `${editingCaptionLayout.xPercent}%`,
    '--editing-caption-y': `${editingCaptionLayout.yPercent}%`,
    '--editing-caption-width': `${editingCaptionLayout.widthPercent}%`
  } as React.CSSProperties : undefined
  const subtitleFontSize = editingCaptionLayout?.fontSizePx ?? displaySettings.fontSizePx
  const subtitleMaxWidth = editingCaptionLayout && editingCanvas ? editingCanvas.width * editingCaptionLayout.widthPercent / 100 : undefined

  return <div className={`subtitle-overlay ${editingCaptionLayout ? 'is-editing-caption' : ''}`} style={{ ...editingLayoutStyle, ...(editingLayerZIndex === undefined ? {} : { zIndex: editingLayerZIndex }) }}>
      <SubtitleText text={displayText} presetId={displaySettings.presetId} emphasisMode={displaySettings.emphasisMode} keywords={displaySettings.keywords} wordTimings={activeSourceWords as readonly SubtitleWord[] | undefined} currentTime={wordTime} effect={activeEffect} fontSizePx={subtitleFontSize} lineHeight={subtitleLineHeightMap[displaySettings.lineHeight]} maxWidthPx={subtitleMaxWidth} />
      {showControls ? <SubtitleDisplayControls
        copy={copy}
        locale={locale}
        settings={displaySettings}
        hasTranslation={editingCaptions ? editingCaptions.some((caption) => caption.kind === 'translation') : translationCues.length > 0}
        controlsRef={controlsRef}
        onChange={onSettingsChange}
        onReset={onResetSettings}
      /> : null}
    </div>
}
