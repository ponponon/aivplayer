import { mkdirSync, readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { VisionIndexFailureRecord } from '../../shared/vision-types'
import { beginVisionIndexFailureRetry, beginVisionIndexFailureRetryBatch, createVisionIndexFailureId, normalizeVisionIndexFailure, normalizeVisionIndexFailureManifest, recordVisionIndexFailure, VISION_INDEX_FAILURE_SCHEMA_VERSION, type VisionIndexFailureInput } from './vision-index-failure'

export function getVisionIndexFailureStorePath(userDataPath: string): string {
  return join(userDataPath, 'library', 'vision-index-failures.json')
}

export class VisionIndexFailureStore {
  private readonly manifestPath: string
  private records: VisionIndexFailureRecord[]
  private writeChain: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    this.manifestPath = getVisionIndexFailureStorePath(userDataPath)
    mkdirSync(dirname(this.manifestPath), { recursive: true })
    try {
      this.records = normalizeVisionIndexFailureManifest(JSON.parse(readFileSync(this.manifestPath, 'utf8'))).records
    } catch {
      this.records = []
    }
  }

  list(): VisionIndexFailureRecord[] {
    return this.records.map((record) => ({ ...record }))
  }

  get(id: string): VisionIndexFailureRecord | null {
    const record = this.records.find((candidate) => candidate.id === id)
    return record ? { ...record } : null
  }

  recordFailure(input: VisionIndexFailureInput): VisionIndexFailureRecord | null {
    const nextRecords = recordVisionIndexFailure(this.records, input)
    const record = nextRecords.find((candidate) => candidate.id === createVisionIndexFailureId(input.mediaPath))
    this.records = nextRecords
    this.persist()
    return record ? { ...record } : null
  }

  beginRetry(id: string): VisionIndexFailureRecord | null {
    const next = beginVisionIndexFailureRetry(this.records, id)
    if (!next) return null
    this.records = [next, ...this.records.filter((record) => record.id !== id)]
    this.persist()
    return { ...next }
  }

  beginRetryBatch(ids: readonly string[]): VisionIndexFailureRecord[] | null {
    const nextRecords = beginVisionIndexFailureRetryBatch(this.records, ids)
    if (!nextRecords) return null
    this.records = nextRecords
    this.persist()
    const selectedIds = new Set(ids.map((id) => id.trim()))
    return this.list().filter((record) => selectedIds.has(record.id))
  }

  clear(mediaPath: string): boolean {
    const normalizedPath = normalizeVisionIndexFailure({ mediaPath, error: '' })
    if (!normalizedPath) return false
    const nextRecords = this.records.filter((record) => record.id !== normalizedPath.id)
    if (nextRecords.length === this.records.length) return false
    this.records = nextRecords
    this.persist()
    return true
  }

  async flush(): Promise<void> {
    await this.writeChain
  }

  private persist(): void {
    const manifest = { schemaVersion: VISION_INDEX_FAILURE_SCHEMA_VERSION, records: this.records }
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.manifestPath), { recursive: true })
      const temporaryPath = `${this.manifestPath}.${process.pid}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.manifestPath)
    }).catch(() => undefined)
  }
}
