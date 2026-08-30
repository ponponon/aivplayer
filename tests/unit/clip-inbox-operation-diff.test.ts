import { describe, expect, it } from 'vitest'
import { diffVisionClipCollectionOperationDetails } from '../../src/core/ai/clip-inbox-operation-diff'
import type { VisionClipCollectionOperationCollectionDetail } from '../../src/shared/vision-types'

const detail = (patch: Partial<VisionClipCollectionOperationCollectionDetail> = {}): VisionClipCollectionOperationCollectionDetail => ({
  id: 'collection-1',
  title: '原始集合',
  tags: ['旅行'],
  sortMode: 'source-time',
  isFavorite: false,
  isArchived: false,
  selectionCount: 2,
  ...patch
})

describe('clip inbox operation diff', () => {
  it('marks changed fields while leaving identical fields neutral', () => {
    const [diff] = diffVisionClipCollectionOperationDetails(
      [detail()],
      [detail({ title: '新集合', tags: ['精选'], sortMode: 'duration-desc', isFavorite: true, isArchived: true, selectionCount: 1 })]
    )

    expect(diff).toMatchObject({
      id: 'collection-1',
      fieldChanges: { title: 'changed', tags: 'changed', flags: 'changed', sortMode: 'changed', selectionCount: 'changed' }
    })
  })

  it('marks one-sided collections as added or removed for every field', () => {
    const [removed, added] = diffVisionClipCollectionOperationDetails([detail({ id: 'removed' })], [detail({ id: 'added' })])

    expect(added.fieldChanges).toEqual({ title: 'added', tags: 'added', flags: 'added', sortMode: 'added', selectionCount: 'added' })
    expect(removed.fieldChanges).toEqual({ title: 'removed', tags: 'removed', flags: 'removed', sortMode: 'removed', selectionCount: 'removed' })
  })

  it('preserves before-first ordering and pairs collections by id', () => {
    const diffs = diffVisionClipCollectionOperationDetails([detail({ id: 'first' }), detail({ id: 'second' })], [detail({ id: 'second', title: 'second' }), detail({ id: 'third' })])

    expect(diffs.map((diff) => [diff.id, diff.before?.id, diff.after?.id])).toEqual([
      ['first', 'first', undefined],
      ['second', 'second', 'second'],
      ['third', undefined, 'third']
    ])
  })
})
