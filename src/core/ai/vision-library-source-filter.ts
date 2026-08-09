import type { VisionLibrarySource } from '../../shared/vision-types'

export type VisionLibrarySourceSortMode = 'recent' | 'name' | 'frames'

export type VisionLibrarySourceFilterOptions = {
  query?: string
  favoriteOnly?: boolean
  sortMode?: VisionLibrarySourceSortMode
}

function searchableText(source: VisionLibrarySource): string {
  const metadata = source.metadata
  return [
    source.fileName,
    source.videoPath,
    ...(metadata?.tags ?? []),
    metadata?.source ?? '',
    metadata?.projectId ?? '',
    metadata?.note ?? ''
  ].join('\u0000').toLocaleLowerCase()
}

function compareByName(left: VisionLibrarySource, right: VisionLibrarySource): number {
  return left.fileName.localeCompare(right.fileName, undefined, { numeric: true, sensitivity: 'base' }) || left.videoPath.localeCompare(right.videoPath, undefined, { numeric: true, sensitivity: 'base' })
}

export function filterVisionLibrarySources(
  sources: readonly VisionLibrarySource[],
  options: VisionLibrarySourceFilterOptions = {}
): VisionLibrarySource[] {
  const query = options.query?.trim().toLocaleLowerCase() ?? ''
  const filtered = sources.filter((source) => {
    if (options.favoriteOnly && source.metadata?.favorite !== true) return false
    return !query || searchableText(source).includes(query)
  })
  return filtered.sort((left, right) => {
    if (options.sortMode === 'name') return compareByName(left, right)
    if (options.sortMode === 'frames') return right.frameCount - left.frameCount || compareByName(left, right)
    return right.indexedAtMs - left.indexedAtMs || compareByName(left, right)
  })
}
