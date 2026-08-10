import { describe, expect, it } from 'vitest'
import { syncEditingCaptionsBetweenPoints } from '../../src/core/editing/caption-sync-operations'
import type { EditingCaption } from '../../src/shared/editing-types'

const createCaption = (id: string, startSeconds: number, durationSeconds: number): EditingCaption => ({
  id,
  kind: 'source',
  text: id,
  startSeconds,
  durationSeconds,
  sourceId: 'source-one',
  sourceStartSeconds: startSeconds,
  sourceEndSeconds: startSeconds + durationSeconds,
  words: [{ text: id, startSeconds: 0, endSeconds: durationSeconds }]
})

describe('caption sync operations', () => {
  it('maps selected captions between two points and scales word timings', () => {
    const captions = [createCaption('one', 1, 1), createCaption('two', 3, 1), createCaption('other', 6, 1)]
    const next = syncEditingCaptionsBetweenPoints(captions, ['one', 'two'], 1, 4, 2, 8, 10)
    expect(next[0]).toMatchObject({ startSeconds: 2, durationSeconds: 2 })
    expect(next[0]).not.toHaveProperty('sourceId')
    expect(next[0]).not.toHaveProperty('sourceStartSeconds')
    expect(next[0]).not.toHaveProperty('sourceEndSeconds')
    expect(next[0]?.words).toEqual([{ text: 'one', startSeconds: 0, endSeconds: 2 }])
    expect(next[1]).toMatchObject({ startSeconds: 6, durationSeconds: 2 })
    expect(next[2]).toBe(captions[2])
  })

  it('rejects invalid point ranges without changing captions', () => {
    const captions = [createCaption('one', 1, 1)]
    expect(syncEditingCaptionsBetweenPoints(captions, ['one'], 2, 2, 3, 4, 10)).toEqual(captions)
    expect(syncEditingCaptionsBetweenPoints(captions, ['one'], 1, 2, 4, 3, 10)).toEqual(captions)
    expect(syncEditingCaptionsBetweenPoints(captions, [], 1, 2, 4, 5, 10)).toEqual(captions)
  })
})
