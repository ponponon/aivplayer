import { describe, expect, it } from 'vitest'
import { parseVisionClipCollectionImport, parseVisionClipCollectionImportText, parseVisionClipCollectionsImport } from '../../src/core/ai/clip-inbox-import'

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
    expect(input).toMatchObject({ isFavorite: false, isArchived: false })
  })

  it('preserves collection favorite and archive flags in portable JSON', () => {
    const input = parseVisionClipCollectionImport({ exportVersion: 1, collection: { title: '归档备份', isFavorite: true, isArchived: true, selections: [selection] } })
    expect(input).toMatchObject({ isFavorite: true, isArchived: true })
  })

  it('rejects unsupported versions, empty collections, and invalid ranges', () => {
    expect(() => parseVisionClipCollectionImport({ exportVersion: 2, collection: { title: 'x', selections: [selection] } })).toThrow('版本')
    expect(() => parseVisionClipCollectionImport({ exportVersion: 1, collection: { title: 'x', selections: [] } })).toThrow('数量')
    expect(() => parseVisionClipCollectionImport({ exportVersion: 1, collection: { title: 'x', selections: [{ ...selection, startSeconds: 3, endSeconds: 3 }] } })).toThrow('为空')
  })

  it('parses version two multi-collection exports without preserving ids', () => {
    const inputs = parseVisionClipCollectionsImport({ exportVersion: 2, collections: [
      { id: 'old-1', title: '第一组', selections: [{ ...selection, startSeconds: 1, endSeconds: 2 }] },
      { id: 'old-2', title: '第二组', selections: [{ ...selection, startSeconds: 3, endSeconds: 4 }] }
    ] })
    expect(inputs.map((input) => input.title)).toEqual(['第一组', '第二组'])
    expect(inputs.every((input) => !('id' in input))).toBe(true)
  })

  it('reports the failing collection index for malformed batch exports', () => {
    expect(() => parseVisionClipCollectionsImport({ exportVersion: 2, collections: [{ title: '正常', selections: [selection] }, { title: '空集合', selections: [] }] })).toThrow('第 2 个集合')
  })
})
