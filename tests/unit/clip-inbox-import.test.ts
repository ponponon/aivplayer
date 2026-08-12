import { describe, expect, it } from 'vitest'
import { parseVisionClipCollectionImport, parseVisionClipCollectionImportText } from '../../src/core/ai/clip-inbox-import'

const selection = {
  sourceId: 'source-demo',
  videoPath: '/videos/demo.mp4',
  fileName: 'demo.mp4',
  fingerprint: '/videos/demo.mp4:12:1',
  durationSeconds: 12,
  startSeconds: -2,
  endSeconds: 20,
  evidenceIds: ['cue-1', 'cue-1'],
  evidenceTypes: ['subtitle', 'subtitle', 'unknown'],
  text: '  第一段  '
}

describe('clip inbox import', () => {
  it('parses the portable JSON export and normalizes safe fields', () => {
    const input = parseVisionClipCollectionImport({ exportVersion: 1, collection: { title: '  海边  ', tags: ['海边', '海边'], sortMode: 'duration-desc', selections: [selection] } })
    expect(input).toMatchObject({ title: '海边', tags: ['海边'], sortMode: 'duration-desc' })
    expect(input.selections[0]).toMatchObject({ startSeconds: 0, endSeconds: 12, evidenceIds: ['cue-1'], evidenceTypes: ['subtitle'], text: '第一段' })
  })

  it('accepts the rendered export and deliberately drops the old collection id', () => {
    const input = parseVisionClipCollectionImportText(JSON.stringify({ exportVersion: 1, collection: { id: 'old-id', title: '备份', selections: [{ ...selection, startSeconds: 1, endSeconds: 2 }] } }))
    expect(input).not.toHaveProperty('id')
  })

  it('rejects unsupported versions, empty collections, and invalid ranges', () => {
    expect(() => parseVisionClipCollectionImport({ exportVersion: 2, collection: { title: 'x', selections: [selection] } })).toThrow('版本')
    expect(() => parseVisionClipCollectionImport({ exportVersion: 1, collection: { title: 'x', selections: [] } })).toThrow('数量')
    expect(() => parseVisionClipCollectionImport({ exportVersion: 1, collection: { title: 'x', selections: [{ ...selection, startSeconds: 3, endSeconds: 3 }] } })).toThrow('为空')
  })
})
