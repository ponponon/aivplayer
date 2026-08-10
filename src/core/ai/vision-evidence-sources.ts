import { VISION_DERIVED_EVIDENCE_TYPES, type VisionDerivedEvidenceType, type VisionEvidenceClearTarget, type VisionEvidenceCounts, type VisionEvidenceSource } from '../../shared/vision-types'

export type VisionEvidenceSourceRow = {
  videoPath: unknown
  fileName: unknown
  evidenceType: unknown
  sourceFingerprint: unknown
  generatedAt: unknown
}

export function createEmptyVisionEvidenceCounts(): VisionEvidenceCounts {
  return { ocr: 0, scene: 0, entity: 0, speaker: 0 }
}

export function normalizeVisionDerivedEvidenceTypes(value: unknown, fallbackToAll = false): VisionDerivedEvidenceType[] {
  if (!Array.isArray(value)) return fallbackToAll ? [...VISION_DERIVED_EVIDENCE_TYPES] : []
  const selected = new Set(value.filter((item): item is VisionDerivedEvidenceType => typeof item === 'string' && VISION_DERIVED_EVIDENCE_TYPES.includes(item as VisionDerivedEvidenceType)))
  return VISION_DERIVED_EVIDENCE_TYPES.filter((item) => selected.has(item))
}

export function normalizeVisionEvidenceClearTargets(value: unknown): VisionEvidenceClearTarget[] {
  if (!Array.isArray(value)) return []
  const targets = new Map<string, Set<VisionDerivedEvidenceType>>()
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const raw = item as Partial<VisionEvidenceClearTarget>
    const videoPath = typeof raw.videoPath === 'string' ? raw.videoPath.trim() : ''
    const evidenceTypes = normalizeVisionDerivedEvidenceTypes(raw.evidenceTypes)
    if (!videoPath || evidenceTypes.length === 0) continue
    const selected = targets.get(videoPath) ?? new Set<VisionDerivedEvidenceType>()
    for (const evidenceType of evidenceTypes) selected.add(evidenceType)
    targets.set(videoPath, selected)
  }
  return [...targets.entries()].map(([videoPath, evidenceTypes]) => ({
    videoPath,
    evidenceTypes: VISION_DERIVED_EVIDENCE_TYPES.filter((evidenceType) => evidenceTypes.has(evidenceType))
  }))
}

export function aggregateVisionEvidenceSources(rows: readonly VisionEvidenceSourceRow[], evidenceTypes?: readonly VisionDerivedEvidenceType[]): VisionEvidenceSource[] {
  const allowed = new Set(normalizeVisionDerivedEvidenceTypes(evidenceTypes, true))
  const grouped = new Map<string, VisionEvidenceSource>()
  for (const row of rows) {
    const videoPath = typeof row.videoPath === 'string' ? row.videoPath.trim() : ''
    const evidenceType = typeof row.evidenceType === 'string' && VISION_DERIVED_EVIDENCE_TYPES.includes(row.evidenceType as VisionDerivedEvidenceType) ? row.evidenceType as VisionDerivedEvidenceType : null
    if (!videoPath || !evidenceType || !allowed.has(evidenceType)) continue
    const sourceFingerprint = typeof row.sourceFingerprint === 'string' ? row.sourceFingerprint.trim() : ''
    const key = `${videoPath}\0${sourceFingerprint}`
    const generatedAt = typeof row.generatedAt === 'number' && Number.isFinite(row.generatedAt) ? row.generatedAt : 0
    const current = grouped.get(key)
    if (current) {
      current.evidenceCounts[evidenceType] += 1
      current.generatedAt = Math.max(current.generatedAt, generatedAt)
      continue
    }
    grouped.set(key, {
      videoPath,
      fileName: typeof row.fileName === 'string' && row.fileName.trim() ? row.fileName.trim() : videoPath.split(/[\\/]/).pop() ?? videoPath,
      sourceFingerprint,
      evidenceCounts: { ...createEmptyVisionEvidenceCounts(), [evidenceType]: 1 },
      generatedAt
    })
  }
  return [...grouped.values()].sort((left, right) => right.generatedAt - left.generatedAt || left.fileName.localeCompare(right.fileName, undefined, { sensitivity: 'base', numeric: true }))
}

export function addVisionEvidenceCounts(target: VisionEvidenceCounts, source: VisionEvidenceCounts): void {
  for (const evidenceType of VISION_DERIVED_EVIDENCE_TYPES) target[evidenceType] += source[evidenceType]
}
