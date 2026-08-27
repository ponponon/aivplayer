import { describe, expect, it } from 'vitest'
import { filterVisionClipCollectionTagOperationHistory, normalizeVisionClipCollectionTagOperationHistoryFilter, normalizeVisionClipCollectionTagOperationHistoryPageRequest, paginateVisionClipCollectionTagOperationHistory, serializeVisionClipCollectionTagOperationHistory } from '../../src/core/ai/clip-inbox-tag-history'
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

  it('supports filtering single collection tag edits', () => {
    const entry: VisionClipCollectionTagOperationHistoryEntry = { id: 'single-1', type: 'single', createdAt: 500, status: 'active', undoneAt: null }
    expect(normalizeVisionClipCollectionTagOperationHistoryFilter('single')).toBe('single')
    expect(filterVisionClipCollectionTagOperationHistory([entry], 'single')).toEqual([entry])
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

  it('normalizes page boundaries and keeps the page size bounded', () => {
    expect(normalizeVisionClipCollectionTagOperationHistoryPageRequest({ offset: 2.8, limit: 999, filter: 'rename' })).toEqual({ offset: 2, limit: 20, filter: 'rename' })
    expect(normalizeVisionClipCollectionTagOperationHistoryPageRequest({ offset: -4, limit: 0, filter: 'invalid' })).toEqual({ offset: 0, limit: 1, filter: 'all' })
  })

  it('paginates filtered history and reports total and continuation state', () => {
    const page = paginateVisionClipCollectionTagOperationHistory(entries, { offset: 1, limit: 2, filter: 'all' })
    expect(page).toEqual({ entries: [entries[1], entries[2]], offset: 1, limit: 2, total: 4, hasMore: true })
    expect(paginateVisionClipCollectionTagOperationHistory(entries, { offset: 4, limit: 20 }).entries).toEqual([])
    expect(paginateVisionClipCollectionTagOperationHistory(entries, { offset: 0, limit: 20, filter: 'metadata' })).toMatchObject({ total: 1, hasMore: false, entries: [entries[2]] })
  })
})
