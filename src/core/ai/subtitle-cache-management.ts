import { join, relative, sep } from 'node:path'
import { readdir, readFile, stat, unlink } from 'node:fs/promises'
import type { AsrCacheClearResult, AsrCacheStats, AsrCacheStatsResult } from '../../shared/media-types.ts'

const STALE_TEMP_FILE_AGE_MS = 60 * 60 * 1000

type CacheFile = { path: string; relativePath: string; sizeBytes: number; mtimeMs: number }

async function collectCacheFiles(directoryPath: string): Promise<CacheFile[]> {
  const files: CacheFile[] = []

  async function visit(currentPath: string): Promise<void> {
    let entries
    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }

    await Promise.all(entries.map(async (entry) => {
      const entryPath = join(currentPath, entry.name)
      if (entry.isDirectory()) {
        await visit(entryPath)
        return
      }
      if (!entry.isFile()) return
      const fileStat = await stat(entryPath)
      files.push({
        path: entryPath,
        relativePath: relative(directoryPath, entryPath),
        sizeBytes: fileStat.size,
        mtimeMs: fileStat.mtimeMs
      })
    }))
  }

  await visit(directoryPath)
  return files
}

function getCacheCategory(relativePath: string): 'subtitle' | 'summary' | 'index' | 'other' {
  const firstSegment = relativePath.split(sep)[0]
  if (firstSegment === 'subtitles') return 'subtitle'
  if (firstSegment === 'summaries') return 'summary'
  if (firstSegment === 'index') return 'index'
  return 'other'
}

async function isStaleManifest(filePath: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as {
      schemaVersion?: unknown
      media?: { path?: unknown; sizeBytes?: unknown; mtimeMs?: unknown }
    }
    if (parsed.schemaVersion !== 1 || typeof parsed.media?.path !== 'string' || typeof parsed.media.sizeBytes !== 'number' || typeof parsed.media.mtimeMs !== 'number') {
      return true
    }
    const mediaStat = await stat(parsed.media.path)
    return mediaStat.size !== parsed.media.sizeBytes || mediaStat.mtimeMs !== parsed.media.mtimeMs
  } catch {
    return true
  }
}

export async function scanSubtitleCache(cacheDirectory: string): Promise<AsrCacheStats> {
  const files = await collectCacheFiles(cacheDirectory)
  const stats: AsrCacheStats = {
    cacheDirectory,
    totalBytes: 0,
    totalFiles: 0,
    subtitleBytes: 0,
    subtitleFiles: 0,
    summaryBytes: 0,
    summaryFiles: 0,
    indexBytes: 0,
    indexFiles: 0,
    otherBytes: 0,
    otherFiles: 0,
    staleIndexFiles: 0
  }

  for (const file of files) {
    const category = getCacheCategory(file.relativePath)
    stats.totalBytes += file.sizeBytes
    stats.totalFiles += 1
    if (category === 'subtitle') {
      stats.subtitleBytes += file.sizeBytes
      stats.subtitleFiles += 1
    } else if (category === 'summary') {
      stats.summaryBytes += file.sizeBytes
      stats.summaryFiles += 1
    } else if (category === 'index') {
      stats.indexBytes += file.sizeBytes
      stats.indexFiles += 1
      if (file.relativePath.endsWith('.json') && await isStaleManifest(file.path)) stats.staleIndexFiles += 1
    } else {
      stats.otherBytes += file.sizeBytes
      stats.otherFiles += 1
    }
  }

  return stats
}

export async function getSubtitleCacheStats(cacheDirectory: string): Promise<AsrCacheStatsResult> {
  try {
    return { success: true, message: 'Cache statistics loaded.', stats: await scanSubtitleCache(cacheDirectory) }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      stats: {
        cacheDirectory,
        totalBytes: 0,
        totalFiles: 0,
        subtitleBytes: 0,
        subtitleFiles: 0,
        summaryBytes: 0,
        summaryFiles: 0,
        indexBytes: 0,
        indexFiles: 0,
        otherBytes: 0,
        otherFiles: 0,
        staleIndexFiles: 0
      }
    }
  }
}

export async function clearStaleSubtitleCache(cacheDirectory: string): Promise<AsrCacheClearResult> {
  let deletedFiles = 0
  let deletedBytes = 0

  try {
    const files = await collectCacheFiles(cacheDirectory)
    const now = Date.now()
    for (const file of files) {
      const isStaleIndex = getCacheCategory(file.relativePath) === 'index' && file.relativePath.endsWith('.json') && await isStaleManifest(file.path)
      const isOldTemporaryFile = file.relativePath.endsWith('.tmp') && now - file.mtimeMs > STALE_TEMP_FILE_AGE_MS
      if (!isStaleIndex && !isOldTemporaryFile) continue
      try {
        await unlink(file.path)
        deletedFiles += 1
        deletedBytes += file.sizeBytes
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }

    return { success: true, message: 'Stale cache entries cleared.', deletedFiles, deletedBytes, stats: await scanSubtitleCache(cacheDirectory) }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      deletedFiles,
      deletedBytes,
      stats: await getSubtitleCacheStats(cacheDirectory).then((result) => result.stats)
    }
  }
}
