import { mkdirSync, readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { VisionSearchResult } from '../../shared/vision-types'
import type { VisionEntityCatalog, VisionEntityCatalogBatchPatch, VisionEntityCatalogPatch } from '../../shared/vision-entity-types'
import { applyVisionEntityCatalogToResults, createVisionEntityCatalogEntry, getVisionEntityCatalogSearchQueries, getVisionEntityLabelsFromCatalog, normalizeVisionEntityCatalog, updateVisionEntityCatalog, updateVisionEntityCatalogBatch } from './vision-entity-catalog'
import type { VisionEntityCatalogCreateInput } from '../../shared/vision-entity-types'

export function getVisionEntityCatalogPath(userDataPath: string): string {
  return join(userDataPath, 'library', 'vision-entity-catalog.json')
}

export class VisionEntityCatalogStore {
  private readonly catalogPath: string
  private catalog: VisionEntityCatalog
  private writeChain: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    this.catalogPath = getVisionEntityCatalogPath(userDataPath)
    mkdirSync(dirname(this.catalogPath), { recursive: true })
    try {
      this.catalog = normalizeVisionEntityCatalog(JSON.parse(readFileSync(this.catalogPath, 'utf8')))
    } catch {
      this.catalog = normalizeVisionEntityCatalog(null)
    }
  }

  get(): VisionEntityCatalog {
    return { ...this.catalog, entries: this.catalog.entries.map((entry) => ({ ...entry, aliases: [...entry.aliases] })) }
  }

  update(patch: VisionEntityCatalogPatch): VisionEntityCatalog {
    this.catalog = updateVisionEntityCatalog(this.catalog, patch)
    this.persist()
    return this.get()
  }

  create(input: VisionEntityCatalogCreateInput): VisionEntityCatalog {
    this.catalog = createVisionEntityCatalogEntry(this.catalog, input)
    this.persist()
    return this.get()
  }

  updateBatch(patch: VisionEntityCatalogBatchPatch): VisionEntityCatalog {
    this.catalog = updateVisionEntityCatalogBatch(this.catalog, patch)
    this.persist()
    return this.get()
  }

  private persist(): void {
    const serialized = JSON.stringify(this.catalog, null, 2)
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.catalogPath), { recursive: true })
      const temporaryPath = `${this.catalogPath}.${process.pid}.tmp`
      await writeFile(temporaryPath, `${serialized}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.catalogPath)
    }).catch(() => undefined)
  }

  applyResults(results: readonly VisionSearchResult[]): VisionSearchResult[] {
    return applyVisionEntityCatalogToResults(results, this.catalog)
  }

  getSearchQueries(query: string): string[] {
    return getVisionEntityCatalogSearchQueries(query, this.catalog)
  }

  getLabels(): Array<{ id: string; query: string; displayName: string }> {
    return getVisionEntityLabelsFromCatalog(this.catalog)
  }

  async flush(): Promise<void> {
    await this.writeChain
  }
}
