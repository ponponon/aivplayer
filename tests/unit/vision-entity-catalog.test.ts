import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyVisionEntityCatalogToResults, createDefaultVisionEntityCatalog, createVisionEntityCatalogEntry, getVisionEntityCatalogSearchQueries, getVisionEntityLabelsFromCatalog, normalizeVisionEntityCatalog, updateVisionEntityCatalog, updateVisionEntityCatalogBatch } from '../../src/core/ai/vision-entity-catalog'
import { VisionEntityCatalogStore } from '../../src/core/ai/vision-entity-catalog-store'
import type { VisionSearchResult } from '../../src/shared/vision-types'

function entityResult(labelId: string, matchedText = '人物 / person'): VisionSearchResult {
  return {
    id: `evidence-${labelId}`,
    videoPath: '/media/demo.mp4',
    fileName: 'demo.mp4',
    timestampSeconds: 2,
    thumbnailPath: '/thumb/demo.jpg',
    score: 0.8,
    matchedText,
    evidenceId: `evidence-${labelId}`,
    evidenceType: 'entity',
    entityLabelId: labelId,
    modelId: 'siglip2-zero-shot-labels',
    modelVariant: 'label-v1'
  }
}

describe('vision entity catalog', () => {
  it('keeps model ids stable while applying local names and aliases', () => {
    const initial = createDefaultVisionEntityCatalog(1)
    const renamed = updateVisionEntityCatalog(initial, { labelId: 'person', name: '演员', aliases: ['人像', '演员'] }, 2)

    expect(renamed.entries.find((entry) => entry.labelId === 'person')).toMatchObject({ labelId: 'person', defaultName: '人物 / person', name: '演员', aliases: ['人像'] })
    expect(getVisionEntityCatalogSearchQueries('人像', renamed)).toEqual(['人物 / person'])
    expect(normalizeVisionEntityCatalog(renamed, 3).entries.find((entry) => entry.labelId === 'person')?.name).toBe('演员')
  })

  it('creates custom labels with bounded queries and exposes model-ready label definitions', () => {
    const initial = createDefaultVisionEntityCatalog(1)
    const custom = createVisionEntityCatalogEntry(initial, { name: '海边', query: 'a beach scene', aliases: ['海滩'] }, 2)
    const entry = custom.entries.find((candidate) => candidate.kind === 'custom')

    expect(entry).toMatchObject({ kind: 'custom', defaultName: '海边', name: '海边', query: 'a beach scene', aliases: ['海滩'], hidden: false })
    expect(entry?.labelId).toMatch(/^custom-[a-f0-9]{12}$/)
    expect(getVisionEntityLabelsFromCatalog(custom).find((label) => label.id === entry?.labelId)).toMatchObject({ query: 'a beach scene', displayName: '海边' })
    expect(createVisionEntityCatalogEntry(custom, { name: '海边', query: 'another query' }, 3)).toEqual(custom)
    expect(createVisionEntityCatalogEntry(custom, { name: '没有查询', query: ' ' }, 3)).toEqual(custom)
  })

  it('filters hidden labels and renders merged labels with the target name', () => {
    const initial = createDefaultVisionEntityCatalog(1)
    const merged = updateVisionEntityCatalog(initial, { labelId: 'person', mergedInto: 'animal' }, 2)
    const hidden = updateVisionEntityCatalog(merged, { labelId: 'vehicle', hidden: true }, 3)
    const results = applyVisionEntityCatalogToResults([
      entityResult('person'),
      entityResult('vehicle', '车辆 / vehicle'),
      { ...entityResult('city', '城市 / city'), evidenceType: 'entity' }
    ], hidden)

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ entityLabelId: 'animal', matchedText: '动物 / animal' })
    expect(results[1]).toMatchObject({ entityLabelId: 'city', matchedText: '城市 / city' })
  })

  it('breaks invalid merge cycles instead of persisting an unsafe graph', () => {
    const catalog = normalizeVisionEntityCatalog({ entries: [
      { labelId: 'person', mergedInto: 'animal' },
      { labelId: 'animal', mergedInto: 'person' }
    ] }, 4)

    expect(catalog.entries.find((entry) => entry.labelId === 'person')?.mergedInto).toBeNull()
    expect(catalog.entries.find((entry) => entry.labelId === 'animal')?.mergedInto).toBeNull()
  })

  it('applies hide, show, and merge to a selected batch without changing model labels', () => {
    const initial = createDefaultVisionEntityCatalog(1)
    const hidden = updateVisionEntityCatalogBatch(initial, { labelIds: ['person', 'vehicle'], action: 'hide' }, 2)
    expect(hidden.entries.filter((entry) => entry.hidden).map((entry) => entry.labelId)).toEqual(['person', 'vehicle'])

    const shown = updateVisionEntityCatalogBatch(hidden, { labelIds: ['person'], action: 'show' }, 3)
    expect(shown.entries.find((entry) => entry.labelId === 'person')).toMatchObject({ hidden: false, defaultName: '人物 / person' })

    const merged = updateVisionEntityCatalogBatch(shown, { labelIds: ['person', 'vehicle'], action: 'merge', mergedInto: 'animal' }, 4)
    expect(merged.entries.find((entry) => entry.labelId === 'person')?.mergedInto).toBe('animal')
    expect(merged.entries.find((entry) => entry.labelId === 'vehicle')?.mergedInto).toBe('animal')
  })

  it('rejects a batch that would create a self-merge or touch unknown labels', () => {
    const initial = createDefaultVisionEntityCatalog(1)
    expect(updateVisionEntityCatalogBatch(initial, { labelIds: ['person'], action: 'merge', mergedInto: 'person' }, 2)).toEqual(initial)
    expect(updateVisionEntityCatalogBatch(initial, { labelIds: ['missing'], action: 'hide' }, 2)).toEqual(initial)

    const linked = updateVisionEntityCatalog(initial, { labelId: 'animal', mergedInto: 'vehicle' }, 2)
    expect(updateVisionEntityCatalogBatch(linked, { labelIds: ['vehicle'], action: 'merge', mergedInto: 'animal' }, 3)).toEqual(linked)
  })

  it('persists catalog updates atomically and restores them after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-entity-catalog-'))
    try {
      const store = new VisionEntityCatalogStore(directory)
      store.update({ labelId: 'vehicle', name: '汽车', aliases: ['轿车'] })
      store.updateBatch({ labelIds: ['person', 'vehicle'], action: 'hide' })
      store.create({ name: '海边', query: 'a beach scene', aliases: ['海滩'] })
      await store.flush()

      const restored = new VisionEntityCatalogStore(directory).get()
      expect(restored.updatedAt).toBeGreaterThan(0)
      expect(restored.entries.find((entry) => entry.labelId === 'vehicle')).toMatchObject({ name: '汽车', aliases: ['轿车'] })
      expect(restored.entries.find((entry) => entry.labelId === 'person')?.hidden).toBe(true)
      expect(restored.entries.find((entry) => entry.kind === 'custom')).toMatchObject({ name: '海边', query: 'a beach scene' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
