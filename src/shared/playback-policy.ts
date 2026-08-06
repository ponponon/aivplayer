import type { PlaybackEndAction, PlaybackOrder, PlaybackRepeatMode } from './playback-memory'

export type PlaybackEndedIndexOptions = {
  currentIndex: number
  itemCount: number
  endAction: PlaybackEndAction
  repeatMode: PlaybackRepeatMode
  order: PlaybackOrder
}

export function getPlaybackEndedIndex(
  options: PlaybackEndedIndexOptions,
  random: () => number = Math.random
): number | null {
  const { currentIndex, itemCount, endAction, repeatMode, order } = options
  if (itemCount <= 0 || currentIndex < 0 || currentIndex >= itemCount) return null
  if (repeatMode === 'current') return currentIndex

  if (order === 'shuffle') {
    if (endAction !== 'next' && repeatMode !== 'all') return null
    if (itemCount === 1) return repeatMode === 'all' ? currentIndex : null
    const candidates = Array.from({ length: itemCount }, (_, index) => index).filter((index) => index !== currentIndex)
    const randomValue = random()
    const normalizedRandom = Number.isFinite(randomValue) ? Math.min(0.999999, Math.max(0, randomValue)) : 0
    return candidates[Math.floor(normalizedRandom * candidates.length)] ?? null
  }

  const nextIndex = currentIndex + 1
  if (nextIndex < itemCount) return endAction === 'next' || repeatMode === 'all' ? nextIndex : null
  if (repeatMode === 'all') return 0
  return null
}

export function getNextRepeatMode(mode: PlaybackRepeatMode): PlaybackRepeatMode {
  if (mode === 'none') return 'current'
  if (mode === 'current') return 'all'
  return 'none'
}
