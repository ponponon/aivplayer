import { describe, expect, it } from 'vitest'
import { isUnfinishedPlaybackHistoryEntry, MAX_PLAYBACK_HISTORY_ITEMS, removePlaybackHistoryEntries, removePlaybackHistoryEntry, setPlaybackHistoryDuration, upsertPlaybackHistory, type PlaybackHistoryEntry } from '../../src/shared/playback-history'

function createEntry(path: string, lastPlayedAt: number): PlaybackHistoryEntry {
  return {
    path,
    name: path.split('/').pop() ?? path,
    extension: 'mp4',
    lastPlayedAt,
    durationSeconds: 600
  }
}

describe('playback history', () => {
  it('moves a replayed file to the front and refreshes its metadata', () => {
    const history = [createEntry('/videos/old.mp4', 100), createEntry('/videos/current.mp4', 90)]

    expect(upsertPlaybackHistory(history, {
      path: '/videos/current.mp4',
      name: 'renamed-current.mp4',
      extension: 'mkv'
    }, 200)).toEqual([
      {
        path: '/videos/current.mp4',
        name: 'renamed-current.mp4',
        extension: 'mkv',
        lastPlayedAt: 200,
        durationSeconds: 600
      },
      createEntry('/videos/old.mp4', 100)
    ])
  })

  it('stores a verified duration without inventing one for other entries', () => {
    const history = [createEntry('/videos/current.mp4', 200), { ...createEntry('/videos/unknown.mp4', 100), durationSeconds: null }]

    expect(setPlaybackHistoryDuration(history, '/videos/current.mp4', 321.5)[0]?.durationSeconds).toBe(321.5)
    expect(setPlaybackHistoryDuration(history, '/videos/unknown.mp4', Number.NaN)[1]?.durationSeconds).toBeNull()
  })

  it('only marks entries with a real in-progress position as unfinished', () => {
    const entry = createEntry('/videos/current.mp4', 200)

    expect(isUnfinishedPlaybackHistoryEntry(entry, 120)).toBe(true)
    expect(isUnfinishedPlaybackHistoryEntry(entry, 0)).toBe(false)
    expect(isUnfinishedPlaybackHistoryEntry(entry, 600)).toBe(false)
    expect(isUnfinishedPlaybackHistoryEntry({ ...entry, durationSeconds: null }, 120)).toBe(false)
  })

  it('keeps history bounded and removes only the requested path', () => {
    const history = Array.from({ length: MAX_PLAYBACK_HISTORY_ITEMS + 2 }, (_, index) => createEntry(`/videos/${index}.mp4`, index + 1))
    const bounded = upsertPlaybackHistory(history, {
      path: '/videos/new.mp4',
      name: 'new.mp4',
      extension: 'mp4'
    }, 999)

    expect(bounded).toHaveLength(MAX_PLAYBACK_HISTORY_ITEMS)
    expect(bounded[0]?.path).toBe('/videos/new.mp4')
    expect(removePlaybackHistoryEntry(bounded, '/videos/1.mp4').some((entry) => entry.path === '/videos/1.mp4')).toBe(false)
    expect(removePlaybackHistoryEntry(bounded, '/videos/not-in-history.mp4')).toEqual(bounded)
  })

  it('removes a batch of unavailable paths without touching other records', () => {
    const history = [createEntry('/videos/one.mp4', 300), createEntry('/videos/two.mp4', 200), createEntry('/videos/three.mp4', 100)]

    expect(removePlaybackHistoryEntries(history, ['/videos/one.mp4', '/videos/three.mp4'])).toEqual([createEntry('/videos/two.mp4', 200)])
  })
})
