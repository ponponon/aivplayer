import type { VisionEvidenceType, VisionSearchSortMode } from '../../shared/vision-types'

export const VISION_SEARCH_PREFERENCES_STORAGE_KEY = 'aivplayer.vision-search-preferences.v1'
export const VISION_SEARCH_PREFERENCES_SCHEMA_VERSION = 1

const VISION_EVIDENCE_TYPES: readonly VisionEvidenceType[] = ['visual', 'subtitle', 'ocr', 'scene', 'entity', 'object', 'speaker']

export type VisionSearchPreferences = {
  schemaVersion: typeof VISION_SEARCH_PREFERENCES_SCHEMA_VERSION
  sortMode: VisionSearchSortMode
  evidenceTypes: VisionEvidenceType[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeSortMode(value: unknown): VisionSearchSortMode {
  return value === 'source-time' || value === 'file-name' ? value : 'relevance'
}

function normalizeEvidenceTypes(value: unknown): VisionEvidenceType[] {
  if (!Array.isArray(value)) return []
  const selected = new Set(value.filter((item): item is VisionEvidenceType => typeof item === 'string' && VISION_EVIDENCE_TYPES.includes(item as VisionEvidenceType)))
  return VISION_EVIDENCE_TYPES.filter((evidenceType) => selected.has(evidenceType))
}

export function createDefaultVisionSearchPreferences(): VisionSearchPreferences {
  return { schemaVersion: VISION_SEARCH_PREFERENCES_SCHEMA_VERSION, sortMode: 'relevance', evidenceTypes: [] }
}

export function normalizeVisionSearchPreferences(value: unknown): VisionSearchPreferences {
  const input = isRecord(value) ? value : {}
  return {
    schemaVersion: VISION_SEARCH_PREFERENCES_SCHEMA_VERSION,
    sortMode: normalizeSortMode(input.sortMode),
    evidenceTypes: normalizeEvidenceTypes(input.evidenceTypes)
  }
}

export function parseVisionSearchPreferences(raw: string | null): VisionSearchPreferences {
  if (!raw) return createDefaultVisionSearchPreferences()
  try {
    return normalizeVisionSearchPreferences(JSON.parse(raw))
  } catch {
    return createDefaultVisionSearchPreferences()
  }
}

export function serializeVisionSearchPreferences(preferences: VisionSearchPreferences): string {
  return JSON.stringify(normalizeVisionSearchPreferences(preferences))
}
