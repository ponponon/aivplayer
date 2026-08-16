import { describe, expect, it } from 'vitest'
import { mergeVisionClipCollectionTagOrder, moveVisionClipCollectionTagOrder, normalizeVisionClipCollectionTagOrderPreferences, parseVisionClipCollectionTagOrderPreferences, serializeVisionClipCollectionTagOrderPreferences } from '../../src/core/ai/clip-inbox-tag-order'

describe('clip inbox tag order preferences', () => {
  it('normalizes a bounded order and custom sort mode', () => {
    expect(normalizeVisionClipCollectionTagOrderPreferences({ order: [' 海边 ', '海边', '', '采访'], sortMode: 'custom' })).toEqual({ schemaVersion: 1, order: ['海边', '采访'], sortMode: 'custom' })
    expect(parseVisionClipCollectionTagOrderPreferences('{invalid}')).toEqual({ schemaVersion: 1, order: [], sortMode: 'name' })
  })

  it('serializes and parses the persistent preference contract', () => {
    const raw = serializeVisionClipCollectionTagOrderPreferences({ schemaVersion: 1, order: ['项目', '海边'], sortMode: 'custom' })
    expect(parseVisionClipCollectionTagOrderPreferences(raw)).toEqual({ schemaVersion: 1, order: ['项目', '海边'], sortMode: 'custom' })
  })

  it('keeps known order and appends newly used tags deterministically', () => {
    expect(mergeVisionClipCollectionTagOrder(['项目', '海边', '已删除'], ['采访', '海边', '项目', '新增'])).toEqual(['项目', '海边', '新增', '采访'])
  })

  it('moves one tag without mutating the source order or crossing boundaries', () => {
    const order = ['项目', '海边', '采访']
    expect(moveVisionClipCollectionTagOrder(order, '采访', 'up')).toEqual(['项目', '采访', '海边'])
    expect(moveVisionClipCollectionTagOrder(order, '项目', 'up')).toEqual(order)
    expect(order).toEqual(['项目', '海边', '采访'])
  })
})
