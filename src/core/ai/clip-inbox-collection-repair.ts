import type { VisionClipCollection } from '../../shared/vision-types'

export type VisionClipCollectionRepairFile = {
  path: string
  name: string
}

export type VisionClipCollectionRepairMatchStatus = 'matched' | 'ambiguous' | 'unmatched'

export type VisionClipCollectionRepairMatch = {
  collectionId: string
  collectionTitle: string
  missingPath: string
  missingFileName: string
  replacementPath: string | null
  replacementFileName: string | null
  status: VisionClipCollectionRepairMatchStatus
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

function getMissingSources(collection: VisionClipCollection, availablePaths: ReadonlySet<string>): Array<{ path: string; name: string }> {
  const seen = new Set<string>()
  const missing: Array<{ path: string; name: string }> = []
  for (const selection of collection.selections) {
    if (availablePaths.has(selection.videoPath) || seen.has(selection.videoPath)) continue
    seen.add(selection.videoPath)
    missing.push({ path: selection.videoPath, name: selection.fileName })
  }
  return missing
}

/**
 * Builds a user-reviewable replacement plan without touching files or the collection store.
 * Exact file-name matches are preferred; a one-source/one-file selection is the only fallback.
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
      const exactCandidates = normalizedReplacements.filter((file) => !usedReplacementPaths.has(file.path) && normalizeName(file.name) === normalizeName(missing.name))
      const fallback = missingSources.length === 1 && normalizedReplacements.length === 1 ? normalizedReplacements[0] : undefined
      const candidate = exactCandidates.length === 1 ? exactCandidates[0] : exactCandidates.length === 0 ? fallback : undefined
      const status: VisionClipCollectionRepairMatchStatus = candidate
        ? 'matched'
        : exactCandidates.length > 1
          ? 'ambiguous'
          : 'unmatched'
      if (candidate) usedReplacementPaths.add(candidate.path)
      matches.push({
        collectionId: collection.id,
        collectionTitle: collection.title,
        missingPath: missing.path,
        missingFileName: missing.name,
        replacementPath: candidate?.path ?? null,
        replacementFileName: candidate?.name ?? null,
        status
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
