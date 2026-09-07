import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { VisionLibrarySource } from '../../shared/vision-types'
import { normalizeMediaContentHash } from '../../shared/media-content-hash'

const CACHE_SCHEMA_VERSION = 1
const MAX_CACHE_ENTRIES = 10_000

type VisionDuplicateMediaHashCacheEntry = {
  sizeBytes: number
  mtimeMs: number
  contentHash: string
  lastVerifiedAt: number
}

function cachePathKey(filePath: string): string {
  const normalized = resolve(filePath)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function parseEntry(value: unknown): VisionDuplicateMediaHashCacheEntry | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const contentHash = normalizeMediaContentHash(record.contentHash)
  const sizeBytes = record.sizeBytes
  const mtimeMs = record.mtimeMs
  const lastVerifiedAt = record.lastVerifiedAt
  if (!contentHash || typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes < 0 || typeof mtimeMs !== 'number' || !Number.isFinite(mtimeMs) || typeof lastVerifiedAt !== 'number' || !Number.isFinite(lastVerifiedAt)) return null
  return { sizeBytes, mtimeMs, contentHash, lastVerifiedAt }
}

/** Small local cache for exact media identities; file metadata invalidates an entry before it is reused. */
export class VisionDuplicateMediaHashCache {
  private readonly entries = new Map<string, VisionDuplicateMediaHashCacheEntry>()
  private loaded = false

  constructor(private readonly manifestPath: string) {}

  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const parsed = JSON.parse(await readFile(this.manifestPath, 'utf8')) as Record<string, unknown>
      if (parsed.schemaVersion !== CACHE_SCHEMA_VERSION || !parsed.entries || typeof parsed.entries !== 'object') return
      for (const [path, value] of Object.entries(parsed.entries)) {
        const entry = parseEntry(value)
        if (entry) this.entries.set(cachePathKey(path), entry)
      }
    } catch {
      this.entries.clear()
    }
  }

  get(source: VisionLibrarySource): string | undefined {
    const entry = this.entries.get(cachePathKey(source.videoPath))
    if (!entry || entry.sizeBytes !== source.fileSizeBytes || entry.mtimeMs !== source.fileMtimeMs) return undefined
    entry.lastVerifiedAt = Date.now()
    return entry.contentHash
  }

  set(source: VisionLibrarySource, contentHash: string): void {
    const normalizedHash = normalizeMediaContentHash(contentHash)
    if (!normalizedHash) return
    this.entries.set(cachePathKey(source.videoPath), {
      sizeBytes: Math.max(0, source.fileSizeBytes),
      mtimeMs: source.fileMtimeMs,
      contentHash: normalizedHash,
      lastVerifiedAt: Date.now()
    })
  }

  async flush(): Promise<void> {
    const entries = [...this.entries.entries()]
      .sort(([, left], [, right]) => right.lastVerifiedAt - left.lastVerifiedAt)
      .slice(0, MAX_CACHE_ENTRIES)
    this.entries.clear()
    for (const [path, entry] of entries) this.entries.set(path, entry)
    const serialized = JSON.stringify({ schemaVersion: CACHE_SCHEMA_VERSION, entries: Object.fromEntries(entries) }, null, 2)
    const targetPath = resolve(this.manifestPath)
    await mkdir(dirname(targetPath), { recursive: true })
    const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
    try {
      await writeFile(temporaryPath, `${serialized}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, targetPath)
    } catch (error) {
      await rename(temporaryPath, `${temporaryPath}.failed`).catch(() => undefined)
      throw error
    }
  }
}
