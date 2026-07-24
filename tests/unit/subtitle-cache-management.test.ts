import { mkdtemp, readFile, mkdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearStaleSubtitleCache, scanSubtitleCache } from '../../src/core/ai/subtitle-cache-management'

describe('subtitle cache management', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-subtitle-cache-management-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('reports cache usage and stale indexes without reading subtitle contents', async () => {
    const mediaPath = join(tempDirectory, 'movie.mp4')
    const cacheDirectory = join(tempDirectory, 'cache')
    const subtitlePath = join(cacheDirectory, 'subtitles', 'movie-raw.vtt')
    const summaryPath = join(cacheDirectory, 'summaries', 'movie-summary.json')
    const validIndexPath = join(cacheDirectory, 'index', 'valid.json')
    await writeFile(mediaPath, 'video fixture')
    await mkdir(join(cacheDirectory, 'subtitles'), { recursive: true })
    await mkdir(join(cacheDirectory, 'summaries'), { recursive: true })
    await mkdir(join(cacheDirectory, 'index'), { recursive: true })
    await writeFile(subtitlePath, 'WEBVTT\n\n00:00.000 --> 00:01.000\nhello')
    await writeFile(summaryPath, JSON.stringify({ title: 'fixture' }))
    const mediaStat = await stat(mediaPath)
    await writeFile(validIndexPath, JSON.stringify({ schemaVersion: 1, media: { path: mediaPath, sizeBytes: mediaStat.size, mtimeMs: mediaStat.mtimeMs } }))
    await writeFile(join(cacheDirectory, 'index', 'missing-media.json'), JSON.stringify({ schemaVersion: 1, media: { path: join(tempDirectory, 'missing.mp4'), sizeBytes: 1, mtimeMs: 1 } }))
    await writeFile(join(cacheDirectory, 'index', 'damaged.json'), '{not-json')

    const stats = await scanSubtitleCache(cacheDirectory)

    expect(stats.totalFiles).toBe(5)
    expect(stats.subtitleFiles).toBe(1)
    expect(stats.summaryFiles).toBe(1)
    expect(stats.indexFiles).toBe(3)
    expect(stats.staleIndexFiles).toBe(2)
    expect(stats.subtitleBytes).toBeGreaterThan(0)
    expect(stats.summaryBytes).toBeGreaterThan(0)
  })

  it('cleans stale indexes and old temporary files while preserving usable artifacts', async () => {
    const mediaPath = join(tempDirectory, 'movie.mp4')
    const cacheDirectory = join(tempDirectory, 'cache')
    const subtitlePath = join(cacheDirectory, 'subtitles', 'movie-raw.vtt')
    const summaryPath = join(cacheDirectory, 'summaries', 'movie-summary.json')
    const oldTempPath = join(cacheDirectory, 'subtitles', 'old.tmp')
    const freshTempPath = join(cacheDirectory, 'subtitles', 'fresh.tmp')
    await writeFile(mediaPath, 'video fixture')
    await mkdir(join(cacheDirectory, 'subtitles'), { recursive: true })
    await mkdir(join(cacheDirectory, 'summaries'), { recursive: true })
    await mkdir(join(cacheDirectory, 'index'), { recursive: true })
    await writeFile(subtitlePath, 'WEBVTT')
    await writeFile(summaryPath, JSON.stringify({ title: 'fixture' }))
    await writeFile(join(cacheDirectory, 'index', 'stale.json'), JSON.stringify({ schemaVersion: 1, media: { path: join(tempDirectory, 'deleted.mp4'), sizeBytes: 1, mtimeMs: 1 } }))
    await writeFile(oldTempPath, 'old')
    await writeFile(freshTempPath, 'fresh')
    const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await utimes(oldTempPath, oldTime, oldTime)

    const result = await clearStaleSubtitleCache(cacheDirectory)

    expect(result.success).toBe(true)
    expect(result.deletedFiles).toBe(2)
    await expect(readFile(subtitlePath, 'utf8')).resolves.toBe('WEBVTT')
    await expect(readFile(summaryPath, 'utf8')).resolves.toContain('fixture')
    await expect(readFile(freshTempPath, 'utf8')).resolves.toBe('fresh')
    await expect(stat(join(cacheDirectory, 'index', 'stale.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(oldTempPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(result.stats.staleIndexFiles).toBe(0)
  })
})
