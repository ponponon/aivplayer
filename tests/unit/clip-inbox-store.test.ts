import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClipInboxStore } from '../../src/core/ai/clip-inbox-store'
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

  it('deletes a collection and rejects empty collections', () => {
    expect(() => store.saveCollection({ title: '空集合', selections: [] })).toThrow('至少需要一个有效选段')
    const saved = store.saveCollection({ title: '待删除', selections: [selection()] })
    expect(store.deleteCollection(saved.id)).toBe(true)
    expect(store.deleteCollection(saved.id)).toBe(false)
    expect(store.listCollections()).toEqual([])
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
    const sourceMetadata = store.saveTagMetadata({ tag: '海边', parentTag: '采访', color: '#AABBCC', textColor: '#101010' })
    const targetMetadata = store.saveTagMetadata({ tag: '访谈', color: '#112233' })

    expect(sourceMetadata).toMatchObject({ tag: '海边', parentTag: '采访', color: '#aabbcc', textColor: '#101010' })
    expect(targetMetadata).toMatchObject({ tag: '访谈', color: '#112233', textColor: '' })
    const renamed = store.renameTagAcrossCollections('海边', '访谈')
    expect(renamed.collections.map((collection) => collection.id)).toEqual([source.id])
    expect(store.getTagMetadata('海边')).toBeNull()
    expect(store.getTagMetadata('访谈')).toMatchObject({ tag: '访谈', color: '#112233', textColor: '#101010' })

    store.close()
    store = new ClipInboxStore(tempDirectory)
    expect(store.listTagMetadata()).toEqual([expect.objectContaining({ tag: '访谈', color: '#112233', textColor: '#101010' })])
    expect(store.getCollection(target.id)?.tags).toEqual(['访谈'])
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
})
