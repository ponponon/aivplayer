import type { VisionSearchResult } from '../../shared/vision-types'
import {
  SPEAKER_DIARIZATION_CATALOG_SCHEMA_VERSION,
  type SpeakerDiarizationCatalog,
  type SpeakerDiarizationCatalogEntry,
  type SpeakerDiarizationCatalogPatch,
  type SpeakerDiarizationCatalogSource
} from '../../shared/speaker-diarization-catalog-types'

const MAX_SOURCES = 500
const MAX_SPEAKERS_PER_SOURCE = 32
const MAX_NAME_LENGTH = 80
const MAX_ALIAS_LENGTH = 60
const MAX_ALIASES = 12

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ')
}

function defaultSpeakerName(speakerId: number): string {
  const displayId = speakerId + 1
  return `说话人 ${displayId} / Speaker ${displayId}`
}

export function getDefaultSpeakerName(speakerId: number): string {
  return Number.isInteger(speakerId) && speakerId >= 0 ? defaultSpeakerName(speakerId) : '说话人'
}

function safeName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  return value.trim().slice(0, MAX_NAME_LENGTH) || fallback
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

function cloneEntry(entry: SpeakerDiarizationCatalogEntry): SpeakerDiarizationCatalogEntry {
  return { ...entry, aliases: [...entry.aliases] }
}

function cloneSource(source: SpeakerDiarizationCatalogSource): SpeakerDiarizationCatalogSource {
  return { ...source, entries: source.entries.map(cloneEntry) }
}

function cloneCatalog(catalog: SpeakerDiarizationCatalog): SpeakerDiarizationCatalog {
  return { ...catalog, sources: catalog.sources.map(cloneSource) }
}

function validSpeakerId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MAX_SPEAKERS_PER_SOURCE
}

function rawSources(value: unknown): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const raw = value as { sources?: unknown }
  return Array.isArray(raw.sources) ? raw.sources : []
}

function normalizeEntry(value: unknown): SpeakerDiarizationCatalogEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<SpeakerDiarizationCatalogEntry>
  if (!validSpeakerId(raw.speakerId)) return null
  const name = safeName(raw.name, getDefaultSpeakerName(raw.speakerId))
  return { speakerId: raw.speakerId, name, aliases: safeAliases(raw.aliases, name) }
}

function normalizeSource(value: unknown): SpeakerDiarizationCatalogSource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<SpeakerDiarizationCatalogSource>
  const sourceFingerprint = typeof raw.sourceFingerprint === 'string' ? raw.sourceFingerprint.trim().slice(0, 4000) : ''
  if (!sourceFingerprint) return null
  const entries = Array.isArray(raw.entries)
    ? raw.entries.map(normalizeEntry).filter((entry): entry is SpeakerDiarizationCatalogEntry => entry !== null)
    : []
  const uniqueEntries = [...new Map(entries.map((entry) => [entry.speakerId, entry])).values()].slice(0, MAX_SPEAKERS_PER_SOURCE)
  return {
    sourceFingerprint,
    videoPath: typeof raw.videoPath === 'string' ? raw.videoPath.trim() : '',
    fileName: typeof raw.fileName === 'string' ? raw.fileName.trim().slice(0, 255) : '',
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
    entries: uniqueEntries
  }
}

export function createDefaultSpeakerDiarizationCatalog(updatedAt = Date.now()): SpeakerDiarizationCatalog {
  return { schemaVersion: SPEAKER_DIARIZATION_CATALOG_SCHEMA_VERSION, updatedAt, sources: [] }
}

export function normalizeSpeakerDiarizationCatalog(value: unknown, updatedAt = Date.now()): SpeakerDiarizationCatalog {
  const persistedUpdatedAt = value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { updatedAt?: unknown }).updatedAt === 'number'
    ? (value as { updatedAt: number }).updatedAt
    : updatedAt
  const sources = rawSources(value)
    .map(normalizeSource)
    .filter((source): source is SpeakerDiarizationCatalogSource => source !== null)
  return {
    schemaVersion: SPEAKER_DIARIZATION_CATALOG_SCHEMA_VERSION,
    updatedAt: Number.isFinite(persistedUpdatedAt) ? persistedUpdatedAt : updatedAt,
    sources: [...new Map(sources.map((source) => [source.sourceFingerprint, source])).values()].slice(0, MAX_SOURCES)
  }
}

function hasNameConflict(source: SpeakerDiarizationCatalogSource, name: string, speakerId: number): boolean {
  const key = normalized(name)
  return source.entries.some((entry) => entry.speakerId !== speakerId && [entry.name, ...entry.aliases].some((candidate) => normalized(candidate) === key))
}

export function updateSpeakerDiarizationCatalog(catalog: SpeakerDiarizationCatalog, patch: SpeakerDiarizationCatalogPatch, updatedAt = Date.now()): SpeakerDiarizationCatalog {
  if (!patch || typeof patch.sourceFingerprint !== 'string' || !patch.sourceFingerprint.trim() || !validSpeakerId(patch.speakerId)) return cloneCatalog(catalog)
  const current = cloneCatalog(catalog)
  let source = current.sources.find((candidate) => candidate.sourceFingerprint === patch.sourceFingerprint.trim())
  if (!source) {
    if (current.sources.length >= MAX_SOURCES) return current
    source = { sourceFingerprint: patch.sourceFingerprint.trim().slice(0, 4000), videoPath: patch.videoPath.trim(), fileName: patch.fileName.trim().slice(0, 255), updatedAt, entries: [] }
    current.sources.push(source)
  }
  const name = safeName(patch.name, getDefaultSpeakerName(patch.speakerId))
  if (hasNameConflict(source, name, patch.speakerId)) return current
  const nextEntry: SpeakerDiarizationCatalogEntry = { speakerId: patch.speakerId, name, aliases: safeAliases(patch.aliases, name) }
  const index = source.entries.findIndex((entry) => entry.speakerId === patch.speakerId)
  if (index >= 0) source.entries[index] = nextEntry
  else source.entries.push(nextEntry)
  source.updatedAt = updatedAt
  current.updatedAt = updatedAt
  return normalizeSpeakerDiarizationCatalog(current, updatedAt)
}

export function getSpeakerDiarizationCatalogEntry(catalog: SpeakerDiarizationCatalog, sourceFingerprint: string, speakerId: number): SpeakerDiarizationCatalogEntry | null {
  return catalog.sources.find((source) => source.sourceFingerprint === sourceFingerprint.trim())?.entries.find((entry) => entry.speakerId === speakerId) ?? null
}

function speakerIdFromEvidenceText(text: string): number | null {
  const match = text.match(/(?:说话人|speaker|話者|화자)\s*(\d+)/i)
  if (!match) return null
  const displayId = Number(match[1])
  return Number.isInteger(displayId) && displayId > 0 ? displayId - 1 : null
}

export function getSpeakerDiarizationCatalogSearchQueries(query: string, catalog: SpeakerDiarizationCatalog): string[] {
  const key = normalized(query)
  if (!key) return []
  const queries: string[] = []
  for (const source of catalog.sources) {
    for (const entry of source.entries) {
      if ([entry.name, ...entry.aliases].some((candidate) => normalized(candidate) === key)) {
        const canonical = getDefaultSpeakerName(entry.speakerId)
        if (!queries.includes(canonical)) queries.push(canonical)
      }
    }
  }
  return queries
}

export function applySpeakerDiarizationCatalogToResults(results: readonly VisionSearchResult[], catalog: SpeakerDiarizationCatalog): VisionSearchResult[] {
  return results.map((result) => {
    if (result.evidenceType !== 'speaker' || !result.sourceFingerprint || !result.matchedText) return result
    const speakerId = speakerIdFromEvidenceText(result.matchedText)
    if (speakerId === null) return result
    const entry = getSpeakerDiarizationCatalogEntry(catalog, result.sourceFingerprint, speakerId)
    return entry ? { ...result, matchedText: entry.name } : result
  })
}
