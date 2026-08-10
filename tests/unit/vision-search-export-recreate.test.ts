import { describe, expect, it } from 'vitest'
import { normalizeVisionSearchExportTaskIds, VISION_SEARCH_EXPORT_RECREATE_BATCH_MAX } from '../../src/core/ai/vision-search-export-recreate'

describe('vision search export recreation', () => {
  it('normalizes, deduplicates, and bounds batch task IDs', () => {
    const input = [' first ', 'first', '', 'second', 42, ...Array.from({ length: 10 }, (_, index) => `task-${index}`)]
    expect(normalizeVisionSearchExportTaskIds(input)).toEqual([
      'first',
      'second',
      'task-0',
      'task-1',
      'task-2',
      'task-3',
      'task-4',
      'task-5'
    ])
    expect(normalizeVisionSearchExportTaskIds(input)).toHaveLength(VISION_SEARCH_EXPORT_RECREATE_BATCH_MAX)
  })

  it('rejects non-array input', () => {
    expect(normalizeVisionSearchExportTaskIds(undefined)).toEqual([])
    expect(normalizeVisionSearchExportTaskIds({ taskIds: ['task-1'] })).toEqual([])
  })
})
