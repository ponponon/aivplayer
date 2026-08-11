import { randomUUID } from 'node:crypto'
import type { VisionSearchPageKind, VisionSearchResult, VisionSearchResultPage } from '../../shared/vision-types'

export const VISION_SEARCH_SNAPSHOT_MAX_RESULTS = 100
export const VISION_SEARCH_SNAPSHOT_TTL_MS = 10 * 60 * 1000
export const VISION_SEARCH_SNAPSHOT_MAX_COUNT = 32

type VisionSearchSnapshot = {
  kind: VisionSearchPageKind
  results: VisionSearchResult[]
  createdAt: number
  lastAccessedAt: number
}

type VisionSearchCursorStoreOptions = {
  now?: () => number
  createToken?: () => string
  maxResults?: number
  ttlMs?: number
  maxCount?: number
}

function cloneResult(result: VisionSearchResult): VisionSearchResult {
  return { ...result, ...(result.box ? { box: { ...result.box } } : {}) }
}

function normalizeLimit(value: number, maxResults: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(maxResults, Math.floor(value)) : 24
}

function normalizeOffset(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export class VisionSearchCursorStore {
  private readonly snapshots = new Map<string, VisionSearchSnapshot>()
  private readonly now: () => number
  private readonly createToken: () => string
  private readonly maxResults: number
  private readonly ttlMs: number
  private readonly maxCount: number

  constructor(options: VisionSearchCursorStoreOptions = {}) {
    this.now = options.now ?? Date.now
    this.createToken = options.createToken ?? randomUUID
    this.maxResults = Math.max(1, Math.floor(options.maxResults ?? VISION_SEARCH_SNAPSHOT_MAX_RESULTS))
    this.ttlMs = Math.max(1, Math.floor(options.ttlMs ?? VISION_SEARCH_SNAPSHOT_TTL_MS))
    this.maxCount = Math.max(1, Math.floor(options.maxCount ?? VISION_SEARCH_SNAPSHOT_MAX_COUNT))
  }

  create(kind: VisionSearchPageKind, results: readonly VisionSearchResult[]): string {
    const now = this.now()
    this.prune(now)
    const token = this.createToken()
    this.snapshots.set(token, {
      kind,
      results: results.slice(0, this.maxResults).map(cloneResult),
      createdAt: now,
      lastAccessedAt: now
    })
    this.enforceCount()
    return token
  }

  createPage(kind: VisionSearchPageKind, results: readonly VisionSearchResult[], limit: number, offset = 0): VisionSearchResultPage {
    const normalizedResults = results.slice(0, this.maxResults).map(cloneResult)
    const normalizedLimit = normalizeLimit(limit, this.maxResults)
    const normalizedOffset = normalizeOffset(offset)
    const hasMore = normalizedOffset + normalizedLimit < normalizedResults.length
    const cursor = hasMore ? this.create(kind, normalizedResults) : undefined
    return this.toPage(normalizedResults, normalizedLimit, normalizedOffset, cursor)
  }

  readPage(kind: VisionSearchPageKind, cursor: string, limit: number, offset = 0): VisionSearchResultPage {
    const now = this.now()
    this.prune(now)
    const snapshot = this.snapshots.get(cursor)
    if (!snapshot || snapshot.kind !== kind) throw new Error('视觉搜索游标已过期或无效，请重新搜索')
    snapshot.lastAccessedAt = now
    const normalizedLimit = normalizeLimit(limit, this.maxResults)
    const normalizedOffset = normalizeOffset(offset)
    const nextCursor = normalizedOffset + normalizedLimit < snapshot.results.length ? cursor : undefined
    return this.toPage(snapshot.results, normalizedLimit, normalizedOffset, nextCursor)
  }

  size(): number {
    this.prune(this.now())
    return this.snapshots.size
  }

  private toPage(results: readonly VisionSearchResult[], limit: number, offset: number, cursor: string | undefined): VisionSearchResultPage {
    return {
      results: results.slice(offset, offset + limit).map(cloneResult),
      total: results.length,
      offset,
      limit,
      hasMore: offset + limit < results.length,
      ...(cursor ? { cursor } : {})
    }
  }

  private prune(now: number): void {
    for (const [cursor, snapshot] of this.snapshots) {
      if (now - snapshot.lastAccessedAt >= this.ttlMs) this.snapshots.delete(cursor)
    }
  }

  private enforceCount(): void {
    while (this.snapshots.size > this.maxCount) {
      const oldest = [...this.snapshots.entries()].sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt)[0]
      if (!oldest) return
      this.snapshots.delete(oldest[0])
    }
  }
}
