import { useEffect } from 'react'
import type { AppModel } from './app-types'

function useElapsedTime(active: boolean, startedAt: number | null, setElapsed: (value: number) => void): void {
  useEffect(() => {
    if (!active) return
    const update = (): void => { if (startedAt != null) setElapsed(Math.max(0, performance.now() - startedAt)) }
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [active, startedAt, setElapsed])
}

export function useElapsedTimeEffects(model: AppModel): void {
  useElapsedTime(model.isAsrBusy, model.asrStartedAtRef.current, (value) => model.setAsrElapsedMs(value))
  useElapsedTime(model.isTranslatingSubtitle, model.translationStartedAtRef.current, (value) => model.setTranslationElapsedMs(value))
  useEffect(() => () => {
    if (model.videoClickTimerRef.current != null) window.clearTimeout(model.videoClickTimerRef.current)
  }, [])
}
