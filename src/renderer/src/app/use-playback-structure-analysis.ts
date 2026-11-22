import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MediaStructureAnalysisResult, MediaStructureCorrection, MediaStructureSegment } from '../../../shared/media-types'

const ACTIVE_SEGMENT_EPSILON_SECONDS = 0.08

/**
 * Playback black-frame analysis.
 *
 * Opening a file only probes the on-disk cache: a full `blackdetect` pass decodes
 * every frame of the media (minutes of CPU for a feature-length file), so it has to
 * stay an explicit user action. Switching files or unmounting cancels a running scan
 * instead of leaving an orphaned FFmpeg child behind.
 */
export function usePlaybackStructureAnalysis(mediaPath: string | null, durationSeconds: number, currentTime: number, corrections: readonly MediaStructureCorrection[]) {
  const [analysis, setAnalysis] = useState<MediaStructureAnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const sessionRef = useRef<{ path: string; durationSeconds: number; active: boolean } | null>(null)

  useEffect(() => {
    const session = mediaPath && Number.isFinite(durationSeconds) && durationSeconds > 0 ? { path: mediaPath, durationSeconds, active: true } : null
    sessionRef.current = session
    setAnalysis(null)
    setIsAnalyzing(false)
    if (!session) return undefined

    void window.aiv.analyzeMediaStructure({ mediaPath: session.path, durationSeconds: session.durationSeconds, cacheOnly: true }).then((result) => {
      if (session.active && result.success) setAnalysis(result)
    }).catch(() => undefined)

    return () => {
      session.active = false
      if (sessionRef.current === session) sessionRef.current = null
      void window.aiv.cancelMediaStructureAnalysis({ mediaPath: session.path }).catch(() => undefined)
    }
  }, [durationSeconds, mediaPath])

  const requestAnalysis = useCallback((): void => {
    const session = sessionRef.current
    if (!session || !session.active || isAnalyzing) return
    setIsAnalyzing(true)
    void window.aiv.analyzeMediaStructure({ mediaPath: session.path, durationSeconds: session.durationSeconds }).then((result) => {
      if (!session.active) return
      setAnalysis(result.success ? result : null)
      setIsAnalyzing(false)
    }).catch(() => {
      if (!session.active) return
      setAnalysis(null)
      setIsAnalyzing(false)
    })
  }, [isAnalyzing])

  const ignoredIds = useMemo(() => new Set(corrections.filter((correction) => correction.action === 'ignore').map((correction) => correction.segmentId)), [corrections])
  const activeSegment = useMemo<MediaStructureSegment | null>(() => {
    if (!analysis?.success) return null
    return analysis.segments
      .filter((segment) => segment.kind === 'black' && !ignoredIds.has(segment.id))
      .find((segment) => currentTime >= segment.startSeconds - ACTIVE_SEGMENT_EPSILON_SECONDS && currentTime < segment.endSeconds - ACTIVE_SEGMENT_EPSILON_SECONDS) ?? null
  }, [analysis, currentTime, ignoredIds])

  const canAnalyze = Boolean(mediaPath) && durationSeconds > 0 && !analysis?.success && !isAnalyzing

  return { analysis, activeSegment, isAnalyzing, canAnalyze, requestAnalysis }
}
