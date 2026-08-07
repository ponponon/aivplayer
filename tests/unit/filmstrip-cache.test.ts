import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getFilmstripCacheKey, resolveFilmstripCache } from '../../src/core/media/filmstrip-cache'

describe('filmstrip cache', () => {
  it('writes extracted frames and reuses them without invoking the renderer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aivplayer-filmstrip-cache-'))
    const mediaPath = join(root, 'demo.mp4')
    await writeFile(mediaPath, 'source-v1')
    let renderCount = 0
    const options = {
      cacheDirectory: join(root, 'trickplay'),
      mediaPath,
      timestampsSeconds: [3.0004, 0, 3, 6],
      width: 240,
      quality: 6,
      renderFrame: async (timestampSeconds: number) => {
        renderCount += 1
        return Buffer.from(`frame:${timestampSeconds}`)
      }
    }

    const first = await resolveFilmstripCache(options)
    expect(first.cacheHit).toBe(false)
    expect(first.generatedFrameCount).toBe(3)
    expect(first.frames.map((frame) => frame.sourceSeconds)).toEqual([0, 3, 6])
    expect(renderCount).toBe(3)
    expect(first.cacheKey).toBeTruthy()

    const manifestPath = join(root, 'trickplay', 'sources', first.cacheKey!, 'w240-q6', 'manifest.json')
    expect(JSON.parse(await readFile(manifestPath, 'utf8')).frames).toHaveLength(3)

    const second = await resolveFilmstripCache({ ...options, renderFrame: async () => { throw new Error('cache miss') } })
    expect(second.cacheHit).toBe(true)
    expect(second.generatedFrameCount).toBe(0)
    expect(second.frames.map((frame) => frame.buffer.toString())).toEqual(['frame:0', 'frame:3', 'frame:6'])
  })

  it('changes the cache key when the source fingerprint changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aivplayer-filmstrip-invalidate-'))
    const mediaPath = join(root, 'demo.mp4')
    await writeFile(mediaPath, 'source-v1')
    const first = await resolveFilmstripCache({ cacheDirectory: join(root, 'trickplay'), mediaPath, timestampsSeconds: [1], width: 240, quality: 6, renderFrame: async () => Buffer.from('v1') })
    await writeFile(mediaPath, 'source-v2-with-new-size')
    const second = await resolveFilmstripCache({ cacheDirectory: join(root, 'trickplay'), mediaPath, timestampsSeconds: [1], width: 240, quality: 6, renderFrame: async () => Buffer.from('v2') })
    expect(second.cacheKey).not.toBe(first.cacheKey)
    expect(second.cacheHit).toBe(false)
    expect(getFilmstripCacheKey(mediaPath, 1, 2, 240, 6)).not.toBe(getFilmstripCacheKey(mediaPath, 2, 2, 240, 6))
  })
})
