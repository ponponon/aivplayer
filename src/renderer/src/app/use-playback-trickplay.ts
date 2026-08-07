import { useEffect, useState } from 'react'
import type { MediaFilmstripFrame } from '../../../shared/media-types'

const MAX_TRICKPLAY_FRAMES = 32

export type PlaybackTrickplayFrame = { sourceSeconds: number; url: string }

export function getPlaybackTrickplayTimestamps(durationSeconds: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return []
  const frameCount = Math.min(MAX_TRICKPLAY_FRAMES, Math.max(8, Math.ceil(durationSeconds / 8)))
  const lastTimestamp = Math.max(0, durationSeconds - 0.05)
  return Array.from({ length: frameCount }, (_, index) => Math.min(lastTimestamp, ((index + 0.5) / frameCount) * durationSeconds))
}

export function findNearestPlaybackTrickplayFrame(frames: readonly PlaybackTrickplayFrame[], sourceSeconds: number): PlaybackTrickplayFrame | null {
  if (frames.length === 0 || !Number.isFinite(sourceSeconds)) return null
  return frames.reduce((nearest, frame) => Math.abs(frame.sourceSeconds - sourceSeconds) < Math.abs(nearest.sourceSeconds - sourceSeconds) ? frame : nearest)
}

export function usePlaybackTrickplay(mediaPath: string | null, durationSeconds: number): { frames: PlaybackTrickplayFrame[]; loading: boolean; cacheHit: boolean | null } {
  const [frames, setFrames] = useState<PlaybackTrickplayFrame[]>([])
  const [loading, setLoading] = useState(false)
  const [cacheHit, setCacheHit] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    const timestampsSeconds = getPlaybackTrickplayTimestamps(durationSeconds)
    setFrames([])
    setCacheHit(null)
    if (!mediaPath || timestampsSeconds.length === 0) {
      setLoading(false)
      return () => { active = false }
    }
    setLoading(true)
    void window.aiv.extractMediaFilmstrip({ mediaPath, timestampsSeconds, width: 240, quality: 6 }).then((result) => {
      if (!active) return
      const nextFrames: PlaybackTrickplayFrame[] = (result.frames as MediaFilmstripFrame[]).map((frame) => ({ sourceSeconds: frame.sourceSeconds, url: frame.dataUrl }))
      setFrames(nextFrames)
      setCacheHit(result.cacheHit)
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setLoading(false)
      setCacheHit(false)
    })
    return () => { active = false }
  }, [durationSeconds, mediaPath])

  return { frames, loading, cacheHit }
}
