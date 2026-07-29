import { describe, expect, it } from 'vitest'
import { getEditingFilmstripTiles } from '../../src/core/editing/filmstrip-operations'

const frames = [0, 2, 4, 6].map((sourceSeconds) => ({ sourceSeconds, url: `frame-${sourceSeconds}` }))

describe('editing filmstrip operations', () => {
  it('windows thumbnails by source time instead of reflowing each edited clip', () => {
    const tiles = getEditingFilmstripTiles(frames, 2, 6, 6)
    expect(tiles.map((tile) => tile.frame.sourceSeconds)).toEqual([2, 4, 6])
    expect(tiles.map((tile) => Math.round(tile.leftPercent))).toEqual([0, 25, 75])
    expect(tiles.map((tile) => Math.round(tile.widthPercent))).toEqual([25, 50, 25])
  })

  it('includes the neighboring frame when a trim starts between source landmarks', () => {
    const tiles = getEditingFilmstripTiles(frames, 1, 5, 6)
    expect(tiles.map((tile) => tile.frame.sourceSeconds)).toEqual([2, 4])
    expect(tiles.map((tile) => Math.round(tile.leftPercent))).toEqual([0, 50])
  })

  it('returns no tiles for empty or invalid source windows', () => {
    expect(getEditingFilmstripTiles(frames, 4, 4, 6)).toEqual([])
    expect(getEditingFilmstripTiles([], 0, 2, 6)).toEqual([])
  })
})
