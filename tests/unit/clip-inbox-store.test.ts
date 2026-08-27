import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClipInboxStore } from '../../src/core/ai/clip-inbox-store'
import { getVisionClipSelectionMergeKey } from '../../src/core/ai/clip-inbox-operations'
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
  text: '第一段',
  evidenceTypes: ['subtitle'],
  ...patch
})

describe('clip inbox store', () => {
  let tempDirectory: string
  let store: ClipInboxStore

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-clip-inbox-'))
    store = new ClipInboxStore(tempDirectory)
  })

  afterEach(async () => {
    store.close()
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('persists collections and normalizes overlapping selections', () => {
    const saved = store.saveCollection({
      title: '海边片段',
      selections: [selection(), selection({ startSeconds: 2.96, endSeconds: 4, evidenceIds: ['cue-2'], text: '第二段' })]
    })

    expect(saved.title).toBe('海边片段')
    expect(saved.selections).toHaveLength(1)
    expect(saved.selections[0]).toMatchObject({ startSeconds: 1, endSeconds: 4, evidenceIds: ['cue-1', 'cue-2'], text: '第一段\n第二段' })

    store.close()
    store = new ClipInboxStore(tempDirectory)
    expect(store.listCollections()).toEqual([saved])
    expect(store.getCollection(saved.id)).toEqual(saved)
  })

  it('updates an existing collection without changing its creation time', () => {
    const created = store.saveCollection({ id: 'collection-1', title: '旧标题', selections: [selection()] })
    const updated = store.saveCollection({ id: created.id, title: '新标题', selections: [selection({ startSeconds: 5, endSeconds: 7 })] })

    expect(updated).toMatchObject({ id: created.id, title: '新标题', createdAt: created.createdAt })
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt)
    expect(store.listCollections()).toHaveLength(1)
  })

  it('persists object detection as a clip evidence type', () => {
    const saved = store.saveCollection({ title: '物体检测片段', selections: [selection({ evidenceTypes: ['object'], text: 'person' })] })
    expect(saved.selections[0]?.evidenceTypes).toEqual(['object'])
    store.close()
    store = new ClipInboxStore(tempDirectory)
    expect(store.getCollection(saved.id)?.selections[0]?.evidenceTypes).toEqual(['object'])
  })

  it('persists tags and the requested sort mode', () => {
    const saved = store.saveCollection({
      title: '按时长排序',
      tags: ['  海边 ', '海边', '旅行'],
      sortMode: 'duration-desc',
      selections: [selection({ startSeconds: 1, endSeconds: 2 }), selection({ startSeconds: 5, endSeconds: 10 })]
    })

    expect(saved.tags).toEqual(['海边', '旅行'])
    expect(saved.sortMode).toBe('duration-desc')
    expect(saved.selections.map((item) => item.endSeconds - item.startSeconds)).toEqual([5, 1])

    store.close()
    store = new ClipInboxStore(tempDirectory)
    expect(store.getCollection(saved.id)).toEqual(saved)
  })

  it('persists collection favorite and archive flags and preserves them on ordinary updates', () => {
    const saved = store.saveCollection({ title: '收藏归档集合', isFavorite: true, isArchived: true, selections: [selection()] })
    expect(saved).toMatchObject({ isFavorite: true, isArchived: true })

    const updated = store.saveCollection({ id: saved.id, title: '收藏归档集合已改名', selections: [selection({ startSeconds: 4, endSeconds: 6 })] })
    expect(updated).toMatchObject({ id: saved.id, title: '收藏归档集合已改名', isFavorite: true, isArchived: true })

    store.close()
    store = new ClipInboxStore(tempDirectory)
    expect(store.getCollection(saved.id)).toMatchObject({ isFavorite: true, isArchived: true })
  })

  it('records batch flag changes and restores the previous state from a SQLite snapshot', () => {
    const first = store.saveCollection({ title: '撤销收藏一', selections: [selection()] })
    const second = store.saveCollection({ title: '撤销收藏二', isArchived: true, selections: [selection({ startSeconds: 4, endSeconds: 6 })] })
    const beforeFirst = store.getCollection(first.id)
    const beforeSecond = store.getCollection(second.id)

    const updated = store.updateCollectionFlags({ collectionIds: [first.id, second.id, 'missing'], isFavorite: true })
    expect(updated.collections).toHaveLength(2)
    expect(updated.collections.every((collection) => collection.isFavorite)).toBe(true)
    expect(updated.collections.find((collection) => collection.id === second.id)?.isArchived).toBe(true)
    expect(updated.skippedCount).toBe(1)
    expect(store.getLastCollectionOperation()).toMatchObject({ type: 'flags' })

    const undone = store.undoLastCollectionOperation()
    expect(undone).toMatchObject({ success: true, operation: expect.objectContaining({ type: 'flags' }) })
    expect(store.getCollection(first.id)).toEqual(beforeFirst)
    expect(store.getCollection(second.id)).toEqual(beforeSecond)
    expect(store.getLastCollectionOperation()).toBeNull()
    expect(store.undoLastCollectionOperation()).toMatchObject({ success: false, operation: null, collections: [] })
  })

  it('does not create an undo entry for a no-op flag update', () => {
    const saved = store.saveCollection({ title: '无变化收藏', isFavorite: true, selections: [selection()] })
    const result = store.updateCollectionFlags({ collectionIds: [saved.id], isFavorite: true })

    expect(result.collections).toEqual([saved])
    expect(store.getLastCollectionOperation()).toBeNull()
  })

  it('persists a redo snapshot across restart and clears it after a new operation', () => {
    const saved = store.saveCollection({ title: '重做收藏', selections: [selection()] })
    store.updateCollectionFlags({ collectionIds: [saved.id], isFavorite: true })
    expect(store.undoLastCollectionOperation().success).toBe(true)
    expect(store.getLastCollectionRedoOperation()).toMatchObject({ type: 'flags' })

    store.close()
    store = new ClipInboxStore(tempDirectory)
    const redone = store.redoLastCollectionOperation()
    expect(redone).toMatchObject({ success: true, operation: expect.objectContaining({ type: 'flags' }) })
    expect(store.getCollection(saved.id)).toMatchObject({ isFavorite: true, isArchived: false })
    expect(store.getLastCollectionRedoOperation()).toBeNull()

    expect(store.undoLastCollectionOperation().success).toBe(true)
    store.updateCollectionFlags({ collectionIds: [saved.id], isArchived: true })
    expect(store.getLastCollectionRedoOperation()).toBeNull()
  })

  it('records batch merges and restores only the generated collection through undo and redo', () => {
    const first = store.saveCollection({ title: '合并源一', tags: ['人物'], selections: [selection({ startSeconds: 1, endSeconds: 3 })] })
    const second = store.saveCollection({ title: '合并源二', tags: ['采访'], selections: [selection({ startSeconds: 4, endSeconds: 6 })] })
    const result = store.mergeCollections([first.id, second.id], '合并结果', 'source-time')

    expect(result.collection).toMatchObject({ title: '合并结果', tags: ['人物', '采访'] })
    expect(result.collection.selections).toEqual([
      expect.objectContaining({ startSeconds: 1, endSeconds: 3 }),
      expect.objectContaining({ startSeconds: 4, endSeconds: 6 })
    ])
    expect(store.getLastCollectionOperation()).toMatchObject({ type: 'merge' })

    const undone = store.undoLastCollectionOperation()
    expect(undone).toMatchObject({ success: true, operation: expect.objectContaining({ type: 'merge' }), deletedCollectionIds: [result.collection.id] })
    expect(store.getCollection(result.collection.id)).toBeNull()
    expect(store.getCollection(first.id)).toEqual(first)
    expect(store.getCollection(second.id)).toEqual(second)
    expect(store.getLastCollectionRedoOperation()).toMatchObject({ type: 'merge' })

    store.close()
    store = new ClipInboxStore(tempDirectory)
    const redone = store.redoLastCollectionOperation()
    expect(redone).toMatchObject({ success: true, operation: expect.objectContaining({ type: 'merge' }), createdCollectionIds: [result.collection.id] })
    expect(store.getCollection(result.collection.id)).toEqual(result.collection)
    expect(store.getLastCollectionRedoOperation()).toBeNull()
  })

  it('refuses to undo a merge after the generated collection was edited', () => {
    const first = store.saveCollection({ title: '编辑源一', selections: [selection({ startSeconds: 1, endSeconds: 2 })] })
    const second = store.saveCollection({ title: '编辑源二', selections: [selection({ startSeconds: 3, endSeconds: 4 })] })
    const result = store.mergeCollections([first.id, second.id], '待编辑合并', 'source-time')
    const edited = store.saveCollection({ id: result.collection.id, title: '用户编辑后的合并', selections: result.collection.selections })

    const undone = store.undoLastCollectionOperation()
    expect(undone).toMatchObject({ success: false, operation: null, collections: [] })
    expect(store.getCollection(result.collection.id)).toEqual(edited)
    expect(store.getLastCollectionOperation()).toMatchObject({ type: 'merge' })
  })

  it('deletes a collection and rejects empty collections', () => {
    expect(() => store.saveCollection({ title: '空集合', selections: [] })).toThrow('至少需要一个有效选段')
    const saved = store.saveCollection({ title: '待删除', selections: [selection()] })
    expect(store.deleteCollection(saved.id)).toBe(true)
    expect(store.deleteCollection(saved.id)).toBe(false)
    expect(store.listCollections()).toEqual([])
  })

  it('records batch deletion and restores the original collections through undo and redo', () => {
    const first = store.saveCollection({ title: '删除恢复一', tags: ['旧'], isFavorite: true, selections: [selection({ startSeconds: 1, endSeconds: 2 })] })
    const second = store.saveCollection({ title: '删除恢复二', isArchived: true, selections: [selection({ startSeconds: 3, endSeconds: 5 })] })
    const untouched = store.saveCollection({ title: '删除恢复保留', selections: [selection({ startSeconds: 7, endSeconds: 9 })] })
    const deleted = store.deleteCollections([first.id, second.id, 'missing'])

    expect(deleted).toEqual({ deletedIds: [first.id, second.id], deletedCount: 2, skippedCount: 1 })
    expect(store.getLastCollectionOperation()).toMatchObject({ type: 'delete' })
    expect(store.getCollection(first.id)).toBeNull()
    expect(store.getCollection(second.id)).toBeNull()

    const undone = store.undoLastCollectionOperation()
    expect(undone).toMatchObject({ success: true, operation: expect.objectContaining({ type: 'delete' }), createdCollectionIds: [first.id, second.id] })
    expect(undone.collections).toEqual([first, second])
    expect(store.getCollection(first.id)).toEqual(first)
    expect(store.getCollection(second.id)).toEqual(second)
    expect(store.getCollection(untouched.id)).toEqual(untouched)

    store.close()
    store = new ClipInboxStore(tempDirectory)
    const redone = store.redoLastCollectionOperation()
    expect(redone).toMatchObject({ success: true, operation: expect.objectContaining({ type: 'delete' }), deletedCollectionIds: [first.id, second.id] })
    expect(store.getCollection(first.id)).toBeNull()
    expect(store.getCollection(second.id)).toBeNull()
    expect(store.getCollection(untouched.id)).toEqual(untouched)
  })

  it('refuses to redo a deletion after a restored collection was edited', () => {
    const first = store.saveCollection({ title: '重做冲突一', selections: [selection({ startSeconds: 1, endSeconds: 2 })] })
    const second = store.saveCollection({ title: '重做冲突二', selections: [selection({ startSeconds: 3, endSeconds: 4 })] })
    store.deleteCollections([first.id, second.id])
    expect(store.undoLastCollectionOperation().success).toBe(true)
    const edited = store.saveCollection({ id: first.id, title: '恢复后被编辑', selections: first.selections })

    const redone = store.redoLastCollectionOperation()
    expect(redone).toMatchObject({ success: false, operation: null, collections: [] })
    expect(store.getCollection(first.id)).toEqual(edited)
    expect(store.getCollection(second.id)).toEqual(second)
    expect(store.getLastCollectionRedoOperation()).toMatchObject({ type: 'delete' })
  })

  it('records batch renaming and restores collection titles through undo and redo', () => {
    const first = store.saveCollection({ title: '重命名恢复一', tags: ['保留'], isFavorite: true, selections: [selection({ startSeconds: 1, endSeconds: 2 })] })
    const second = store.saveCollection({ title: '重命名恢复二', isArchived: true, selections: [selection({ startSeconds: 3, endSeconds: 5 })] })
    const renamed = store.renameCollections([first.id, second.id, 'missing'], '项目 · ', ' · 精选')

    expect(renamed.collections.map((collection) => collection.title)).toEqual(['项目 · 重命名恢复一 · 精选', '项目 · 重命名恢复二 · 精选'])
    expect(store.getLastCollectionOperation()).toMatchObject({ type: 'rename' })

    const undone = store.undoLastCollectionOperation()
    expect(undone).toMatchObject({ success: true, operation: expect.objectContaining({ type: 'rename' }) })
    expect(undone.collections).toEqual([first, second])
    expect(store.getLastCollectionRedoOperation()).toMatchObject({ type: 'rename' })

    store.close()
    store = new ClipInboxStore(tempDirectory)
    const redone = store.redoLastCollectionOperation()
    expect(redone).toMatchObject({ success: true, operation: expect.objectContaining({ type: 'rename' }) })
    expect(redone.collections.map((collection) => collection.title)).toEqual(renamed.collections.map((collection) => collection.title))
    expect(store.getCollection(first.id)?.tags).toEqual(first.tags)
    expect(store.getCollection(second.id)?.isArchived).toBe(true)
  })

  it('refuses to undo a batch rename after a renamed collection was edited', () => {
    const first = store.saveCollection({ title: '重命名冲突一', selections: [selection({ startSeconds: 1, endSeconds: 2 })] })
    const second = store.saveCollection({ title: '重命名冲突二', selections: [selection({ startSeconds: 3, endSeconds: 4 })] })
    const renamed = store.renameCollections([first.id, second.id], '项目 · ', '')
    const edited = store.saveCollection({ id: first.id, title: '用户编辑后的标题', selections: renamed.collections[0]?.selections ?? [] })

    const undone = store.undoLastCollectionOperation()
    expect(undone).toMatchObject({ success: false, operation: null, collections: [] })
    expect(store.getCollection(first.id)).toEqual(edited)
    expect(store.getCollection(second.id)?.title).toBe(renamed.collections[1]?.title)
    expect(store.getLastCollectionOperation()).toMatchObject({ type: 'rename' })
  })

  it('records an inline rename and restores the complete collection through undo and redo', () => {
    const saved = store.saveCollection({ title: '内联改名前', tags: ['精选'], isFavorite: true, sortMode: 'duration-desc', selections: [selection({ startSeconds: 4, endSeconds: 9, evidenceIds: ['inline-rename'] })] })
    const renamed = store.renameCollection(saved.id, '内联改名后')

    expect(renamed).toMatchObject({ id: saved.id, title: '内联改名后', tags: saved.tags, isFavorite: true, sortMode: 'duration-desc', selections: saved.selections })
    expect(store.getLastCollectionOperation()).toMatchObject({ type: 'rename' })

    const undone = store.undoLastCollectionOperation()
    expect(undone.success).toBe(true)
    expect(store.getCollection(saved.id)).toEqual(saved)
    expect(store.getLastCollectionRedoOperation()).toMatchObject({ type: 'rename' })

    const redone = store.redoLastCollectionOperation()
    expect(redone.success).toBe(true)
    expect(store.getCollection(saved.id)).toEqual(renamed)
  })

  it('deletes several collections in one transaction and reports missing ids', () => {
    const first = store.saveCollection({ title: '批量待删一', selections: [selection({ startSeconds: 1, endSeconds: 2 })] })
    const second = store.saveCollection({ title: '批量待删二', selections: [selection({ startSeconds: 3, endSeconds: 4 })] })
    const third = store.saveCollection({ title: '批量保留', selections: [selection({ startSeconds: 5, endSeconds: 6 })] })

    const result = store.deleteCollections([` ${first.id} `, second.id, first.id, 'missing'])

    expect(result).toEqual({ deletedIds: [first.id, second.id], deletedCount: 2, skippedCount: 1 })
    expect(store.listCollections().map((collection) => collection.id)).toEqual([third.id])
    expect(store.getCollection(first.id)).toBeNull()
    expect(store.getCollection(second.id)).toBeNull()
  })

  it('renames several collections atomically and preserves collection data', () => {
    const first = store.saveCollection({ title: '旅行一', tags: ['旅行'], sortMode: 'duration-desc', selections: [selection({ startSeconds: 1, endSeconds: 2 })] })
    const second = store.saveCollection({ title: '旅行二', selections: [selection({ startSeconds: 3, endSeconds: 4 })] })
    const result = store.renameCollections([first.id, ` ${second.id} `, 'missing'], '2026 · ', ' · 精选')

    expect(result.collections.map((collection) => collection.title)).toEqual(['2026 · 旅行一 · 精选', '2026 · 旅行二 · 精选'])
    expect(result.collections.map((collection) => collection.id)).toEqual([first.id, second.id])
    expect(result.collections[0]).toMatchObject({ tags: ['旅行'], sortMode: 'duration-desc', selections: first.selections })
    expect(result.skippedCount).toBe(1)
    expect(store.getCollection(first.id)?.updatedAt).toBeGreaterThanOrEqual(first.updatedAt)
  })

  it('updates tags for several collections atomically and preserves collection data', () => {
    const first = store.saveCollection({ title: '标签一', tags: ['旧标签'], sortMode: 'duration-desc', selections: [selection({ startSeconds: 1, endSeconds: 2 })] })
    const second = store.saveCollection({ title: '标签二', tags: ['保留'], selections: [selection({ startSeconds: 3, endSeconds: 4 })] })
    const result = store.updateCollectionsTags([first.id, ` ${second.id} `, first.id, 'missing'], [' 海边 ', '海边', '精选'])

    expect(result.collections.map((collection) => collection.id)).toEqual([first.id, second.id])
    expect(result.collections.map((collection) => collection.tags)).toEqual([['海边', '精选'], ['海边', '精选']])
    expect(result.collections[0]).toMatchObject({ title: '标签一', sortMode: 'duration-desc', selections: first.selections })
    expect(result.collections[1]).toMatchObject({ title: '标签二', selections: second.selections })
    expect(result.skippedCount).toBe(1)

    const cleared = store.updateCollectionsTags([first.id], [])
    expect(cleared.collections[0]?.tags).toEqual([])
    expect(store.getCollection(second.id)?.tags).toEqual(['海边', '精选'])
  })

  it('records and undoes batch tag changes without touching unselected collections', () => {
    const first = store.saveCollection({ title: '批量撤销一', tags: ['旧标签'], selections: [selection()] })
    const second = store.saveCollection({ title: '批量撤销二', tags: ['保留'], selections: [selection({ startSeconds: 3, endSeconds: 4 })] })
    const untouched = store.saveCollection({ title: '批量撤销三', tags: ['不变'], selections: [selection({ startSeconds: 5, endSeconds: 7 })] })

    const updated = store.updateCollectionsTags([first.id, second.id], ['批量标签'], 'add')
    expect(updated.collections.map((collection) => collection.tags)).toEqual([['旧标签', '批量标签'], ['保留', '批量标签']])
    expect(store.getLastTagOperation()).toMatchObject({ type: 'batch' })

    const undone = store.undoLastTagOperation()
    expect(undone).toMatchObject({ success: true, operation: expect.objectContaining({ type: 'batch' }) })
    expect(store.getCollection(first.id)?.tags).toEqual(['旧标签'])
    expect(store.getCollection(second.id)?.tags).toEqual(['保留'])
    expect(store.getCollection(untouched.id)?.tags).toEqual(['不变'])
  })

  it('appends and removes tags without changing other collection fields', () => {
    const saved = store.saveCollection({ title: '标签模式', tags: ['海边', '采访'], sortMode: 'file-name', selections: [selection({ evidenceIds: ['mode-evidence'] })] })
    const added = store.updateCollectionsTags([saved.id], ['旅行', '海边'], 'add').collections[0]
    expect(added?.tags).toEqual(['海边', '采访', '旅行'])
    expect(added).toMatchObject({ title: saved.title, sortMode: saved.sortMode, selections: saved.selections })
    const removed = store.updateCollectionsTags([saved.id], ['采访', '不存在'], 'remove').collections[0]
    expect(removed?.tags).toEqual(['海边', '旅行'])
  })

  it('cleans one tag from every matching collection in one transaction', () => {
    const first = store.saveCollection({ title: '清理标签一', tags: ['海边', '采访'], selections: [selection({ evidenceIds: ['cleanup-one'] })] })
    const second = store.saveCollection({ title: '清理标签二', tags: ['海边'], selections: [selection({ startSeconds: 4, endSeconds: 6, evidenceIds: ['cleanup-two'] })] })
    const untouched = store.saveCollection({ title: '清理标签三', tags: ['室内'], selections: [selection({ startSeconds: 7, endSeconds: 9, evidenceIds: ['cleanup-three'] })] })

    const result = store.removeTagFromAllCollections(' 海边 ')
    expect(result.tag).toBe('海边')
    expect(result.collections.map((collection) => collection.id)).toEqual([first.id, second.id])
    expect(result.collections[0]).toMatchObject({ tags: ['采访'], title: first.title, sortMode: first.sortMode, selections: first.selections })
    expect(result.collections[1]?.tags).toEqual([])
    expect(store.getCollection(untouched.id)?.tags).toEqual(['室内'])
    expect(store.removeTagFromAllCollections('不存在').collections).toEqual([])
  })

  it('renames one tag across every matching collection and merges duplicates', () => {
    const first = store.saveCollection({ title: '迁移标签一', tags: ['海边', '采访'], sortMode: 'duration-desc', selections: [selection({ evidenceIds: ['rename-one'] })] })
    const second = store.saveCollection({ title: '迁移标签二', tags: ['海边', '访谈'], selections: [selection({ startSeconds: 4, endSeconds: 6, evidenceIds: ['rename-two'] })] })
    const untouched = store.saveCollection({ title: '迁移标签三', tags: ['室内'], selections: [selection({ startSeconds: 7, endSeconds: 9, evidenceIds: ['rename-three'] })] })

    const result = store.renameTagAcrossCollections(' 海边 ', ' 访谈 ')
    expect(result).toMatchObject({ fromTag: '海边', toTag: '访谈' })
    expect(result.collections.map((collection) => collection.id)).toEqual([first.id, second.id])
    expect(result.collections[0]).toMatchObject({ tags: ['访谈', '采访'], title: first.title, sortMode: first.sortMode, selections: first.selections })
    expect(result.collections[1]?.tags).toEqual(['访谈'])
    expect(store.getCollection(untouched.id)?.tags).toEqual(['室内'])
    expect(store.renameTagAcrossCollections('不存在', '新标签').collections).toEqual([])
    expect(store.renameTagAcrossCollections('海边', '海边').collections).toEqual([])
  })

  it('persists tag metadata and migrates it with a renamed tag', () => {
    const source = store.saveCollection({ title: '样式标签源', tags: ['海边', '采访'], selections: [selection()] })
    const target = store.saveCollection({ title: '样式标签目标', tags: ['访谈'], selections: [selection({ startSeconds: 4, endSeconds: 6 })] })
    const sourceMetadata = store.saveTagMetadata({ tag: '海边', parentTag: '采访', color: '#AABBCC', textColor: '#101010', note: '源标签重点', isFavorite: true })
    const targetMetadata = store.saveTagMetadata({ tag: '访谈', color: '#112233', note: '目标标签说明' })

    expect(sourceMetadata).toMatchObject({ tag: '海边', parentTag: '采访', color: '#aabbcc', textColor: '#101010', note: '源标签重点', isFavorite: true })
    expect(targetMetadata).toMatchObject({ tag: '访谈', color: '#112233', textColor: '', note: '目标标签说明', isFavorite: false })
    const renamed = store.renameTagAcrossCollections('海边', '访谈')
    expect(renamed.collections.map((collection) => collection.id)).toEqual([source.id])
    expect(store.getTagMetadata('海边')).toBeNull()
    expect(store.getTagMetadata('访谈')).toMatchObject({ tag: '访谈', color: '#112233', textColor: '#101010', note: '目标标签说明', isFavorite: true })

    store.close()
    store = new ClipInboxStore(tempDirectory)
    expect(store.listTagMetadata()).toEqual([expect.objectContaining({ tag: '访谈', color: '#112233', textColor: '#101010', note: '目标标签说明', isFavorite: true })])
    expect(store.getCollection(target.id)?.tags).toEqual(['访谈'])
  })

  it('imports tag metadata only for existing tags and makes it undoable', () => {
    const source = store.saveCollection({ title: '导入元数据源', tags: ['海边', '项目'], selections: [selection()] })
    store.saveCollection({ title: '导入元数据采访', tags: ['采访'], selections: [selection({ startSeconds: 4, endSeconds: 6 })] })
    store.saveTagMetadata({ tag: '海边', color: '#000000', note: '旧备注' })

    const result = store.importTagMetadata([
      { tag: '海边', parentTag: '项目', color: '#AABBCC', textColor: '#101010', note: '新备注', isFavorite: true, updatedAt: 0 },
      { tag: '采访', parentTag: '', color: '', textColor: '', note: '采访备注', isFavorite: false, updatedAt: 0 },
      { tag: '不存在', parentTag: '', color: '', textColor: '', note: '跳过', isFavorite: true, updatedAt: 0 }
    ])

    expect(result).toMatchObject({ importedCount: 2, skippedCount: 1 })
    expect(store.getTagMetadata('海边')).toMatchObject({ parentTag: '项目', color: '#aabbcc', textColor: '#101010', note: '新备注', isFavorite: true })
    expect(store.getTagMetadata('采访')).toMatchObject({ note: '采访备注' })
    expect(store.getTagMetadata('不存在')).toBeNull()
    expect(store.getCollection(source.id)?.tags).toEqual(['海边', '项目'])
    expect(store.getLastTagOperation()).toMatchObject({ type: 'metadata' })

    expect(store.undoLastTagOperation().success).toBe(true)
    expect(store.getTagMetadata('海边')).toMatchObject({ color: '#000000', note: '旧备注' })
    expect(store.getTagMetadata('采访')).toBeNull()
  })

  it('rejects imported parent metadata that creates a cycle', () => {
    store.saveCollection({ title: '导入环路项目', tags: ['项目'], selections: [selection()] })
    store.saveCollection({ title: '导入环路海边', tags: ['海边'], selections: [selection({ startSeconds: 4, endSeconds: 6 })] })

    expect(() => store.importTagMetadata([
      { tag: '项目', parentTag: '海边', color: '', textColor: '', note: '', isFavorite: false, updatedAt: 0 },
      { tag: '海边', parentTag: '项目', color: '', textColor: '', note: '', isFavorite: false, updatedAt: 0 }
    ])).toThrow('环路')
    expect(store.listTagMetadata()).toEqual([])
  })

  it('rejects a tag parent assignment that closes a hierarchy cycle', () => {
    store.saveCollection({ title: '层级项目', tags: ['项目'], selections: [selection()] })
    store.saveCollection({ title: '层级访谈', tags: ['访谈'], selections: [selection({ startSeconds: 4, endSeconds: 6 })] })
    store.saveCollection({ title: '层级海边', tags: ['海边'], selections: [selection({ startSeconds: 7, endSeconds: 9 })] })
    store.saveTagMetadata({ tag: '项目' })
    store.saveTagMetadata({ tag: '访谈', parentTag: '项目' })
    store.saveTagMetadata({ tag: '海边', parentTag: '访谈' })

    expect(() => store.saveTagMetadata({ tag: '项目', parentTag: '海边' })).toThrow('环路')
    expect(store.getTagMetadata('项目')).toMatchObject({ parentTag: '' })
  })

  it('cleans tag metadata and releases child parent references', () => {
    const parent = store.saveCollection({ title: '父标签', tags: ['父'], selections: [selection()] })
    store.saveCollection({ title: '子标签', tags: ['子'], selections: [selection({ startSeconds: 4, endSeconds: 6 })] })
    store.saveTagMetadata({ tag: parent.tags[0]!, color: '#123456' })
    store.saveTagMetadata({ tag: '子', parentTag: '父', color: '#654321' })

    store.removeTagFromAllCollections('父')
    expect(store.getTagMetadata('父')).toBeNull()
    expect(store.getTagMetadata('子')).toMatchObject({ tag: '子', parentTag: '' })
  })

  it('undoes cleanup and restores tags plus metadata from a SQLite snapshot', () => {
    const parent = store.saveCollection({ title: '撤销父标签', tags: ['父'], selections: [selection()] })
    const child = store.saveCollection({ title: '撤销子标签', tags: ['子'], selections: [selection({ startSeconds: 4, endSeconds: 6 })] })
    store.saveTagMetadata({ tag: '父', color: '#123456' })
    store.saveTagMetadata({ tag: '子', parentTag: '父', color: '#654321' })

    store.removeTagFromAllCollections('父')
    expect(store.getLastTagOperation()).toMatchObject({ type: 'cleanup' })
    const undone = store.undoLastTagOperation()

    expect(undone).toMatchObject({ success: true, operation: expect.objectContaining({ type: 'cleanup' }) })
    expect(store.getCollection(parent.id)?.tags).toEqual(['父'])
    expect(store.getCollection(child.id)?.tags).toEqual(['子'])
    expect(store.getTagMetadata('父')).toMatchObject({ color: '#123456' })
    expect(store.getTagMetadata('子')).toMatchObject({ parentTag: '父', color: '#654321' })
    expect(store.getLastTagOperation()).toMatchObject({ type: 'metadata' })
  })

  it('redoes tag cleanup with metadata after restarting the store', () => {
    const parent = store.saveCollection({ title: '重做父标签', tags: ['父'], selections: [selection()] })
    const child = store.saveCollection({ title: '重做子标签', tags: ['子'], selections: [selection({ startSeconds: 4, endSeconds: 6 })] })
    store.saveTagMetadata({ tag: '父', color: '#123456' })
    store.saveTagMetadata({ tag: '子', parentTag: '父', color: '#654321' })

    store.removeTagFromAllCollections('父')
    expect(store.getCollection(parent.id)?.tags).toEqual([])
    expect(store.getTagMetadata('父')).toBeNull()

    const undone = store.undoLastTagOperation()
    expect(undone.success).toBe(true)
    expect(store.getLastTagRedoOperation()).toMatchObject({ type: 'cleanup' })
    expect(store.getCollection(parent.id)?.tags).toEqual(['父'])
    expect(store.getCollection(child.id)?.tags).toEqual(['子'])
    expect(store.getTagMetadata('父')).toMatchObject({ color: '#123456' })
    expect(store.getTagMetadata('子')).toMatchObject({ parentTag: '父', color: '#654321' })

    store.close()
    store = new ClipInboxStore(tempDirectory)
    expect(store.getLastTagRedoOperation()).toMatchObject({ type: 'cleanup' })

    const redone = store.redoLastTagOperation()
    expect(redone).toMatchObject({ success: true, operation: expect.objectContaining({ type: 'cleanup' }) })
    expect(store.getCollection(parent.id)?.tags).toEqual([])
    expect(store.getCollection(child.id)?.tags).toEqual(['子'])
    expect(store.getTagMetadata('父')).toBeNull()
    expect(store.getTagMetadata('子')).toMatchObject({ parentTag: '', color: '#654321' })
    expect(store.getLastTagRedoOperation()).toBeNull()
  })

  it('lists tag operation history in write order with undo and redo status', () => {
    const collection = store.saveCollection({ title: '标签历史', tags: ['海边'], selections: [selection()] })
    store.saveTagMetadata({ tag: '海边', color: '#123456' })
    store.updateCollectionsTags([collection.id], ['精选'], 'add')

    expect(store.listTagOperationHistory()).toMatchObject([
      { type: 'batch', status: 'active', undoneAt: null },
      { type: 'metadata', status: 'active', undoneAt: null }
    ])

    expect(store.undoLastTagOperation().success).toBe(true)
    const history = store.listTagOperationHistory()
    expect(history[0]).toMatchObject({ type: 'batch', status: 'redoable', undoneAt: expect.any(Number) })
    expect(history[1]).toMatchObject({ type: 'metadata', status: 'active', undoneAt: null })

    store.close()
    store = new ClipInboxStore(tempDirectory)
    expect(store.listTagOperationHistory()[0]).toMatchObject({ type: 'batch', status: 'redoable' })
  })

  it('paginates retained tag history and returns a safe single-operation detail', () => {
    const collection = store.saveCollection({ title: '标签历史分页', tags: ['分页标签'], selections: [selection()] })
    store.saveTagMetadata({ tag: '分页标签', color: '#123456' })
    for (let index = 0; index < 24; index += 1) store.saveTagMetadata({ tag: '分页标签', note: `第 ${index} 次` })

    const firstPage = store.listTagOperationHistoryPage({ limit: 20 })
    const secondPage = store.listTagOperationHistoryPage({ offset: 20, limit: 20 })
    expect(firstPage.entries).toHaveLength(20)
    expect(firstPage.total).toBe(25)
    expect(firstPage.hasMore).toBe(true)
    expect(secondPage.entries).toHaveLength(5)
    expect(secondPage.hasMore).toBe(false)
    expect(store.listTagOperationHistory()).toHaveLength(20)

    const detail = store.getTagOperationHistoryDetail(firstPage.entries[0]?.id)
    expect(detail).toMatchObject({ id: firstPage.entries[0]?.id, type: 'metadata', collectionCount: 0, metadataCount: 1 })
    expect(store.getTagOperationHistoryDetail('missing')).toBeNull()
    expect(collection.id).toBeTruthy()
  })

  it('clears a tag redo branch when a new tag operation is recorded', () => {
    const collection = store.saveCollection({ title: '重做分支', tags: ['父'], selections: [selection()] })

    store.removeTagFromAllCollections('父')
    expect(store.undoLastTagOperation().success).toBe(true)
    expect(store.getLastTagRedoOperation()).toMatchObject({ type: 'cleanup' })

    store.updateCollectionsTags([collection.id], ['新标签'], 'add')
    expect(store.getLastTagOperation()).toMatchObject({ type: 'batch' })
    expect(store.getLastTagRedoOperation()).toBeNull()
    expect(store.redoLastTagOperation()).toMatchObject({ success: false, message: '没有可重做的标签操作' })
  })

  it('undoes tag rename and metadata updates in reverse chronological order', () => {
    const source = store.saveCollection({ title: '撤销重命名', tags: ['海边'], selections: [selection()] })
    store.saveTagMetadata({ tag: '海边', color: '#aabbcc' })
    store.renameTagAcrossCollections('海边', '访谈')
    expect(store.getLastTagOperation()).toMatchObject({ type: 'rename' })

    const renamedUndo = store.undoLastTagOperation()
    expect(renamedUndo.success).toBe(true)
    expect(store.getCollection(source.id)?.tags).toEqual(['海边'])
    expect(store.getTagMetadata('海边')).toMatchObject({ color: '#aabbcc' })
    expect(store.getTagMetadata('访谈')).toBeNull()

    const metadata = store.saveTagMetadata({ tag: '海边', color: '#112233' })
    expect(metadata.color).toBe('#112233')
    expect(store.getLastTagOperation()).toMatchObject({ type: 'metadata' })
    expect(store.undoLastTagOperation().success).toBe(true)
    expect(store.getTagMetadata('海边')).toMatchObject({ color: '#aabbcc' })
  })

  it('duplicates a collection with a new id and independent content', () => {
    const original = store.saveCollection({ title: '待复制', tags: ['旅行'], sortMode: 'duration-desc', selections: [selection()] })
    const duplicate = store.duplicateCollection(original.id)

    expect(duplicate).toMatchObject({ title: '待复制 · 副本', tags: ['旅行'], sortMode: 'duration-desc' })
    expect(duplicate?.id).not.toBe(original.id)
    expect(duplicate?.selections).toEqual(original.selections)

    store.saveCollection({ id: duplicate!.id, title: '副本已修改', selections: [selection({ startSeconds: 5, endSeconds: 7 })] })
    expect(store.getCollection(original.id)).toEqual(original)
    expect(store.getCollection(duplicate!.id)?.title).toBe('副本已修改')
    expect(store.duplicateCollection('not-found')).toBeNull()
  })

  it('duplicates several collections and reports missing ids', () => {
    const first = store.saveCollection({ title: '批量一', selections: [selection({ startSeconds: 1, endSeconds: 2 })] })
    const second = store.saveCollection({ title: '批量二', selections: [selection({ startSeconds: 3, endSeconds: 4 })] })

    const result = store.duplicateCollections([first.id, ` ${second.id} `, first.id, 'missing'])

    expect(result.collections.map((collection) => collection.title)).toEqual(['批量一 · 副本', '批量二 · 副本'])
    expect(result.collections.map((collection) => collection.id)).not.toContain(first.id)
    expect(result.skippedCount).toBe(1)
    expect(store.listCollections()).toHaveLength(4)
  })

  it('records batch duplicates and restores the same copies through undo and redo', () => {
    const first = store.saveCollection({ title: '可逆复制一', tags: ['旅行'], selections: [selection({ startSeconds: 1, endSeconds: 2 })] })
    const second = store.saveCollection({ title: '可逆复制二', isArchived: true, selections: [selection({ startSeconds: 4, endSeconds: 6 })] })

    const result = store.duplicateCollections([first.id, second.id])
    const duplicateIds = result.collections.map((collection) => collection.id)
    expect(store.getLastCollectionOperation()).toMatchObject({ type: 'duplicate' })
    expect(result.collections.map((collection) => collection.title)).toEqual(['可逆复制一 · 副本', '可逆复制二 · 副本'])

    const undone = store.undoLastCollectionOperation()
    expect(undone).toMatchObject({ success: true, operation: expect.objectContaining({ type: 'duplicate' }), deletedCollectionIds: duplicateIds })
    expect(duplicateIds.every((id) => store.getCollection(id) === null)).toBe(true)
    expect(store.getCollection(first.id)).toEqual(first)
    expect(store.getCollection(second.id)).toEqual(second)

    const redone = store.redoLastCollectionOperation()
    expect(redone).toMatchObject({ success: true, operation: expect.objectContaining({ type: 'duplicate' }), createdCollectionIds: duplicateIds })
    expect(redone.collections).toEqual(result.collections)
  })

  it('refuses to undo a batch duplicate after a copied collection was edited', () => {
    const original = store.saveCollection({ title: '复制冲突源', selections: [selection()] })
    const result = store.duplicateCollections([original.id])
    const duplicate = result.collections[0]
    expect(duplicate).toBeDefined()
    store.saveCollection({ id: duplicate!.id, title: '复制后被编辑', selections: duplicate!.selections })

    const undone = store.undoLastCollectionOperation()
    expect(undone.success).toBe(false)
    expect(store.getCollection(duplicate!.id)?.title).toBe('复制后被编辑')
    expect(store.getLastCollectionOperation()).toMatchObject({ type: 'duplicate' })
  })

  it('merges several collections into a new collection and keeps the originals', () => {
    const first = store.saveCollection({ title: '合并一', tags: ['海边'], selections: [selection({ startSeconds: 1, endSeconds: 3, evidenceIds: ['merge-one'] })] })
    const second = store.saveCollection({ title: '合并二', tags: ['精选', '海边'], selections: [selection({ startSeconds: 3.4, endSeconds: 5, evidenceIds: ['merge-two'] })] })

    const result = store.mergeCollections([first.id, second.id, 'missing'], '合并结果', 'duration-desc')

    expect(result).toMatchObject({ sourceIds: [first.id, second.id], skippedCount: 1 })
    expect(result.collection).toMatchObject({ title: '合并结果', tags: ['海边', '精选'], sortMode: 'duration-desc', isFavorite: false, isArchived: false })
    expect(result.collection.selections).toHaveLength(1)
    expect(result.collection.selections[0]).toMatchObject({ startSeconds: 1, endSeconds: 5, evidenceIds: ['merge-one', 'merge-two'] })
    expect(store.listCollections().map((collection) => collection.id)).toEqual(expect.arrayContaining([result.collection.id, second.id, first.id]))
    expect(store.getCollection(first.id)).toEqual(first)
    expect(store.getCollection(second.id)).toEqual(second)
  })

  it('merges only the source ranges selected by the preview', () => {
    const firstSelection = selection({ startSeconds: 1, endSeconds: 3 })
    const secondSelection = selection({ startSeconds: 4, endSeconds: 6, evidenceIds: ['merge-skip'] })
    const first = store.saveCollection({ title: '筛选一', selections: [firstSelection, secondSelection] })
    const second = store.saveCollection({ title: '筛选二', selections: [selection({ startSeconds: 7, endSeconds: 9 })] })

    const result = store.mergeCollections([first.id, second.id], '筛选结果', 'source-time', [
      { collectionId: first.id, selectionKeys: [getVisionClipSelectionMergeKey(firstSelection)], rangeOverrides: [{ selectionKey: getVisionClipSelectionMergeKey(firstSelection), startSeconds: 1.5, endSeconds: 2.5 }] },
      { collectionId: second.id, selectionKeys: [] }
    ])

    expect(result.collection.selections).toHaveLength(1)
    expect(result.collection.selections[0]).toMatchObject({ startSeconds: 1.5, endSeconds: 2.5 })
    expect(result.collection.selections[0]?.evidenceIds).not.toContain('merge-skip')
    expect(store.getCollection(first.id)?.selections).toHaveLength(2)
    expect(store.getCollection(second.id)?.selections).toHaveLength(1)
  })

  it('rejects batch merge when fewer than two collections exist', () => {
    const first = store.saveCollection({ title: '只有一个', selections: [selection()] })

    expect(() => store.mergeCollections([first.id, 'missing'], '不能合并')).toThrow('至少需要两个不同的选段集合')
    expect(store.listCollections()).toHaveLength(1)
  })
})
