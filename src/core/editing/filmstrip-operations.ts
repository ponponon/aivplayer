export type EditingFilmstripFrame = { sourceSeconds: number; url: string }

export type EditingFilmstripTile = {
  frame: EditingFilmstripFrame
  leftPercent: number
  widthPercent: number
}

/**
 * Windows a source-time filmstrip inside one edited clip. The frame grid is
 * intentionally not regenerated for every cut: a trim or split only changes
 * the visible window, so adjacent clips keep the same source-time landmarks.
 */
export function getEditingFilmstripTiles(frames: readonly EditingFilmstripFrame[], sourceStartSeconds: number, sourceEndSeconds: number, sourceDurationSeconds: number): EditingFilmstripTile[] {
  const sorted = frames.filter((frame) => Number.isFinite(frame.sourceSeconds) && frame.url).slice().sort((left, right) => left.sourceSeconds - right.sourceSeconds)
  const start = Math.max(0, sourceStartSeconds)
  const end = Math.min(Math.max(start, sourceEndSeconds), Math.max(start, sourceDurationSeconds))
  if (sorted.length === 0 || end <= start) return []
  return sorted.flatMap((frame, index) => {
    const previous = index > 0 ? sorted[index - 1]!.sourceSeconds : 0
    const next = index + 1 < sorted.length ? sorted[index + 1]!.sourceSeconds : Math.max(frame.sourceSeconds, sourceDurationSeconds)
    const left = index === 0 ? 0 : (previous + frame.sourceSeconds) / 2
    const right = index === sorted.length - 1 ? Math.max(frame.sourceSeconds, sourceDurationSeconds) : (frame.sourceSeconds + next) / 2
    const visibleLeft = Math.max(start, left)
    const visibleRight = Math.min(end, right)
    if (visibleRight <= visibleLeft) return []
    return [{ frame, leftPercent: ((visibleLeft - start) / (end - start)) * 100, widthPercent: ((visibleRight - visibleLeft) / (end - start)) * 100 }]
  })
}
