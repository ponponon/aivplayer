import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import type { MediaCacheCategory, MediaCacheCategoryStats, MediaCacheClearResult, MediaCacheStats, MediaCacheStatsResult } from '../../shared/media-types.ts'

const STALE_TEMP_FILE_AGE_MS = 60 * 60 * 1000
const MEDIA_CACHE_CATEGORIES: readonly MediaCacheCategory[] = ['subtitle', 'summary', 'index', 'trickplay', 'waveform', 'structure', 'web-transcode', 'other']

export type MediaCacheRootKind = 'asr' | 'trickplay' | 'waveform' | 'structure' | 'web-transcode'

export type MediaCacheRoot = {
  kind: MediaCacheRootKind
  path: string
}

type CacheFile = {
  root: MediaCacheRoot
  path: string
  relativePath: string
  sizeBytes: number
  mtimeMs: number
}

type MediaSignature = {
  path: string
  sizeBytes: number
  mtimeMs: number
}

function emptyCategoryStats(): MediaCacheCategoryStats {
  return { bytes: 0, files: 0, staleBytes: 0, staleFiles: 0 }
}

function emptyStats(): MediaCacheStats {
  return {
    totalBytes: 0,
    totalFiles: 0,
    staleBytes: 0,
    staleFiles: 0,
    temporaryBytes: 0,
    temporaryFiles: 0,
    categories: Object.fromEntries(MEDIA_CACHE_CATEGORIES.map((category) => [category, emptyCategoryStats()])) as Record<MediaCacheCategory, MediaCacheCategoryStats>
  }
}

export function createMediaCacheRoots(userDataPath: string, asrCacheDirectory = join(userDataPath, 'asr-cache')): MediaCacheRoot[] {
  return [
    { kind: 'asr', path: asrCacheDirectory },
    { kind: 'trickplay', path: join(userDataPath, 'trickplay') },
    { kind: 'waveform', path: join(userDataPath, 'waveform-cache') },
    { kind: 'structure', path: join(userDataPath, 'media-analysis', 'structure') },
    { kind: 'web-transcode', path: join(userDataPath, 'web-transcode') }
  ]
}

function getCategory(root: MediaCacheRoot, relativePath: string): MediaCacheCategory {
  if (root.kind !== 'asr') return root.kind
  const firstSegment = relativePath.split(sep)[0]
  if (firstSegment === 'subtitles') return 'subtitle'
  if (firstSegment === 'summaries') return 'summary'
  if (firstSegment === 'index') return 'index'
  return 'other'
}

async function collectCacheFiles(root: MediaCacheRoot): Promise<CacheFile[]> {
  const files: CacheFile[] = []

  async function visit(currentPath: string): Promise<void> {
    let entries
    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const entryPath = join(currentPath, entry.name)
      if (entry.isDirectory()) {
        await visit(entryPath)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const fileStat = await stat(entryPath)
        files.push({ root, path: entryPath, relativePath: relative(root.path, entryPath), sizeBytes: fileStat.size, mtimeMs: fileStat.mtimeMs })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }

  await visit(root.path)
  return files
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readMediaSignature(value: unknown): MediaSignature | null {
  const record = asRecord(value)
  if (!record) return null
  const nestedMedia = asRecord(record.media)
  const source = nestedMedia ?? record
  const path = typeof source.path === 'string' ? source.path : typeof source.mediaPath === 'string' ? source.mediaPath : typeof record.sourcePath === 'string' ? record.sourcePath : null
  const sizeBytes = asFiniteNumber(source.sizeBytes)
  const mtimeMs = asFiniteNumber(source.mtimeMs)
  return path && sizeBytes !== null && mtimeMs !== null ? { path, sizeBytes, mtimeMs } : null
}

async function isCurrentMediaSignature(signature: MediaSignature | null): Promise<boolean> {
  if (!signature) return false
  try {
    const mediaStat = await stat(signature.path)
    return mediaStat.isFile() && mediaStat.size === signature.sizeBytes && mediaStat.mtimeMs === signature.mtimeMs
  } catch {
    return false
  }
}

async function isStaleManifest(file: CacheFile): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(file.path, 'utf8')) as unknown
    const record = asRecord(parsed)
    if (file.root.kind !== 'web-transcode' && record?.schemaVersion !== 1) return true
    if (file.root.kind === 'web-transcode') {
      const outputPath = record && typeof record.outputPath === 'string' ? record.outputPath : null
      if (!outputPath) return true
      try {
        return !(await stat(outputPath)).isFile()
      } catch {
        return true
      }
    }
    const signature = readMediaSignature(parsed)
    if (!signature) return true
    return !(await isCurrentMediaSignature(signature))
  } catch {
    return true
  }
}

async function isStaleFile(file: CacheFile, now: number): Promise<boolean> {
  if (file.relativePath.endsWith('.tmp')) return now - file.mtimeMs > STALE_TEMP_FILE_AGE_MS
  if (!file.relativePath.endsWith('.json')) return false
  if (file.root.kind === 'asr') return file.relativePath.split(sep)[0] === 'index'
  if (file.root.kind === 'trickplay' || file.root.kind === 'waveform') return basename(file.path) === 'manifest.json'
  if (file.root.kind === 'structure') return true
  if (file.root.kind === 'web-transcode') return basename(file.path).endsWith('.json')
  return false
}

async function inspectStaleFile(file: CacheFile, now: number): Promise<boolean> {
  if (file.relativePath.endsWith('.tmp')) return isStaleFile(file, now)
  if (file.root.kind === 'asr' && file.relativePath.split(sep)[0] !== 'index') return false
  if (file.root.kind === 'trickplay' || file.root.kind === 'waveform') return basename(file.path) === 'manifest.json' && await isStaleManifest(file)
  if (file.root.kind === 'structure') return file.relativePath.endsWith('.json') && await isStaleManifest(file)
  if (file.root.kind === 'web-transcode') return basename(file.path).endsWith('.json') && await isStaleManifest(file)
  return file.root.kind === 'asr' && file.relativePath.endsWith('.json') && await isStaleManifest(file)
}

async function collectInspectedFiles(roots: readonly MediaCacheRoot[], now: number): Promise<Array<CacheFile & { category: MediaCacheCategory; stale: boolean }>> {
  const inspected: Array<CacheFile & { category: MediaCacheCategory; stale: boolean }> = []
  for (const root of roots) {
    const files = await collectCacheFiles(root)
    for (const file of files) inspected.push({ ...file, category: getCategory(root, file.relativePath), stale: await inspectStaleFile(file, now) })
  }
  return inspected
}

export async function scanMediaCaches(roots: readonly MediaCacheRoot[], now = Date.now()): Promise<MediaCacheStats> {
  const stats = emptyStats()
  const files = await collectInspectedFiles(roots, now)
  for (const file of files) {
    const category = stats.categories[file.category]
    stats.totalBytes += file.sizeBytes
    stats.totalFiles += 1
    category.bytes += file.sizeBytes
    category.files += 1
    if (file.stale) {
      stats.staleBytes += file.sizeBytes
      stats.staleFiles += 1
      category.staleBytes += file.sizeBytes
      category.staleFiles += 1
    }
    if (file.relativePath.endsWith('.tmp') && file.stale) {
      stats.temporaryBytes += file.sizeBytes
      stats.temporaryFiles += 1
    }
  }
  return stats
}

export async function getMediaCacheStats(roots: readonly MediaCacheRoot[]): Promise<MediaCacheStatsResult> {
  try {
    return { success: true, message: 'Media cache statistics loaded.', stats: await scanMediaCaches(roots) }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error), stats: emptyStats() }
  }
}

export async function clearStaleMediaCaches(roots: readonly MediaCacheRoot[]): Promise<MediaCacheClearResult> {
  let deletedFiles = 0
  let deletedBytes = 0
  try {
    const files = await collectInspectedFiles(roots, Date.now())
    const staleFiles = files.filter((candidate) => candidate.stale)
    const removalTargets = new Map<string, CacheFile & { category: MediaCacheCategory; stale: boolean }>()
    for (const file of staleFiles) {
      if (file.root.kind === 'trickplay' || file.root.kind === 'waveform') {
        const cacheDirectory = dirname(file.path)
        for (const sibling of files) {
          if (sibling.root.kind === file.root.kind && dirname(sibling.path) === cacheDirectory) removalTargets.set(sibling.path, sibling)
        }
        continue
      }
      removalTargets.set(file.path, file)
    }
    for (const file of removalTargets.values()) {
      await rm(file.path, { force: true })
      deletedFiles += 1
      deletedBytes += file.sizeBytes
    }
    return { success: true, message: 'Stale media caches cleared.', deletedFiles, deletedBytes, stats: await scanMediaCaches(roots) }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error), deletedFiles, deletedBytes, stats: await scanMediaCaches(roots).catch(() => emptyStats()) }
  }
}
