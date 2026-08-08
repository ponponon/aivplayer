import type { EditingProject, EditingSource } from '../../shared/editing-types'

export type EditingSourceRepairCandidate = {
  path: string
  name: string
  durationSeconds: number
  width?: number
  height?: number
}

export type EditingSourceRepairReplacement = EditingSourceRepairCandidate & {
  sourceId: string
}

export type EditingSourceRepairIssue = {
  sourceId: string
  sourceName: string
  candidatePaths: string[]
}

export type EditingSourceRepairMatch = {
  replacements: EditingSourceRepairReplacement[]
  unresolvedSourceIds: string[]
  ambiguousSourceIds: string[]
  unresolved: EditingSourceRepairIssue[]
  ambiguous: EditingSourceRepairIssue[]
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function hasMatchingDuration(source: EditingSource, candidate: EditingSourceRepairCandidate): boolean {
  return Number.isFinite(candidate.durationSeconds) && candidate.durationSeconds > 0 && Math.abs(candidate.durationSeconds - source.durationSeconds) <= 0.05
}

/** Matches moved files conservatively by name and duration, never by array order alone. */
export function matchEditingSourceRepairCandidates(sources: readonly EditingSource[], candidates: readonly EditingSourceRepairCandidate[]): EditingSourceRepairMatch {
  const usedPaths = new Set<string>()
  const replacements: EditingSourceRepairReplacement[] = []
  const unresolvedSourceIds: string[] = []
  const ambiguousSourceIds: string[] = []
  const unresolved: EditingSourceRepairIssue[] = []
  const ambiguous: EditingSourceRepairIssue[] = []

  for (const source of sources) {
    const available = candidates.filter((candidate) => !usedPaths.has(candidate.path))
    const sameName = available.filter((candidate) => normalizeName(candidate.name) === normalizeName(source.name))
    const sameDuration = available.filter((candidate) => hasMatchingDuration(source, candidate))
    const exact = sameName.filter((candidate) => hasMatchingDuration(source, candidate))
    const matches = exact.length === 1
      ? exact
      : exact.length > 1
        ? exact
        : sameName.length === 1
          ? sameName
          : sameDuration.length === 1
            ? sameDuration
            : []
    if (matches.length !== 1) {
      if (matches.length > 1 || exact.length > 1 || sameName.length > 1 || sameDuration.length > 1) {
        const ambiguousCandidates = matches.length > 1 ? matches : exact.length > 1 ? exact : sameName.length > 1 ? sameName : sameDuration
        ambiguousSourceIds.push(source.id)
        ambiguous.push({ sourceId: source.id, sourceName: source.name, candidatePaths: ambiguousCandidates.map((candidate) => candidate.path) })
      } else {
        unresolvedSourceIds.push(source.id)
        unresolved.push({ sourceId: source.id, sourceName: source.name, candidatePaths: [] })
      }
      continue
    }
    const candidate = matches[0]!
    usedPaths.add(candidate.path)
    replacements.push({ sourceId: source.id, ...candidate })
  }

  return { replacements, unresolvedSourceIds, ambiguousSourceIds, unresolved, ambiguous }
}

function getSourceRequiredDuration(project: EditingProject, sourceId: string): number {
  const clipEnd = project.videoClips.filter((clip) => clip.sourceId === sourceId).reduce((max, clip) => Math.max(max, clip.sourceEndSeconds), 0)
  const blockEnd = (project.videoBlocks ?? []).filter((block) => block.sourceId === sourceId).reduce((max, block) => Math.max(max, block.sourceEndSeconds), 0)
  return Math.max(clipEnd, blockEnd)
}

/** Rebinds moved files while keeping source IDs and every timeline reference stable. */
export function relinkEditingProjectSources(project: EditingProject, replacements: readonly EditingSourceRepairReplacement[], updatedAt = Date.now()): EditingProject | null {
  const replacementById = new Map(replacements.map((replacement) => [replacement.sourceId, replacement]))
  const usedPaths = new Set(project.sources.filter((source) => !replacementById.has(source.id)).map((source) => source.path))
  const sources = project.sources.map((source) => {
    const replacement = replacementById.get(source.id)
    if (!replacement) return source
    if (!replacement.path.trim() || usedPaths.has(replacement.path) || !Number.isFinite(replacement.durationSeconds) || replacement.durationSeconds <= 0 || replacement.durationSeconds + 0.01 < getSourceRequiredDuration(project, source.id)) return null
    usedPaths.add(replacement.path)
    return {
      ...source,
      path: replacement.path,
      name: replacement.name.trim() || source.name,
      fingerprint: `${replacement.path}:${replacement.durationSeconds}`,
      durationSeconds: replacement.durationSeconds,
      ...(replacement.width === undefined ? {} : { width: replacement.width }),
      ...(replacement.height === undefined ? {} : { height: replacement.height })
    }
  })
  if (sources.some((source): source is null => source === null) || replacementById.size !== replacements.length || replacements.some((replacement) => !project.sources.some((source) => source.id === replacement.sourceId))) return null
  return { ...project, sources: sources as EditingSource[], updatedAt }
}
