import { describe, expect, it } from 'vitest'
import { applyVisionCollectionTags, duplicateVisionCollectionTitle, getVisionCollectionTagPath, invertVisionClipSelections, mergeVisionClipCollections, normalizeVisionClipCollectionIds, normalizeVisionClipCollectionRenamePart, normalizeVisionCollectionTag, normalizeVisionCollectionTagColor, normalizeVisionCollectionTagFavorite, normalizeVisionCollectionTagNote, normalizeVisionCollectionTags, normalizeVisionCollectionTagsMode, renameVisionCollectionTag, renameVisionClipCollectionTitle, sortVisionClipSelections, toggleVisibleVisionClipCollectionSelection, wouldCreateVisionCollectionTagParentCycle } from '../../src/core/ai/clip-inbox-operations'
import type { VisionClipCollection, VisionClipSelection } from '../../src/shared/vision-types'

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

const collection = (id: string, patch: Partial<VisionClipCollection> = {}): VisionClipCollection => ({
  id,
  title: id,
  tags: [],
  sortMode: 'source-time',
  isFavorite: true,
  isArchived: true,
  createdAt: 1,
  updatedAt: 2,
  selections: [selection()],
  ...patch
})

describe('clip inbox operations', () => {
  it('adds a copy suffix to a collection title', () => {
    expect(duplicateVisionCollectionTitle('旅行片段')).toBe('旅行片段 · 副本')
    expect(duplicateVisionCollectionTitle('  ')).toBe('未命名选段集合 · 副本')
  })

  it('normalizes and caps batch collection ids', () => {
    expect(normalizeVisionClipCollectionIds([' first ', 'first', '', 'second', 3, ' third '])).toEqual(['first', 'second', 'third'])
    expect(normalizeVisionClipCollectionIds(Array.from({ length: 25 }, (_, index) => `collection-${index}`))).toHaveLength(20)
    expect(toggleVisibleVisionClipCollectionSelection(new Set(['outside']), [' first ', 'visible'], true)).toEqual(['outside', 'first', 'visible'])
    expect(toggleVisibleVisionClipCollectionSelection(new Set(['outside', 'visible']), ['visible'], false)).toEqual(['outside'])
  })

  it('builds bounded collection titles from prefix and suffix rules', () => {
    expect(normalizeVisionClipCollectionRenamePart('  项目- '.repeat(20))).toHaveLength(40)
    expect(renameVisionClipCollectionTitle('  海边片段  ', '旅行 · ', ' · 精选')).toBe('旅行 · 海边片段 · 精选')
    expect(renameVisionClipCollectionTitle('标题', '前缀', '后缀'.repeat(100))).toHaveLength(44)
    expect(renameVisionClipCollectionTitle('标题', '  ', undefined)).toBe('标题')
  })
  it('normalizes tags and removes duplicates', () => {
    expect(normalizeVisionCollectionTags(['  海边 ', '海边', '', '旅行', 'a'.repeat(60)])).toEqual(['海边', '旅行', 'a'.repeat(40)])
    expect(normalizeVisionCollectionTags('海边, 旅行, 海边')).toEqual(['海边', '旅行'])
  })

  it('applies bounded replace, add and remove tag modes', () => {
    expect(normalizeVisionCollectionTagsMode('invalid')).toBe('replace')
    expect(applyVisionCollectionTags(['海边', '采访'], ['旅行', '海边'], 'replace')).toEqual(['旅行', '海边'])
    expect(applyVisionCollectionTags(['海边', '采访'], ['旅行', '海边'], 'add')).toEqual(['海边', '采访', '旅行'])
    expect(applyVisionCollectionTags(['海边', '采访'], ['海边'], 'remove')).toEqual(['采访'])
    expect(normalizeVisionCollectionTag(' 海边 ')).toBe('海边')
    expect(normalizeVisionCollectionTag('海边,采访')).toBe('')
    expect(renameVisionCollectionTag(['海边', '采访'], '海边', '访谈')).toEqual(['访谈', '采访'])
    expect(renameVisionCollectionTag(['海边', '访谈'], '海边', '访谈')).toEqual(['访谈'])
    expect(renameVisionCollectionTag(['海边'], '海边', '海边')).toEqual(['海边'])
    expect(normalizeVisionCollectionTagColor(' #AABBcc ')).toBe('#aabbcc')
    expect(normalizeVisionCollectionTagColor('rgba(0,0,0,.5)')).toBe('')
    expect(normalizeVisionCollectionTagNote('  重点\r\n说明  ')).toBe('重点\n说明')
    expect(normalizeVisionCollectionTagNote('x'.repeat(300))).toHaveLength(240)
    expect(normalizeVisionCollectionTagFavorite(1)).toBe(true)
    expect(normalizeVisionCollectionTagFavorite('true')).toBe(false)
  })

  it('builds parent paths and rejects cyclic parent assignments', () => {
    const metadata = [
      { tag: '项目', parentTag: '', color: '', textColor: '', note: '', isFavorite: false, updatedAt: 1 },
      { tag: '访谈', parentTag: '项目', color: '', textColor: '', note: '', isFavorite: false, updatedAt: 2 },
      { tag: '海边', parentTag: '访谈', color: '', textColor: '', note: '', isFavorite: false, updatedAt: 3 }
    ]
    expect(wouldCreateVisionCollectionTagParentCycle('项目', '海边', metadata)).toBe(true)
    expect(wouldCreateVisionCollectionTagParentCycle('海边', '项目', metadata)).toBe(false)
    expect(getVisionCollectionTagPath('海边', metadata)).toEqual(['项目', '访谈', '海边'])
    expect(getVisionCollectionTagPath('不存在', metadata)).toEqual(['不存在'])
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

  it('merges distinct collections into a new portable input without mutating originals', () => {
    const first = collection('first', { title: '第一组', tags: ['海边'], selections: [selection({ evidenceIds: ['cue-1'], text: '第一段', startSeconds: 1, endSeconds: 3 })] })
    const second = collection('second', {
      title: '第二组',
      tags: ['精选', '海边'],
      selections: [
        selection({ evidenceIds: ['cue-2'], text: '第二段', startSeconds: 3.4, endSeconds: 5 }),
        selection({ sourceId: 'source-demo', videoPath: '/videos/other.mp4', fileName: 'other.mp4', fingerprint: '/videos/other.mp4:12', startSeconds: 2, endSeconds: 4, evidenceIds: ['other-1'] })
      ]
    })

    const merged = mergeVisionClipCollections([first, second, first], '  合并片段  ', 'duration-desc')

    expect(merged).toMatchObject({ title: '合并片段', tags: ['海边', '精选'], sortMode: 'duration-desc', isFavorite: false, isArchived: false })
    expect(merged.selections).toHaveLength(2)
    expect(merged.selections[0]).toMatchObject({ videoPath: '/videos/demo.mp4', startSeconds: 1, endSeconds: 5, evidenceIds: ['cue-1', 'cue-2'], text: '第一段\n第二段' })
    expect(merged.selections[1]).toMatchObject({ videoPath: '/videos/other.mp4', startSeconds: 2, endSeconds: 4 })
    expect(first.selections[0]).toMatchObject({ startSeconds: 1, endSeconds: 3, evidenceIds: ['cue-1'] })
  })

  it('rejects an empty title or fewer than two distinct collections', () => {
    const first = collection('first')
    expect(() => mergeVisionClipCollections([first, first], '合并')).toThrow('至少需要两个不同的选段集合')
    expect(() => mergeVisionClipCollections([first, collection('second')], '  ')).toThrow('合并后的选段集合名称不能为空')
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
