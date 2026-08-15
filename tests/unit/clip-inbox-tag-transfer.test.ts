import { describe, expect, it } from 'vitest'
import { parseVisionClipCollectionTagMetadataImport, parseVisionClipCollectionTagMetadataImportText, renderVisionClipCollectionTagMetadataExport } from '../../src/core/ai/clip-inbox-tag-transfer'

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
})
