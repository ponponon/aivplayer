import { createHash } from 'node:crypto'
import type { VisionDuplicateMediaGroup, VisionLibrarySource } from '../../shared/vision-types'
import { normalizeMediaContentHash } from '../../shared/media-content-hash'

export type VisionDuplicateMediaCandidate = {
  source: VisionLibrarySource
  contentHash: string
}

export type VisionDuplicateMediaHasher = (source: VisionLibrarySource) => Promise<string | null>

function compareSources(left: VisionLibrarySource, right: VisionLibrarySource): number {
  const favoriteDelta = Number(Boolean(right.metadata?.favorite)) - Number(Boolean(left.metadata?.favorite))
  if (favoriteDelta !== 0) return favoriteDelta
  if (left.videoPath.length !== right.videoPath.length) return left.videoPath.length - right.videoPath.length
  return left.videoPath.localeCompare(right.videoPath, undefined, { sensitivity: 'base' })
}

function createDuplicateGroup(contentHash: string, candidates: readonly VisionDuplicateMediaCandidate[]): VisionDuplicateMediaGroup {
  const sources = candidates.map((candidate) => candidate.source).sort(compareSources)
  const totalBytes = sources.reduce((total, source) => total + Math.max(0, source.fileSizeBytes), 0)
  const primaryBytes = Math.max(0, sources[0]?.fileSizeBytes ?? 0)
  return {
    id: `duplicate-${createHash('sha256').update(contentHash).digest('hex').slice(0, 16)}`,
    sources,
    totalBytes,
    duplicateBytes: Math.max(0, totalBytes - primaryBytes)
  }
}

/** Groups only exact content identities; filename, size, and duration alone never form a duplicate group. */
export function groupVisionDuplicateMediaCandidates(candidates: readonly VisionDuplicateMediaCandidate[]): VisionDuplicateMediaGroup[] {
  const byHash = new Map<string, VisionDuplicateMediaCandidate[]>()
  const sourceIdsByHash = new Map<string, Set<string>>()
  for (const candidate of candidates) {
    const contentHash = normalizeMediaContentHash(candidate.contentHash)
    const sourceId = candidate.source.sourceId.trim()
    if (!contentHash || !sourceId) continue
    const sourceIds = sourceIdsByHash.get(contentHash) ?? new Set<string>()
    if (sourceIds.has(sourceId)) continue
    sourceIds.add(sourceId)
    sourceIdsByHash.set(contentHash, sourceIds)
    const group = byHash.get(contentHash) ?? []
    group.push({ source: candidate.source, contentHash })
    byHash.set(contentHash, group)
  }
  return [...byHash.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([contentHash, group]) => createDuplicateGroup(contentHash, group))
    .sort((left, right) => left.id.localeCompare(right.id))
}

async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) return
      results[index] = await mapper(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker))
  return results
}

/** Hashes only sources sharing a recorded byte size, then returns a reviewable exact-duplicate report. */
export async function scanVisionDuplicateMediaSources(
  sources: readonly VisionLibrarySource[],
  hasher: VisionDuplicateMediaHasher,
  options: { concurrency?: number } = {}
): Promise<import('../../shared/vision-types').VisionDuplicateMediaScanResult> {
  const sourceGroups = new Map<string, VisionLibrarySource[]>()
  for (const source of sources) {
    const sizeKey = source.fileSizeBytes > 0 ? String(source.fileSizeBytes) : 'unknown-size'
    const group = sourceGroups.get(sizeKey) ?? []
    group.push(source)
    sourceGroups.set(sizeKey, group)
  }
  const hashableSources = [...sourceGroups.values()].filter((group) => group.length > 1).flat()
  const skippedBySizeCount = sources.length - hashableSources.length
  const hashedResults = await mapWithConcurrency(hashableSources, options.concurrency ?? 2, async (source) => {
    try {
      const contentHash = normalizeMediaContentHash(await hasher(source))
      return contentHash ? { source, contentHash } : null
    } catch {
      return null
    }
  })
  const candidates = hashedResults.filter((candidate): candidate is VisionDuplicateMediaCandidate => candidate !== null)
  return {
    scannedCount: sources.length,
    hashedCount: hashableSources.length,
    unavailableCount: hashableSources.length - candidates.length,
    skippedBySizeCount,
    groups: groupVisionDuplicateMediaCandidates(candidates)
  }
}
