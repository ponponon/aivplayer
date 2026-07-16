import { useRef } from 'react'
import type { AppRefs } from './app-types'

export function useAppRefs(): AppRefs {
  return {
    videoRef: useRef<HTMLVideoElement | null>(null),
    subtitleActionsRef: useRef<HTMLDetailsElement | null>(null),
    subtitleDisplayControlsRef: useRef<HTMLDetailsElement | null>(null),
    downloadDialogRef: useRef<HTMLElement | null>(null),
    videoClickTimerRef: useRef<number | null>(null),
    holdRightArrowTimerRef: useRef<number | null>(null),
    holdRightArrowRestoreRateRef: useRef<number | null>(null),
    controlDeckHideTimerRef: useRef<number | null>(null),
    asrStartedAtRef: useRef<number | null>(null),
    translationStartedAtRef: useRef<number | null>(null),
    summaryStartedAtRef: useRef<number | null>(null),
    playbackEndedRef: useRef(false),
    lastSavedProgressRef: useRef({ path: null, time: -1 })
  }
}
