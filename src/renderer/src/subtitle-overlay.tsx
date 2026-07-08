import type { ReactElement } from 'react'
import { useState, useEffect, useRef } from 'react'
import { parseVtt, findActiveCue } from './subtitle-parser'
import type { SubtitleCue } from './subtitle-parser'

type SubtitleOverlayProps = {
  subtitlePath: string | null
  currentTime: number
}

export function SubtitleOverlay({ subtitlePath, currentTime }: SubtitleOverlayProps): ReactElement {
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

  return (
    <div className="subtitle-overlay">
      <div className="subtitle-text">{activeCue?.text ?? '\u00A0'}</div>
    </div>
  )
}
