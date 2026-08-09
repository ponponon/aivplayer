import { createHash } from 'node:crypto'
import type { VisionSearchResult } from '../../shared/vision-types'
import { VISION_ENTITY_CATALOG_SCHEMA_VERSION, type VisionEntityCatalog, type VisionEntityCatalogBatchPatch, type VisionEntityCatalogCreateInput, type VisionEntityCatalogEntry, type VisionEntityCatalogPatch } from '../../shared/vision-entity-types'
import { DEFAULT_VISION_ENTITY_LABELS, getVisionEntityLabelIdForDisplayName } from './vision-entity-evidence'

const MAX_NAME_LENGTH = 80
const MAX_QUERY_LENGTH = 160
const MAX_ALIAS_LENGTH = 60
const MAX_ALIASES = 12
const MAX_ENTRIES = 100

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ')
}

function safeString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback
  const result = value.trim().slice(0, maxLength)
  return result || fallback
}

function safeAliases(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) return []
  const nameKey = normalized(name)
  const aliases: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const alias = item.trim().slice(0, MAX_ALIAS_LENGTH)
    const key = normalized(alias)
    if (!key || key === nameKey || seen.has(key)) continue
    seen.add(key)
    aliases.push(alias)
    if (aliases.length >= MAX_ALIASES) break
  }
  return aliases
}

function cloneEntry(entry: VisionEntityCatalogEntry): VisionEntityCatalogEntry {
  return { ...entry, aliases: [...entry.aliases] }
}

function cloneCatalog(catalog: VisionEntityCatalog): VisionEntityCatalog {
  return { ...catalog, entries: catalog.entries.map(cloneEntry) }
}

function defaultEntry(labelId: string, defaultName: string, query: string, kind: VisionEntityCatalogEntry['kind'] = 'builtin'): VisionEntityCatalogEntry {
  return { labelId, kind, defaultName, name: defaultName, query, aliases: [], hidden: false, mergedInto: null }
}

export function createDefaultVisionEntityCatalog(updatedAt = Date.now()): VisionEntityCatalog {
  return {
    schemaVersion: VISION_ENTITY_CATALOG_SCHEMA_VERSION,
    updatedAt,
    entries: DEFAULT_VISION_ENTITY_LABELS.map((label) => defaultEntry(label.id, label.displayName, label.query))
  }
}

function rawEntries(value: unknown): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const raw = value as { entries?: unknown }
  return Array.isArray(raw.entries) ? raw.entries : []
}

/** Restores a safe catalog while retaining the stable model label ids. */
export function normalizeVisionEntityCatalog(value: unknown, updatedAt = Date.now()): VisionEntityCatalog {
  const base = createDefaultVisionEntityCatalog(updatedAt)
  const persistedUpdatedAt = value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { updatedAt?: unknown }).updatedAt === 'number'
    ? (value as { updatedAt: number }).updatedAt
    : updatedAt
  const defaults = new Map(base.entries.map((entry) => [entry.labelId, entry]))
  const entries = new Map<string, VisionEntityCatalogEntry>(base.entries.map((entry) => [entry.labelId, entry]))
  for (const item of rawEntries(value)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const raw = item as Partial<VisionEntityCatalogEntry>
    if (typeof raw.labelId !== 'string' || !raw.labelId.trim()) continue
    const labelId = raw.labelId.trim().slice(0, 80)
    const fallback = defaults.get(labelId) ?? defaultEntry(labelId, safeString(raw.defaultName, labelId, MAX_NAME_LENGTH), safeString(raw.query, raw.defaultName ?? labelId, MAX_QUERY_LENGTH), 'custom')
    const name = safeString(raw.name, fallback.defaultName, MAX_NAME_LENGTH)
    const kind = raw.kind === 'custom' || fallback.kind === 'custom' ? 'custom' : 'builtin'
    const query = safeString(raw.query, fallback.query || fallback.defaultName, MAX_QUERY_LENGTH)
    entries.set(labelId, {
      labelId,
      kind,
      defaultName: safeString(raw.defaultName, fallback.defaultName, MAX_NAME_LENGTH),
      name,
      query,
      aliases: safeAliases(raw.aliases, name),
      hidden: raw.hidden === true,
      mergedInto: typeof raw.mergedInto === 'string' && raw.mergedInto.trim() ? raw.mergedInto.trim().slice(0, 80) : null
    })
  }
  const normalizedEntries = [...entries.values()].slice(0, MAX_ENTRIES)
  const validIds = new Set(normalizedEntries.map((entry) => entry.labelId))
  const catalog: VisionEntityCatalog = {
    schemaVersion: VISION_ENTITY_CATALOG_SCHEMA_VERSION,
    updatedAt: Number.isFinite(persistedUpdatedAt) ? persistedUpdatedAt : Date.now(),
    entries: normalizedEntries.map((entry) => ({
      ...entry,
      mergedInto: entry.mergedInto && validIds.has(entry.mergedInto) && entry.mergedInto !== entry.labelId ? entry.mergedInto : null
    }))
  }
  for (const entry of catalog.entries) {
    const path = new Set<string>()
    let current: string | null = entry.labelId
    while (current) {
      if (path.has(current)) {
        for (const candidate of catalog.entries) {
          if (path.has(candidate.labelId)) candidate.mergedInto = null
        }
        break
      }
      path.add(current)
      current = catalog.entries.find((candidate) => candidate.labelId === current)?.mergedInto ?? null
    }
  }
  return catalog
}

function hasNameConflict(catalog: VisionEntityCatalog, name: string): boolean {
  const key = normalized(name)
  return catalog.entries.some((entry) => [entry.name, entry.defaultName, ...entry.aliases].some((candidate) => normalized(candidate) === key))
}

function createCustomLabelId(catalog: VisionEntityCatalog, name: string, query: string): string {
  const base = `custom-${createHash('sha1').update(`${normalized(name)}\0${normalized(query)}`).digest('hex').slice(0, 12)}`
  let id = base
  let suffix = 2
  while (catalog.entries.some((entry) => entry.labelId === id)) id = `${base}-${suffix++}`
  return id
}

export function createVisionEntityCatalogEntry(catalog: VisionEntityCatalog, input: VisionEntityCatalogCreateInput, updatedAt = Date.now()): VisionEntityCatalog {
  const current = cloneCatalog(catalog)
  if (!input || current.entries.length >= MAX_ENTRIES) return current
  const name = safeString(input.name, '', MAX_NAME_LENGTH)
  const query = safeString(input.query, '', MAX_QUERY_LENGTH)
  if (!name || !query || hasNameConflict(current, name)) return current
  current.entries.push({
    labelId: createCustomLabelId(current, name, query),
    kind: 'custom',
    defaultName: name,
    name,
    query,
    aliases: safeAliases(input.aliases, name),
    hidden: false,
    mergedInto: null
  })
  return normalizeVisionEntityCatalog({ entries: current.entries }, updatedAt)
}

export function getVisionEntityLabelsFromCatalog(catalog: VisionEntityCatalog): Array<{ id: string; query: string; displayName: string }> {
  return catalog.entries.map((entry) => ({ id: entry.labelId, query: entry.query, displayName: entry.defaultName }))
}

export function resolveVisionEntityLabelId(catalog: VisionEntityCatalog, labelId: string): string | null {
  const entries = new Map(catalog.entries.map((entry) => [entry.labelId, entry]))
  let current = labelId.trim()
  const visited = new Set<string>()
  while (current && !visited.has(current)) {
    visited.add(current)
    const entry = entries.get(current)
    if (!entry) return null
    if (!entry.mergedInto) return current
    current = entry.mergedInto
  }
  return null
}

export function getVisionEntityCatalogEntry(catalog: VisionEntityCatalog, labelId: string): VisionEntityCatalogEntry | null {
  const resolved = resolveVisionEntityLabelId(catalog, labelId)
  return resolved ? catalog.entries.find((entry) => entry.labelId === resolved) ?? null : null
}

export function updateVisionEntityCatalog(catalog: VisionEntityCatalog, patch: VisionEntityCatalogPatch, updatedAt = Date.now()): VisionEntityCatalog {
  const current = cloneCatalog(catalog)
  if (!patch || typeof patch.labelId !== 'string') return current
  const labelId = patch.labelId.trim()
  const index = current.entries.findIndex((entry) => entry.labelId === labelId)
  if (index < 0) return current
  const entry = current.entries[index]
  const name = patch.name === undefined ? entry.name : safeString(patch.name, entry.defaultName, MAX_NAME_LENGTH)
  const mergedInto = patch.mergedInto === undefined
    ? entry.mergedInto
    : typeof patch.mergedInto === 'string' ? patch.mergedInto.trim() || null : null
  const next: VisionEntityCatalogEntry = {
    ...entry,
    name,
    aliases: patch.aliases === undefined ? [...entry.aliases] : safeAliases(patch.aliases, name),
    hidden: patch.hidden === undefined ? entry.hidden : patch.hidden === true,
    mergedInto
  }
  if (next.mergedInto === entry.labelId || (next.mergedInto && !current.entries.some((candidate) => candidate.labelId === next.mergedInto))) next.mergedInto = null
  current.entries[index] = next
  const normalizedCatalog = normalizeVisionEntityCatalog({ entries: current.entries }, updatedAt)
  const updatedEntry = normalizedCatalog.entries.find((candidate) => candidate.labelId === entry.labelId)
  if (updatedEntry?.mergedInto && resolveVisionEntityLabelId(normalizedCatalog, entry.labelId) === null) updatedEntry.mergedInto = null
  return normalizedCatalog
}

export function updateVisionEntityCatalogBatch(catalog: VisionEntityCatalog, patch: VisionEntityCatalogBatchPatch, updatedAt = Date.now()): VisionEntityCatalog {
  const current = cloneCatalog(catalog)
  if (!patch || !Array.isArray(patch.labelIds) || patch.labelIds.length === 0) return current
  if (patch.action !== 'hide' && patch.action !== 'show' && patch.action !== 'merge') return current
  const labelIds = [...new Set(patch.labelIds.filter((labelId): labelId is string => typeof labelId === 'string').map((labelId) => labelId.trim()).filter(Boolean))]
  const entriesById = new Map(current.entries.map((entry) => [entry.labelId, entry]))
  if (labelIds.length === 0 || labelIds.some((labelId) => !entriesById.has(labelId))) return current
  if (patch.action === 'merge') {
    const mergedInto = typeof patch.mergedInto === 'string' ? patch.mergedInto.trim() : ''
    if (!mergedInto || !entriesById.has(mergedInto) || labelIds.includes(mergedInto)) return current
    const selectedIds = new Set(labelIds)
    const visited = new Set<string>()
    let target: string | null = mergedInto
    while (target) {
      if (selectedIds.has(target) || visited.has(target)) return current
      visited.add(target)
      target = entriesById.get(target)?.mergedInto ?? null
    }
    for (const labelId of labelIds) {
      const entry = entriesById.get(labelId)
      if (entry) entry.mergedInto = mergedInto
    }
  } else {
    for (const labelId of labelIds) {
      const entry = entriesById.get(labelId)
      if (entry) entry.hidden = patch.action === 'hide'
    }
  }
  return normalizeVisionEntityCatalog({ entries: current.entries }, updatedAt)
}

export function getVisionEntityCatalogSearchQueries(query: string, catalog: VisionEntityCatalog): string[] {
  const key = normalized(query)
  if (!key) return []
  const queries: string[] = []
  for (const entry of catalog.entries) {
    const terms = [entry.name, entry.defaultName, ...entry.aliases]
    if (!terms.some((term) => normalized(term) === key)) continue
    const resolved = resolveVisionEntityLabelId(catalog, entry.labelId)
    const target = resolved ? catalog.entries.find((candidate) => candidate.labelId === resolved) : null
    if (target && !target.hidden && !queries.includes(target.defaultName)) queries.push(target.defaultName)
  }
  return queries
}

export function applyVisionEntityCatalogToResults(results: readonly VisionSearchResult[], catalog: VisionEntityCatalog): VisionSearchResult[] {
  return results.flatMap((result) => {
    if (result.evidenceType !== 'entity') return [result]
    const labelId = result.entityLabelId ?? getVisionEntityLabelIdForDisplayName(result.matchedText ?? '')
    if (!labelId) return [result]
    const entry = getVisionEntityCatalogEntry(catalog, labelId)
    if (!entry || entry.hidden) return []
    return [{ ...result, entityLabelId: entry.labelId, matchedText: entry.name }]
  })
}
