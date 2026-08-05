import { useEffect } from 'react'
import type { WebShareMediaItem } from '../shared/web-types'

export function useVisibleSelection(visibleItems: WebShareMediaItem[], selected: WebShareMediaItem | null, setSelectedId: (id: string) => void, setIsPlaying: (playing: boolean) => void): void {
  useEffect(() => {
    if (visibleItems.length === 0 || (selected && visibleItems.some((item) => item.id === selected.id))) return
    setSelectedId(visibleItems[0]!.id)
    setIsPlaying(false)
  }, [selected, setIsPlaying, setSelectedId, visibleItems])
}
