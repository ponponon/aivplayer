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
})
