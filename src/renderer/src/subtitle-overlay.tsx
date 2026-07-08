import type { CSSProperties, ReactElement, RefObject } from 'react'
import { useState, useEffect, useRef } from 'react'
import type { AppSettings } from '../../shared/app-settings'
import type { LocaleCopy } from '../../shared/i18n'
import { SubtitleDisplayControls, getDefaultSubtitleDisplaySettings } from './app/subtitle-display-controls'
import { parseVtt, findActiveCue } from './subtitle-parser'
import type { SubtitleCue } from './subtitle-parser'

type SubtitleOverlayProps = {
  subtitlePath: string | null
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

export function SubtitleOverlay({
  subtitlePath,
  currentTime,
  settings,
  copy,
  controlsRef,
  onSettingsChange,
  onResetSettings
}: SubtitleOverlayProps): ReactElement {
  const [cues, setCues] = useState<SubtitleCue[]>([])
  const [activeCue, setActiveCue] = useState<SubtitleCue | null>(null)
  const prevSubtitlePathRef = useRef<string | null>(null)
  const hasSubtitles = cues.length > 0

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
    if (cues.length === 0) {
      setActiveCue(null)
      return
    }

    const cue = findActiveCue(cues, currentTime)
    setActiveCue(cue)
  }, [cues, currentTime])

  if (!hasSubtitles) {
    return <div className="subtitle-overlay empty" />
  }

  const displaySettings = settings ?? getDefaultSubtitleDisplaySettings()
  const subtitleStyle = {
    '--subtitle-font-size': `${displaySettings.fontSizePx}px`,
    '--subtitle-line-height': String(subtitleLineHeightMap[displaySettings.lineHeight])
  } as CSSProperties

  return (
    <div className="subtitle-overlay" style={subtitleStyle}>
      <div className="subtitle-text">{activeCue?.text ?? '\u00A0'}</div>
      <SubtitleDisplayControls
        copy={copy}
        settings={displaySettings}
        hasTranslation={false}
        controlsRef={controlsRef}
        onChange={onSettingsChange}
        onReset={onResetSettings}
      />
    </div>
  )
}
