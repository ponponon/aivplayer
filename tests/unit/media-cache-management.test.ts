import { lstat, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearStaleMediaCaches, createMediaCacheRoots, scanMediaCaches } from '../../src/core/media/media-cache-management'

describe('media cache management', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'aivplayer-media-cache-management-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('reports all known derived cache families and stale media signatures', async () => {
    const sourcePath = join(directory, 'source.mp4')
    await writeFile(sourcePath, 'source')
    const roots = createMediaCacheRoots(directory, join(directory, 'asr'))
    const trickplayPath = join(directory, 'trickplay', 'sources', 'old', 'w320-q5')
    const waveformPath = join(directory, 'waveform-cache', 'sources', 'current', 'w1200-h64')
    const structurePath = join(directory, 'media-analysis', 'structure')
    const webPath = join(directory, 'web-transcode')
    await mkdir(join(directory, 'asr', 'subtitles'), { recursive: true })
    await mkdir(join(directory, 'asr', 'index'), { recursive: true })
    await mkdir(trickplayPath, { recursive: true })
    await mkdir(waveformPath, { recursive: true })
    await mkdir(structurePath, { recursive: true })
    await mkdir(webPath, { recursive: true })
    await writeFile(join(directory, 'asr', 'subtitles', 'movie.vtt'), 'WEBVTT')
    await writeFile(join(directory, 'asr', 'index', 'stale.json'), JSON.stringify({ schemaVersion: 1, media: { path: join(directory, 'missing.mp4'), sizeBytes: 1, mtimeMs: 1 } }))
    await writeFile(join(trickplayPath, 'frame-0.jpg'), 'frame')
    await writeFile(join(trickplayPath, 'manifest.json'), JSON.stringify({ schemaVersion: 1, media: { path: join(directory, 'missing.mp4'), sizeBytes: 1, mtimeMs: 1 } }))
    const sourceStat = await stat(sourcePath)
    await writeFile(join(waveformPath, 'waveform.png'), 'wave')
    await writeFile(join(waveformPath, 'manifest.json'), JSON.stringify({ schemaVersion: 1, media: { path: sourcePath, sizeBytes: sourceStat.size, mtimeMs: sourceStat.mtimeMs } }))
    await writeFile(join(structurePath, 'stale.json'), JSON.stringify({ mediaPath: join(directory, 'missing.mp4'), sizeBytes: 1, mtimeMs: 1, segments: [] }))
    await writeFile(join(webPath, 'orphan.json'), JSON.stringify({ sourcePath, outputPath: join(webPath, 'missing.mp4') }))

    const stats = await scanMediaCaches(roots)

    expect(stats.totalFiles).toBe(8)
    expect(stats.categories.subtitle.files).toBe(1)
    expect(stats.categories.trickplay.files).toBe(2)
    expect(stats.categories.waveform.files).toBe(2)
    expect(stats.categories.structure.staleFiles).toBe(1)
    expect(stats.categories['web-transcode'].staleFiles).toBe(1)
    expect(stats.staleFiles).toBe(4)
  })

  it('clears stale cache artifacts while preserving valid data and not following symlinks', async () => {
    const sourcePath = join(directory, 'source.mp4')
    await writeFile(sourcePath, 'source')
    const roots = createMediaCacheRoots(directory, join(directory, 'asr'))
    const trickplayPath = join(directory, 'trickplay', 'sources', 'old', 'w320-q5')
    const waveformPath = join(directory, 'waveform-cache', 'sources', 'current', 'w1200-h64')
    await mkdir(join(directory, 'asr', 'index'), { recursive: true })
    await mkdir(trickplayPath, { recursive: true })
    await mkdir(waveformPath, { recursive: true })
    const sourceStat = await stat(sourcePath)
    await writeFile(join(directory, 'asr', 'index', 'valid.json'), JSON.stringify({ schemaVersion: 1, media: { path: sourcePath, sizeBytes: sourceStat.size, mtimeMs: sourceStat.mtimeMs } }))
    await writeFile(join(directory, 'asr', 'index', 'stale.json'), JSON.stringify({ schemaVersion: 1, media: { path: join(directory, 'missing.mp4'), sizeBytes: 1, mtimeMs: 1 } }))
    await writeFile(join(trickplayPath, 'frame-0.jpg'), 'stale-frame')
    await writeFile(join(trickplayPath, 'manifest.json'), JSON.stringify({ schemaVersion: 1, media: { path: join(directory, 'missing.mp4'), sizeBytes: 1, mtimeMs: 1 } }))
    await writeFile(join(waveformPath, 'waveform.png'), 'valid-wave')
    await writeFile(join(waveformPath, 'manifest.json'), JSON.stringify({ schemaVersion: 1, media: { path: sourcePath, sizeBytes: sourceStat.size, mtimeMs: sourceStat.mtimeMs } }))
    const oldTempPath = join(directory, 'asr', 'old.tmp')
    await writeFile(oldTempPath, 'old-temp')
    const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await utimes(oldTempPath, oldTime, oldTime)
    const linkPath = join(directory, 'waveform-cache', 'source-link')
    await symlink(sourcePath, linkPath)

    const result = await clearStaleMediaCaches(roots)

    expect(result.success).toBe(true)
    expect(result.deletedFiles).toBe(4)
    await expect(stat(join(directory, 'asr', 'index', 'valid.json'))).resolves.toBeTruthy()
    await expect(stat(join(directory, 'asr', 'index', 'stale.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(join(trickplayPath, 'frame-0.jpg'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(join(trickplayPath, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(waveformPath, 'waveform.png'), 'utf8')).resolves.toBe('valid-wave')
    await expect(lstat(linkPath)).resolves.toMatchObject({ isSymbolicLink: expect.any(Function) })
    await expect(stat(oldTempPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(result.stats.staleFiles).toBe(0)
  })
})
