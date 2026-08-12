import { describe, expect, it } from 'vitest'
import { duplicateVisionCollectionTitle, invertVisionClipSelections, normalizeVisionCollectionTags, sortVisionClipSelections } from '../../src/core/ai/clip-inbox-operations'
import type { VisionClipSelection } from '../../src/shared/vision-types'

const selection = (patch: Partial<VisionClipSelection> = {}): VisionClipSelection => ({
  sourceId: 'source-demo',
  videoPath: '/videos/demo.mp4',
  fileName: 'demo.mp4',
  fingerprint: '/videos/demo.mp4:12',
  durationSeconds: 12,
  width: 1920,
  height: 1080,
  startSeconds: 1,
  endSeconds: 3,
  evidenceIds: ['cue-1'],
  evidenceTypes: ['subtitle'],
  ...patch
})

describe('clip inbox operations', () => {
  it('adds a copy suffix to a collection title', () => {
    expect(duplicateVisionCollectionTitle('旅行片段')).toBe('旅行片段 · 副本')
    expect(duplicateVisionCollectionTitle('  ')).toBe('未命名选段集合 · 副本')
  })
  it('normalizes tags and removes duplicates', () => {
    expect(normalizeVisionCollectionTags(['  海边 ', '海边', '', '旅行', 'a'.repeat(60)])).toEqual(['海边', '旅行', 'a'.repeat(40)])
    expect(normalizeVisionCollectionTags('海边, 旅行, 海边')).toEqual(['海边', '旅行'])
  })

  it('sorts by duration and file name', () => {
    const selections = [
      selection({ fileName: 'z.mp4', startSeconds: 6, endSeconds: 7 }),
      selection({ fileName: 'a.mp4', startSeconds: 2, endSeconds: 8 }),
      selection({ fileName: 'b.mp4', startSeconds: 0, endSeconds: 1 })
    ]
    expect(sortVisionClipSelections(selections, 'duration-desc').map((item) => item.fileName)).toEqual(['a.mp4', 'b.mp4', 'z.mp4'])
    expect(sortVisionClipSelections(selections, 'file-name').map((item) => item.fileName)).toEqual(['a.mp4', 'b.mp4', 'z.mp4'])
  })

  it('inverts selected ranges into unselected ranges per source', () => {
    const result = invertVisionClipSelections([
      selection({ startSeconds: 2, endSeconds: 4 }),
      selection({ startSeconds: 6, endSeconds: 8, evidenceIds: ['cue-2'] })
    ])

    expect(result.map(({ startSeconds, endSeconds, evidenceIds, text }) => ({ startSeconds, endSeconds, evidenceIds, text }))).toEqual([
      { startSeconds: 0, endSeconds: 2, evidenceIds: [], text: undefined },
      { startSeconds: 4, endSeconds: 6, evidenceIds: [], text: undefined },
      { startSeconds: 8, endSeconds: 12, evidenceIds: [], text: undefined }
    ])
  })
})
