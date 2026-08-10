import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getVisionSavedSearchesPath, VisionSavedSearchStore } from '../../src/core/ai/vision-saved-search-store'

describe('vision saved search store', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  })

  it('saves, updates, deduplicates and restores searches atomically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-saved-search-'))
    temporaryDirectories.push(directory)
    const first = new VisionSavedSearchStore(directory)
    const saved = first.save({ name: '海边说话', query: '有人在海边说话' })
    const duplicate = first.save({ name: '重复名称', query: '有人在海边说话', mode: 'hybrid' })
    expect(duplicate).toEqual(saved)
    const updated = first.save({ id: saved.id, name: '海边对话', query: '海边对话', mode: 'visual' })
    expect(updated).toMatchObject({ id: saved.id, name: '海边对话', query: '海边对话', mode: 'visual', evidenceTypes: [], createdAt: saved.createdAt })
    const filtered = first.save({ name: '字幕海边对话', query: '海边对话', mode: 'hybrid', evidenceTypes: ['ocr', 'object', 'subtitle'], objectDetectionFilter: { labelQuery: 'person', minimumScore: 0.75, categoryLabels: ['Person', 'chair'] } })
    expect(filtered.evidenceTypes).toEqual(['subtitle', 'ocr', 'object'])
    expect(filtered.objectDetectionFilter).toEqual({ labelQuery: 'person', minimumScore: 0.75, categoryLabels: ['Person', 'chair'] })
    expect(first.save({ name: '相同筛选', query: '海边对话', mode: 'hybrid', evidenceTypes: ['subtitle', 'ocr', 'object'], objectDetectionFilter: { labelQuery: 'person', minimumScore: 0.75, categoryLabels: ['Person', 'chair'] } })).toEqual(filtered)
    await first.flush()

    const second = new VisionSavedSearchStore(directory)
    expect(second.list()).toEqual([filtered, updated])
    expect(await readFile(getVisionSavedSearchesPath(directory), 'utf8')).toContain('海边对话')
    expect(second.delete('missing')).toBe(false)
    expect(second.delete(updated.id)).toBe(true)
    expect(second.list()).toEqual([filtered])
    expect(second.delete(filtered.id)).toBe(true)
    await second.flush()
    expect(new VisionSavedSearchStore(directory).list()).toEqual([])
  })

  it('rejects empty input and caps duplicate-free history', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-saved-search-'))
    temporaryDirectories.push(directory)
    const store = new VisionSavedSearchStore(directory)
    expect(() => store.save({ name: '', query: '海边' })).toThrow('名称和查询内容')
    expect(() => store.save({ name: '名称', query: '' })).toThrow('名称和查询内容')
    for (let index = 0; index < 105; index += 1) store.save({ name: `查询 ${index}`, query: `内容 ${index}` })
    expect(store.list()).toHaveLength(100)
    await store.flush()
  })

  it('exports only portable search data and merges imported searches safely', async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-saved-search-'))
    const targetDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-saved-search-'))
    temporaryDirectories.push(sourceDirectory, targetDirectory)
    const source = new VisionSavedSearchStore(sourceDirectory)
    source.save({ name: '海边字幕', query: '海边', mode: 'hybrid', evidenceTypes: ['subtitle'] })
    source.save({ name: '夜景画面', query: '夜景', mode: 'visual' })

    const manifest = source.exportManifest()
    await source.flush()
    expect(manifest.schemaVersion).toBe(1)
    expect(JSON.stringify(manifest)).not.toContain('videoPath')

    const target = new VisionSavedSearchStore(targetDirectory)
    target.save({ name: '已有搜索', query: '海边', mode: 'hybrid', evidenceTypes: ['subtitle'] })
    const result = target.importManifest(manifest)
    expect(result).toEqual({ importedCount: 1, skippedCount: 1 })
    expect(target.list().map((search) => search.name)).toEqual(['已有搜索', '夜景画面'])
    await target.flush()
    expect(() => target.importManifest({ schemaVersion: 2, searches: [] })).toThrow('格式无效')
  })

  it('normalizes object filters and keeps legacy searches compatible', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-saved-search-'))
    temporaryDirectories.push(directory)
    const store = new VisionSavedSearchStore(directory)
    const imported = store.importManifest({
      schemaVersion: 1,
      searches: [
        { id: 'legacy', name: '旧搜索', query: '海边', mode: 'hybrid', evidenceTypes: [] },
        { id: 'object', name: '物体搜索', query: '画面', mode: 'hybrid', evidenceTypes: ['object'], objectDetectionFilter: { labelQuery: '  person ', minimumScore: 2, categoryLabels: ['Person', 'person', 'chair'] } }
      ]
    })
    expect(imported).toEqual({ importedCount: 2, skippedCount: 0 })
    expect(store.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'legacy', query: '海边' }),
      expect.objectContaining({ id: 'object', objectDetectionFilter: { labelQuery: 'person', minimumScore: 1, categoryLabels: ['Person', 'chair'] } })
    ]))
    await store.flush()
  })
})
