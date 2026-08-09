import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MediaImportInboxStore, getMediaImportInboxItemId, getMediaImportInboxSidecarPath, mergeMediaImportInboxItems, transitionMediaImportInboxBatch } from '../../src/core/media/media-import-inbox'
import { scanMediaImportInbox } from '../../src/core/media/media-import-inbox-scan'
import type { MediaImportInboxFile } from '../../src/shared/media-import-inbox'

function createFile(path: string, sizeBytes: number, mtimeMs = 1_700_000_000_000): MediaImportInboxFile {
  return {
    path,
    fileName: path.split(/[\\/]/u).pop() ?? path,
    directoryPath: path.slice(0, Math.max(0, path.lastIndexOf('/'))),
    sizeBytes,
    mtimeMs
  }
}

describe('media import inbox', () => {
  it('scans complete videos recursively and skips hidden or temporary files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-media-inbox-scan-'))
    try {
      await mkdir(join(directory, 'nested'))
      await mkdir(join(directory, '.hidden'))
      await writeFile(join(directory, 'movie.mp4'), 'video')
      await writeFile(join(directory, 'movie.mp4.part'), 'partial')
      await writeFile(join(directory, '.hidden.mp4'), 'hidden')
      await writeFile(join(directory, '.hidden', 'secret.mp4'), 'hidden')
      await writeFile(join(directory, 'nested', 'episode.mkv'), 'video')
      await writeFile(join(directory, 'cover.jpg'), 'image')

      const progress = [] as string[]
      const result = await scanMediaImportInbox({
        directories: [directory],
        recursive: true,
        signal: new AbortController().signal,
        onProgress: (next) => progress.push(next.status)
      })

      expect(result.files.map((file) => file.fileName)).toEqual(['movie.mp4', 'episode.mkv'])
      expect(result.discoveredVideos).toBe(2)
      expect(result.failedDirectories).toBe(0)
      expect(progress.at(-1)).toBe('completed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('deduplicates by path, marks missing files, and resets changed versions', () => {
    const path = '/tmp/import-inbox/movie.mp4'
    const first = mergeMediaImportInboxItems([], [createFile(path, 10)], [], 100)
    expect(first).toHaveLength(1)
    expect(first[0].id).toBe(getMediaImportInboxItemId(path))

    const ignored = { ...first[0], status: 'ignored' as const, updatedAt: 110 }
    const unchanged = mergeMediaImportInboxItems([ignored], [createFile(path, 10)], ['/tmp/import-inbox'], 120)
    expect(unchanged[0].status).toBe('ignored')
    expect(unchanged[0].updatedAt).toBe(110)

    const changed = mergeMediaImportInboxItems(unchanged, [createFile(path, 11, 1_700_000_000_001)], ['/tmp/import-inbox'], 130)
    expect(changed[0].status).toBe('discovered')
    expect(changed[0].sizeBytes).toBe(11)
    expect(changed[0].lastError).toBeUndefined()

    const missing = mergeMediaImportInboxItems(changed, [], ['/tmp/import-inbox'], 140)
    expect(missing[0].status).toBe('missing')
  })

  it('persists transitions atomically and restores status after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-media-inbox-store-'))
    try {
      const file = createFile(join(directory, 'movie.mp4'), 20)
      const store = new MediaImportInboxStore(directory)
      const [item] = store.reconcile([file], [directory], 100)
      expect(store.transition(item.id, 'queued', undefined, 110)?.status).toBe('queued')
      expect(store.transition(item.id, 'ignored', undefined, 120)).toBeNull()
      await store.persist()

      const restored = new MediaImportInboxStore(directory)
      expect(restored.listItems()).toMatchObject([{ id: item.id, status: 'queued', sizeBytes: 20 }])
      expect(restored.transition(item.id, 'failed', '索引失败', 130)?.lastError).toBe('索引失败')
      expect(restored.transition(item.id, 'queued', undefined, 140)?.status).toBe('queued')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('applies queue, ignore, and retry batches atomically', () => {
    const first = mergeMediaImportInboxItems([], [
      createFile('/tmp/import-inbox/one.mp4', 10),
      createFile('/tmp/import-inbox/two.mp4', 20),
      createFile('/tmp/import-inbox/three.mp4', 30)
    ], [], 100)
    const queued = transitionMediaImportInboxBatch(first, [first[0].id, first[1].id], 'queue', 110)
    expect(queued?.filter((item) => item.status === 'queued')).toHaveLength(2)

    const ignored = transitionMediaImportInboxBatch(first, [first[0].id, first[1].id], 'ignore', 120)
    expect(ignored?.filter((item) => item.status === 'ignored')).toHaveLength(2)

    const failed = first.map((item, index) => index === 0 ? { ...item, status: 'failed' as const, lastError: '索引失败' } : item)
    const retried = transitionMediaImportInboxBatch(failed, [failed[0].id], 'retry', 130)
    expect(retried?.[0].status).toBe('queued')
    expect(retried?.[0].lastError).toBeUndefined()

    expect(transitionMediaImportInboxBatch(first, [first[0].id, 'unknown'], 'queue', 140)).toBeNull()
    expect(first.every((item) => item.status === 'discovered')).toBe(true)
  })

  it('clears only ignored or missing records as one atomic batch', () => {
    const first = mergeMediaImportInboxItems([], [
      createFile('/tmp/import-inbox/ignored.mp4', 10),
      createFile('/tmp/import-inbox/missing.mp4', 20),
      createFile('/tmp/import-inbox/discovered.mp4', 30)
    ], [], 100)
    const terminal = first.map((item, index) => index === 0 ? { ...item, status: 'ignored' as const } : index === 1 ? { ...item, status: 'missing' as const } : item)
    const cleared = transitionMediaImportInboxBatch(terminal, [terminal[0].id, terminal[1].id], 'clear', 110)

    expect(cleared?.map((item) => item.id)).toEqual([terminal[2].id])
    expect(transitionMediaImportInboxBatch(terminal, [terminal[2].id], 'clear', 110)).toBeNull()
    expect(transitionMediaImportInboxBatch(terminal, [terminal[0].id, 'unknown'], 'clear', 110)).toBeNull()
    expect(terminal).toHaveLength(3)
  })

  it('persists a batch once and returns selected items', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-media-inbox-batch-'))
    try {
      const store = new MediaImportInboxStore(directory)
      const items = store.reconcile([
        createFile(join(directory, 'one.mp4'), 10),
        createFile(join(directory, 'two.mp4'), 20)
      ], [directory], 100)
      const changed = store.transitionBatch(items.map((item) => item.id), 'queue', 110)
      expect(changed?.map((item) => item.status)).toEqual(['queued', 'queued'])
      await store.persist()
      const restored = new MediaImportInboxStore(directory)
      expect(restored.listItems().every((item) => item.status === 'queued')).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('removes cleared records from the persisted manifest without touching media files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-media-inbox-clear-'))
    try {
      const store = new MediaImportInboxStore(directory)
      const items = store.reconcile([
        createFile(join(directory, 'ignored.mp4'), 10),
        createFile(join(directory, 'ready.mp4'), 20)
      ], [directory], 100)
      expect(store.transition(items[0].id, 'ignored', undefined, 110)?.status).toBe('ignored')
      const cleared = store.transitionBatch([items[0].id], 'clear', 120)
      expect(cleared?.[0]?.id).toBe(items[0].id)
      await store.persist()
      const restored = new MediaImportInboxStore(directory)
      expect(restored.listItems().map((item) => item.fileName)).toEqual(['ready.mp4'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('writes metadata to a hidden sidecar and hydrates external edits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-media-inbox-meta-'))
    try {
      const file = createFile(join(directory, 'movie.mp4'), 20)
      const store = new MediaImportInboxStore(directory)
      const [item] = store.reconcile([file], [directory], 100)
      const updated = await store.updateMetadata(item.id, { tags: ['素材', '素材'], favorite: true, note: '重点', source: '本地导入' }, true, 110)
      expect(updated?.metadata).toEqual({ tags: ['素材'], favorite: true, note: '重点', source: '本地导入', projectId: null })
      const sidecarPath = getMediaImportInboxSidecarPath(file.path)
      const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8')) as { mediaId: string; metadata: Record<string, unknown> }
      expect(sidecar.mediaId).toBe(item.id)
      expect(sidecar.metadata.favorite).toBe(true)

      await writeFile(sidecarPath, `${JSON.stringify({ schemaVersion: 1, mediaId: item.id, fileName: file.fileName, updatedAt: 120, metadata: { tags: ['外部标签'], favorite: false, note: '外部修改' } })}\n`)
      const restored = new MediaImportInboxStore(directory)
      restored.reconcile([file], [directory], 130)
      await restored.refreshSidecars([file.path])
      expect(restored.listItems()[0].metadata).toEqual({ tags: ['外部标签'], favorite: false, note: '外部修改', source: null, projectId: null })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
