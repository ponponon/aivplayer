import { describe, expect, it } from 'vitest'
import { createVisionClipCollectionImportPreview } from '../../src/core/ai/clip-inbox-collection-import'
import type { VisionClipCollection, VisionClipCollectionInput, VisionClipSelection } from '../../src/shared/vision-types'

const selection: VisionClipSelection = {
  sourceId: 'source-demo',
  videoPath: '/videos/demo.mp4',
  fileName: 'demo.mp4',
  fingerprint: 'demo-fingerprint',
  durationSeconds: 60,
  startSeconds: 1,
  endSeconds: 3,
  evidenceIds: ['evidence-1'],
  evidenceTypes: ['subtitle']
}

function input(patch: Partial<VisionClipCollectionInput> = {}): VisionClipCollectionInput {
  return { title: '海边', selections: [selection], ...patch }
}

function current(patch: Partial<VisionClipCollection> = {}): VisionClipCollection {
  return {
    id: 'collection-1',
    title: '海边',
    tags: [],
    sortMode: 'source-time',
    isFavorite: false,
    isArchived: false,
    createdAt: 1,
    updatedAt: 2,
    selections: [selection],
    ...patch
  }
}

describe('clip inbox collection import preview', () => {
  it('classifies new, duplicate, and same-title conflicts without changing local data', () => {
    const local = [current()]
    const incoming = [input({ title: '新集合' }), input(), input({ tags: ['待审阅'] })]

    expect(createVisionClipCollectionImportPreview(incoming, local)).toEqual([
      expect.objectContaining({ incomingIndex: 0, state: 'new', currentCollectionId: null, selectionCount: 1 }),
      expect.objectContaining({ incomingIndex: 1, state: 'duplicate', currentCollectionId: 'collection-1' }),
      expect.objectContaining({ incomingIndex: 2, state: 'conflict', currentCollectionId: 'collection-1', tags: ['待审阅'] })
    ])
    expect(local[0]).toEqual(current())
  })

  it('compares normalized selection order and collection defaults', () => {
    const reversed: VisionClipSelection = { ...selection, startSeconds: 3, endSeconds: 4, evidenceIds: ['evidence-2'], evidenceTypes: ['visual'] }
    const local = [current({ selections: [selection, reversed] })]
    const imported = input({ selections: [reversed, selection] })

    expect(createVisionClipCollectionImportPreview([imported], local)[0]?.state).toBe('duplicate')
  })

  it('returns one preview row per incoming collection and keeps same-title matching deterministic', () => {
    const preview = createVisionClipCollectionImportPreview([input(), input({ title: '海边' })], [current({ id: 'first' }), current({ id: 'second', title: '海边' })])

    expect(preview).toHaveLength(2)
    expect(preview.every((item) => item.currentCollectionId === 'first')).toBe(true)
  })
})
