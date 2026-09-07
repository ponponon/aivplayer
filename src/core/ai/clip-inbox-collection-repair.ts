import type { VisionClipCollection } from '../../shared/vision-types'
import { createVisionSourceFingerprint } from './vision-evidence'

export type VisionClipCollectionRepairFile = {
  path: string
  name: string
  contentHash?: string
  fileSizeBytes?: number
  fileMtimeMs?: number
  durationSeconds?: number
}

export type VisionClipCollectionRepairMatchStatus = 'matched' | 'ambiguous' | 'unmatched'
export type VisionClipCollectionRepairMatchBasis = 'content-hash' | 'fingerprint' | 'name-duration' | 'name' | 'duration' | 'single'

export type VisionClipCollectionRepairMatch = {
  collectionId: string
  collectionTitle: string
  missingPath: string
  missingFileName: string
  replacementPath: string | null
  replacementFileName: string | null
  status: VisionClipCollectionRepairMatchStatus
  basis: VisionClipCollectionRepairMatchBasis | null
}

export type VisionClipCollectionRepairPlan = {
  matches: VisionClipCollectionRepairMatch[]
  matchedCount: number
  ambiguousCount: number
  unmatchedCount: number
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function getMissingSources(collection: VisionClipCollection, availablePaths: ReadonlySet<string>): Array<{ path: string; name: string; fingerprint: string; contentHash?: string; durationSeconds: number }> {
  const seen = new Set<string>()
  const missing: Array<{ path: string; name: string; fingerprint: string; contentHash?: string; durationSeconds: number }> = []
  for (const selection of collection.selections) {
    if (availablePaths.has(selection.videoPath) || seen.has(selection.videoPath)) continue
    seen.add(selection.videoPath)
    missing.push({ path: selection.videoPath, name: selection.fileName, fingerprint: selection.fingerprint, contentHash: selection.contentHash, durationSeconds: selection.durationSeconds })
  }
  return missing
}

function getContentHashCandidates(
  missing: { contentHash?: string },
  replacements: readonly VisionClipCollectionRepairFile[],
  usedReplacementPaths: ReadonlySet<string>
): VisionClipCollectionRepairFile[] {
  const expected = missing.contentHash?.trim().toLowerCase()
  if (!expected) return []
  return replacements.filter((file) => !usedReplacementPaths.has(file.path) && file.contentHash?.trim().toLowerCase() === expected)
}

function hasMatchingDuration(sourceDurationSeconds: number, candidateDurationSeconds: number | undefined): boolean {
  return candidateDurationSeconds !== undefined && Number.isFinite(candidateDurationSeconds) && Math.abs(candidateDurationSeconds - sourceDurationSeconds) <= 0.05
}

function getFingerprintCandidates(
  missing: { path: string; fingerprint: string },
  replacements: readonly VisionClipCollectionRepairFile[],
  usedReplacementPaths: ReadonlySet<string>
): VisionClipCollectionRepairFile[] {
  return replacements.filter((file) => {
    if (usedReplacementPaths.has(file.path) || file.fileSizeBytes === undefined || file.fileMtimeMs === undefined) return false
    return createVisionSourceFingerprint(missing.path, file.fileSizeBytes, file.fileMtimeMs) === missing.fingerprint
  })
}

/**
 * Builds a user-reviewable replacement plan without touching files or the collection store.
 * Candidates are matched by portable evidence first, then progressively weaker metadata.
 * A one-source/one-file selection remains the final fallback for manually reviewed input.
 */
export function createVisionClipCollectionRepairPlan(
  collections: readonly VisionClipCollection[],
  availablePaths: ReadonlySet<string>,
  replacements: readonly VisionClipCollectionRepairFile[]
): VisionClipCollectionRepairPlan {
  const normalizedReplacements = replacements.filter((file) => Boolean(file.path.trim() && file.name.trim()))
  const matches: VisionClipCollectionRepairMatch[] = []

  for (const collection of collections) {
    const missingSources = getMissingSources(collection, availablePaths)
    const usedReplacementPaths = new Set<string>()
    for (const missing of missingSources) {
      const fingerprintCandidates = getFingerprintCandidates(missing, normalizedReplacements, usedReplacementPaths)
      const contentHashCandidates = getContentHashCandidates(missing, normalizedReplacements, usedReplacementPaths)
      const sameNameCandidates = normalizedReplacements.filter((file) => !usedReplacementPaths.has(file.path) && normalizeName(file.name) === normalizeName(missing.name))
      const sameNameDurationCandidates = sameNameCandidates.filter((file) => hasMatchingDuration(missing.durationSeconds, file.durationSeconds))
      const durationCandidates = normalizedReplacements.filter((file) => !usedReplacementPaths.has(file.path) && hasMatchingDuration(missing.durationSeconds, file.durationSeconds))
      let candidate: VisionClipCollectionRepairFile | undefined
      let basis: VisionClipCollectionRepairMatchBasis | null = null
      let ambiguous = false
      if (contentHashCandidates.length === 1) {
        candidate = contentHashCandidates[0]
        basis = 'content-hash'
      } else if (contentHashCandidates.length > 1) {
        ambiguous = true
      } else if (fingerprintCandidates.length === 1) {
        candidate = fingerprintCandidates[0]
        basis = 'fingerprint'
      } else if (fingerprintCandidates.length > 1) {
        ambiguous = true
      } else if (sameNameDurationCandidates.length === 1) {
        candidate = sameNameDurationCandidates[0]
        basis = 'name-duration'
      } else if (sameNameDurationCandidates.length > 1) {
        ambiguous = true
      } else if (sameNameCandidates.length === 1) {
        candidate = sameNameCandidates[0]
        basis = 'name'
      } else if (sameNameCandidates.length > 1) {
        ambiguous = true
      } else if (durationCandidates.length === 1) {
        candidate = durationCandidates[0]
        basis = 'duration'
      } else if (durationCandidates.length > 1) {
        ambiguous = true
      } else if (missingSources.length === 1 && normalizedReplacements.length === 1 && !usedReplacementPaths.has(normalizedReplacements[0].path)) {
        candidate = normalizedReplacements[0]
        basis = 'single'
      }
      const status: VisionClipCollectionRepairMatchStatus = candidate ? 'matched' : ambiguous ? 'ambiguous' : 'unmatched'
      if (candidate) usedReplacementPaths.add(candidate.path)
      matches.push({
        collectionId: collection.id,
        collectionTitle: collection.title,
        missingPath: missing.path,
        missingFileName: missing.name,
        replacementPath: candidate?.path ?? null,
        replacementFileName: candidate?.name ?? null,
        status,
        basis
      })
    }
  }

  return {
    matches,
    matchedCount: matches.filter((match) => match.status === 'matched').length,
    ambiguousCount: matches.filter((match) => match.status === 'ambiguous').length,
    unmatchedCount: matches.filter((match) => match.status === 'unmatched').length
  }
}
