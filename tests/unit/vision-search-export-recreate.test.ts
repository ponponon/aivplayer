import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { hasVisionSearchExportOutputPathConflict, normalizeVisionSearchExportOutputPath, normalizeVisionSearchExportTaskIds, VISION_SEARCH_EXPORT_RECREATE_BATCH_MAX } from '../../src/core/ai/vision-search-export-recreate'

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

  it('normalizes output paths before conflict checks', () => {
    const expected = resolve('/tmp/aivplayer-export/result.json')
    const normalized = normalizeVisionSearchExportOutputPath('/tmp/aivplayer-export/../aivplayer-export/result.json')
    expect(normalized).toBe(process.platform === 'win32' || process.platform === 'darwin' ? expected.toLowerCase() : expected)
  })

  it('only treats active tasks with the same normalized path as conflicts', () => {
    const source = { taskId: 'source', outputPath: '/tmp/results/../results.json' }
    expect(hasVisionSearchExportOutputPathConflict(source, [{ taskId: 'active', outputPath: '/tmp/results.json', status: 'running' }])).toBe(true)
    expect(hasVisionSearchExportOutputPathConflict(source, [{ taskId: 'finished', outputPath: '/tmp/results.json', status: 'failed' }])).toBe(false)
    expect(hasVisionSearchExportOutputPathConflict(source, [{ taskId: 'other', outputPath: '/tmp/other.json', status: 'running' }])).toBe(false)
  })
})
