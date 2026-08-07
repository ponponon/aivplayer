import { useEffect, useMemo, useState } from 'react'
import type { MediaStructureAnalysisResult, MediaStructureCorrection, MediaStructureSegment } from '../../../shared/media-types'

const ACTIVE_SEGMENT_EPSILON_SECONDS = 0.08

export function usePlaybackStructureAnalysis(mediaPath: string | null, durationSeconds: number, currentTime: number, corrections: readonly MediaStructureCorrection[]) {
  const [analysis, setAnalysis] = useState<MediaStructureAnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setAnalysis(null)
    if (!mediaPath || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      setIsAnalyzing(false)
      return () => { cancelled = true }
    }
    setIsAnalyzing(true)
    void window.aiv.analyzeMediaStructure({ mediaPath, durationSeconds }).then((result) => {
      if (!cancelled) setAnalysis(result)
    }).catch(() => {
      if (!cancelled) setAnalysis(null)
    }).finally(() => {
      if (!cancelled) setIsAnalyzing(false)
    })
    return () => { cancelled = true }
  }, [mediaPath, durationSeconds])

  const ignoredIds = useMemo(() => new Set(corrections.filter((correction) => correction.action === 'ignore').map((correction) => correction.segmentId)), [corrections])
  const activeSegment = useMemo<MediaStructureSegment | null>(() => {
    if (!analysis?.success) return null
    return analysis.segments
      .filter((segment) => segment.kind === 'black' && !ignoredIds.has(segment.id))
      .find((segment) => currentTime >= segment.startSeconds - ACTIVE_SEGMENT_EPSILON_SECONDS && currentTime < segment.endSeconds - ACTIVE_SEGMENT_EPSILON_SECONDS) ?? null
  }, [analysis, currentTime, ignoredIds])

  return { analysis, activeSegment, isAnalyzing }
}
