import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { VisionEvidenceType, VisionSavedSearch, VisionSavedSearchInput, VisionSearchMode } from '../../shared/vision-types'

const SCHEMA_VERSION = 1
const MAX_SAVED_SEARCHES = 100
const MAX_NAME_LENGTH = 80
const MAX_QUERY_LENGTH = 400
const EVIDENCE_TYPES: readonly VisionEvidenceType[] = ['subtitle', 'visual', 'scene', 'ocr', 'entity', 'speaker']

type SavedSearchManifest = {
  schemaVersion: number
  searches: VisionSavedSearch[]
}

export type VisionSavedSearchImportResult = {
  importedCount: number
  skippedCount: number
}

export function getVisionSavedSearchesPath(userDataPath: string): string {
  return join(userDataPath, 'library', 'vision-saved-searches.json')
}

function normalizeMode(value: unknown): VisionSearchMode {
  return value === 'visual' ? 'visual' : 'hybrid'
}

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeEvidenceTypes(value: unknown): VisionEvidenceType[] {
  if (!Array.isArray(value)) return []
  const selected = new Set(value.filter((item): item is VisionEvidenceType => typeof item === 'string' && EVIDENCE_TYPES.includes(item as VisionEvidenceType)))
  return EVIDENCE_TYPES.filter((item) => selected.has(item))
}

function normalizeSavedSearch(value: unknown, fallbackTimestamp = Date.now()): VisionSavedSearch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<VisionSavedSearch>
  const id = normalizeText(raw.id, 120)
  const name = normalizeText(raw.name, MAX_NAME_LENGTH)
  const query = normalizeText(raw.query, MAX_QUERY_LENGTH)
  if (!id || !name || !query) return null
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : fallbackTimestamp
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt
  return { id, name, query, mode: normalizeMode(raw.mode), evidenceTypes: normalizeEvidenceTypes(raw.evidenceTypes), createdAt, updatedAt }
}

function cloneSavedSearch(search: VisionSavedSearch): VisionSavedSearch {
  return { ...search, evidenceTypes: [...search.evidenceTypes] }
}

function queryKey(search: Pick<VisionSavedSearch, 'query' | 'mode' | 'evidenceTypes'>): string {
  return `${search.mode}\0${search.query.toLocaleLowerCase()}\0${search.evidenceTypes.join(',')}`
}

function normalizeManifest(value: unknown): VisionSavedSearch[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const raw = value as Partial<SavedSearchManifest>
  if (raw.schemaVersion !== SCHEMA_VERSION || !Array.isArray(raw.searches)) return []
  const seenIds = new Set<string>()
  const seenQueries = new Set<string>()
  return raw.searches
    .map((item) => normalizeSavedSearch(item))
    .filter((item): item is VisionSavedSearch => {
      if (!item || seenIds.has(item.id) || seenQueries.has(queryKey(item))) return false
      seenIds.add(item.id)
      seenQueries.add(queryKey(item))
      return true
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_SAVED_SEARCHES)
}

export class VisionSavedSearchStore {
  private readonly manifestPath: string
  private searches: VisionSavedSearch[]
  private writeChain: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    this.manifestPath = getVisionSavedSearchesPath(userDataPath)
    mkdirSync(dirname(this.manifestPath), { recursive: true })
    try {
      this.searches = normalizeManifest(JSON.parse(readFileSync(this.manifestPath, 'utf8')))
    } catch {
      this.searches = []
    }
  }

  list(): VisionSavedSearch[] {
    return this.searches.map(cloneSavedSearch)
  }

  exportManifest(): SavedSearchManifest {
    return { schemaVersion: SCHEMA_VERSION, searches: this.list() }
  }

  importManifest(value: unknown): VisionSavedSearchImportResult {
    if (!value || typeof value !== 'object' || Array.isArray(value) || (value as Partial<SavedSearchManifest>).schemaVersion !== SCHEMA_VERSION || !Array.isArray((value as Partial<SavedSearchManifest>).searches)) {
      throw new Error('搜索配置格式无效')
    }
    const imported = normalizeManifest(value)
    const seenIds = new Set(this.searches.map((search) => search.id))
    const seenQueries = new Set(this.searches.map(queryKey))
    const next = [...this.searches]
    let importedCount = 0
    let skippedCount = 0
    for (const search of imported) {
      const key = queryKey(search)
      if (seenQueries.has(key) || next.length >= MAX_SAVED_SEARCHES) {
        skippedCount += 1
        continue
      }
      const id = seenIds.has(search.id) ? randomUUID() : search.id
      next.push({ ...search, id })
      seenIds.add(id)
      seenQueries.add(key)
      importedCount += 1
    }
    if (importedCount > 0) {
      this.searches = normalizeManifest({ schemaVersion: SCHEMA_VERSION, searches: next })
      this.persist()
    }
    return { importedCount, skippedCount }
  }

  save(input: VisionSavedSearchInput): VisionSavedSearch {
    const name = normalizeText(input?.name, MAX_NAME_LENGTH)
    const query = normalizeText(input?.query, MAX_QUERY_LENGTH)
    if (!name || !query) throw new Error('保存搜索需要名称和查询内容')
    const mode = normalizeMode(input?.mode)
    const evidenceTypes = normalizeEvidenceTypes(input?.evidenceTypes)
    const existing = typeof input?.id === 'string' ? this.searches.find((item) => item.id === input.id?.trim()) : undefined
    const duplicate = this.searches.find((item) => item.id !== existing?.id && queryKey(item) === queryKey({ query, mode, evidenceTypes }))
    if (duplicate) return cloneSavedSearch(duplicate)
    const now = Date.now()
    const next: VisionSavedSearch = {
      id: existing?.id ?? randomUUID(),
      name,
      query,
      mode,
      evidenceTypes,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    this.searches = normalizeManifest({ schemaVersion: SCHEMA_VERSION, searches: [next, ...this.searches.filter((item) => item.id !== next.id)] })
    this.persist()
    return cloneSavedSearch(next)
  }

  delete(id: string): boolean {
    const normalizedId = normalizeText(id, 120)
    const next = this.searches.filter((item) => item.id !== normalizedId)
    if (next.length === this.searches.length) return false
    this.searches = next
    this.persist()
    return true
  }

  async flush(): Promise<void> {
    await this.writeChain
  }

  private persist(): void {
    const serialized = JSON.stringify({ schemaVersion: SCHEMA_VERSION, searches: this.searches }, null, 2)
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.manifestPath), { recursive: true })
      const temporaryPath = `${this.manifestPath}.${process.pid}.tmp`
      await writeFile(temporaryPath, `${serialized}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.manifestPath)
    }).catch(() => undefined)
  }
}
