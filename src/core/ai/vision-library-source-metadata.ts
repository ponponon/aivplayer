import { normalize, resolve } from 'node:path'
import type { MediaImportInboxItem } from '../../shared/media-import-inbox'
import type { VisionLibrarySource } from '../../shared/vision-types'

function sourcePathKey(path: string): string {
  const normalized = normalize(resolve(path))
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export function mergeVisionLibrarySourceMetadata(sources: readonly VisionLibrarySource[], items: readonly MediaImportInboxItem[]): VisionLibrarySource[] {
  const metadataByPath = new Map(items.map((item) => [sourcePathKey(item.path), item.metadata]))
  return sources.map((source) => ({
    ...source,
    metadata: metadataByPath.get(sourcePathKey(source.videoPath)) ?? null
  }))
}
