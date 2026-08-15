import { describe, expect, it } from 'vitest'
import { createVisionClipCollectionTagMetadataImportPreview, filterVisionClipCollectionTagMetadataImport, parseVisionClipCollectionTagMetadataImport, parseVisionClipCollectionTagMetadataImportText, renderVisionClipCollectionTagMetadataExport } from '../../src/core/ai/clip-inbox-tag-transfer'
import type { VisionClipCollectionTagMetadata } from '../../src/shared/vision-types'

describe('clip inbox tag metadata transfer', () => {
  const metadata = [{ tag: ' 海边 ', parentTag: '项目', color: '#AABBCC', textColor: '#101010', note: '镜头备注\r\n第二行', isFavorite: true, updatedAt: 123 }] as const

  it('renders a versioned portable metadata manifest and normalizes entries on import', () => {
    const output = renderVisionClipCollectionTagMetadataExport(metadata)
    expect(JSON.parse(output)).toMatchObject({ exportVersion: 1, metadata: [{ tag: '海边', parentTag: '项目', color: '#aabbcc', textColor: '#101010', note: '镜头备注\n第二行', isFavorite: true }] })
    expect(parseVisionClipCollectionTagMetadataImportText(output)).toMatchObject([{ tag: '海边', note: '镜头备注\n第二行', isFavorite: true }])
  })

  it('rejects unsupported versions, duplicate tags, and invalid colors', () => {
    expect(() => parseVisionClipCollectionTagMetadataImport({ exportVersion: 2, metadata: [] })).toThrow('版本')
    expect(() => parseVisionClipCollectionTagMetadataImport({ exportVersion: 1, metadata: [{ tag: '海边' }, { tag: ' 海边 ' }] })).toThrow('重复')
    expect(() => parseVisionClipCollectionTagMetadataImport({ exportVersion: 1, metadata: [{ tag: '海边', color: '#12' }] })).toThrow('背景色')
    expect(() => parseVisionClipCollectionTagMetadataImportText('{')).toThrow('有效的 JSON')
  })

  it('classifies new, unchanged, conflicting, and unused metadata before applying it', () => {
    const incoming = [
      { tag: '新增', parentTag: '', color: '#111111', textColor: '#ffffff', note: '', isFavorite: false, updatedAt: 10 },
      { tag: '不变', parentTag: '', color: '#222222', textColor: '#ffffff', note: '', isFavorite: false, updatedAt: 10 },
      { tag: '冲突', parentTag: '', color: '#333333', textColor: '#ffffff', note: '导入', isFavorite: true, updatedAt: 10 },
      { tag: '未使用', parentTag: '', color: '#444444', textColor: '#ffffff', note: '', isFavorite: false, updatedAt: 10 }
    ] as const
    const current = [
      incoming[1],
      { ...incoming[2], note: '本地', isFavorite: false }
    ] as const
    expect(createVisionClipCollectionTagMetadataImportPreview(incoming, current, new Set(['新增', '不变', '冲突']))).toMatchObject([
      { tag: '新增', state: 'new', current: null },
      { tag: '不变', state: 'unchanged' },
      { tag: '冲突', state: 'conflict' },
      { tag: '未使用', state: 'unused' }
    ])
  })

  it('filters local-preserving and skipped decisions while keeping overwrite and undecided entries', () => {
    const entries: VisionClipCollectionTagMetadata[] = [...metadata, { tag: '采访', parentTag: '', color: '', textColor: '', note: '', isFavorite: false, updatedAt: 0 }]
    expect(filterVisionClipCollectionTagMetadataImport(entries, { ' 海边 ': 'overwrite', 采访: 'keep-local' })).toHaveLength(1)
    expect(filterVisionClipCollectionTagMetadataImport(entries, { ' 海边 ': 'skip', 采访: 'overwrite' })).toMatchObject([{ tag: '采访' }])
  })
})
