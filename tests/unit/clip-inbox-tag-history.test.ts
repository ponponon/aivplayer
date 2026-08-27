import { describe, expect, it } from 'vitest'
import { filterVisionClipCollectionTagOperationHistory, normalizeVisionClipCollectionTagOperationHistoryFilter, serializeVisionClipCollectionTagOperationHistory } from '../../src/core/ai/clip-inbox-tag-history'
import type { VisionClipCollectionTagOperationHistoryEntry } from '../../src/shared/vision-types'

const entries: VisionClipCollectionTagOperationHistoryEntry[] = [
  { id: 'batch-1', type: 'batch', createdAt: 400, status: 'active', undoneAt: null },
  { id: 'rename-1', type: 'rename', createdAt: 300, status: 'undone', undoneAt: 350 },
  { id: 'metadata-1', type: 'metadata', createdAt: 200, status: 'redoable', undoneAt: 250 },
  { id: 'cleanup-1', type: 'cleanup', createdAt: 100, status: 'active', undoneAt: null }
]

describe('clip inbox tag history', () => {
  it('normalizes unknown filters and preserves recent history order', () => {
    expect(normalizeVisionClipCollectionTagOperationHistoryFilter('unknown')).toBe('all')
    expect(filterVisionClipCollectionTagOperationHistory(entries, 'rename')).toEqual([entries[1]])
    expect(filterVisionClipCollectionTagOperationHistory(entries, 'all').map((entry) => entry.id)).toEqual(['batch-1', 'rename-1', 'metadata-1', 'cleanup-1'])
  })

  it('serializes a versioned filtered manifest without changing source entries', () => {
    const serialized = serializeVisionClipCollectionTagOperationHistory(entries, 'metadata', 1234.9)
    expect(JSON.parse(serialized)).toEqual({
      schemaVersion: 1,
      filter: 'metadata',
      exportedAt: 1234,
      entries: [entries[2]]
    })
    expect(entries).toHaveLength(4)
  })

  it('falls back to all history and a current timestamp for invalid export inputs', () => {
    const before = Date.now()
    const manifest = JSON.parse(serializeVisionClipCollectionTagOperationHistory(entries, 'invalid', Number.NaN)) as { filter: string; exportedAt: number; entries: unknown[] }
    expect(manifest.filter).toBe('all')
    expect(manifest.entries).toHaveLength(entries.length)
    expect(manifest.exportedAt).toBeGreaterThanOrEqual(before)
  })
})
