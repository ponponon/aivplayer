import { describe, expect, it } from 'vitest'
import { filterVisionClipCollectionOperationHistory, normalizeVisionClipCollectionOperationHistoryFilter, serializeVisionClipCollectionOperationHistory } from '../../src/core/ai/clip-inbox-collection-history'
import type { VisionClipCollectionOperationHistoryEntry } from '../../src/shared/vision-types'

function createEntry(overrides: Partial<VisionClipCollectionOperationHistoryEntry> = {}): VisionClipCollectionOperationHistoryEntry {
  return {
    id: 'history-1',
    type: 'rename',
    createdAt: 100,
    status: 'active',
    undoneAt: null,
    collectionIds: ['collection-1'],
    collectionTitles: ['第一集合'],
    selectionCount: 2,
    ...overrides
  }
}

describe('clip inbox collection operation history filters', () => {
  it('normalizes invalid type and status filters to all', () => {
    expect(normalizeVisionClipCollectionOperationHistoryFilter({ type: 'unknown', status: 'unknown' })).toEqual({ type: 'all', status: 'all' })
    expect(normalizeVisionClipCollectionOperationHistoryFilter({ type: 'flags', status: 'redoable' })).toEqual({ type: 'flags', status: 'redoable' })
    expect(normalizeVisionClipCollectionOperationHistoryFilter({ type: 'import', status: 'active' })).toEqual({ type: 'import', status: 'active' })
  })

  it('filters by operation type and status without mutating entries', () => {
    const entries = [createEntry(), createEntry({ id: 'history-2', type: 'flags', status: 'redoable', undoneAt: 200 }), createEntry({ id: 'history-3', type: 'rename', status: 'undone', undoneAt: 300 })]
    const filtered = filterVisionClipCollectionOperationHistory(entries, { type: 'rename', status: 'undone' })
    expect(filtered.map((entry) => entry.id)).toEqual(['history-3'])
    filtered[0].collectionIds.push('mutated')
    expect(entries[2].collectionIds).toEqual(['collection-1'])
  })

  it('serializes only safe filtered history summaries', () => {
    const serialized = serializeVisionClipCollectionOperationHistory([createEntry(), createEntry({ id: 'history-2', type: 'flags', status: 'redoable', undoneAt: 200 })], { type: 'flags', status: 'redoable' }, 1234)
    expect(JSON.parse(serialized)).toEqual({
      schemaVersion: 1,
      typeFilter: 'flags',
      statusFilter: 'redoable',
      exportedAt: 1234,
      entries: [createEntry({ id: 'history-2', type: 'flags', status: 'redoable', undoneAt: 200 })]
    })
    expect(serialized).not.toContain('snapshot')
    expect(serialized).not.toContain('videoPath')
  })
})
