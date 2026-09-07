import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VisionDuplicateMediaHashCache } from '../../src/core/ai/vision-duplicate-media-cache'
import type { VisionLibrarySource } from '../../src/shared/vision-types'

const source = (fileSizeBytes: number, fileMtimeMs: number): VisionLibrarySource => ({
  sourceId: 'source-1', videoPath: '/media/../media/demo.mp4', fileName: 'demo.mp4', fileSizeBytes, fileMtimeMs,
  frameCount: 1, indexedAtMs: 1, subtitlePath: null, thumbnailPath: null, metadata: null
})

describe('vision duplicate media hash cache', () => {
  it('persists exact metadata identity and invalidates changed files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-duplicate-cache-'))
    const manifestPath = join(directory, 'hashes.json')
    const cached = new VisionDuplicateMediaHashCache(manifestPath)
    await cached.load()
    cached.set(source(10, 20), 'C'.repeat(64))
    await cached.flush()

    const restored = new VisionDuplicateMediaHashCache(manifestPath)
    await restored.load()
    expect(restored.get(source(10, 20))).toBe('c'.repeat(64))
    expect(restored.get(source(11, 20))).toBeUndefined()
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toMatchObject({ schemaVersion: 1 })
    await rm(directory, { recursive: true, force: true })
  })

  it('falls back to an empty cache for invalid manifests', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-duplicate-cache-invalid-'))
    const manifestPath = join(directory, 'hashes.json')
    await writeFile(manifestPath, '{"schemaVersion":999,"entries":{}}')
    const cached = new VisionDuplicateMediaHashCache(manifestPath)
    await cached.load()
    expect(cached.get(source(10, 20))).toBeUndefined()
    await rm(directory, { recursive: true, force: true })
  })
})
