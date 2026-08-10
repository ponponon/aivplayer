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
    expect(updated).toMatchObject({ id: saved.id, name: '海边对话', query: '海边对话', mode: 'visual', createdAt: saved.createdAt })
    await first.flush()

    const second = new VisionSavedSearchStore(directory)
    expect(second.list()).toEqual([updated])
    expect(await readFile(getVisionSavedSearchesPath(directory), 'utf8')).toContain('海边对话')
    expect(second.delete('missing')).toBe(false)
    expect(second.delete(updated.id)).toBe(true)
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
})
