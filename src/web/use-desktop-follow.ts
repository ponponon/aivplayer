import { useEffect, type RefObject } from 'react'
import type { WebDesktopState, WebShareMediaItem } from '../shared/web-types'

type DesktopFollowOptions = {
  followDesktop: boolean
  desktopState: WebDesktopState | null
  items: WebShareMediaItem[]
  selected: WebShareMediaItem | null
  videoRef: RefObject<HTMLVideoElement | null>
  selectItem: (item: WebShareMediaItem, autoPlay?: boolean) => void
}

export function useDesktopFollow({ followDesktop, desktopState, items, selected, videoRef, selectItem }: DesktopFollowOptions): void {
  useEffect(() => {
    if (!followDesktop || !desktopState?.currentMediaId) return
    const desktopItem = items.find((item) => item.id === desktopState.currentMediaId)
    if (desktopItem && desktopItem.id !== selected?.id) selectItem(desktopItem, false)
  }, [desktopState?.currentMediaId, followDesktop, items, selectItem, selected?.id])

  useEffect(() => {
    if (!followDesktop || !desktopState || !selected || selected.id !== desktopState.currentMediaId) return
    const video = videoRef.current
    if (!video) return
    if (Number.isFinite(desktopState.currentTime) && Math.abs(video.currentTime - desktopState.currentTime) > 2) video.currentTime = desktopState.currentTime
    if (desktopState.isPlaying && video.paused) void video.play().catch(() => undefined)
    if (!desktopState.isPlaying && !video.paused) video.pause()
  }, [desktopState, followDesktop, selected, videoRef])
}
