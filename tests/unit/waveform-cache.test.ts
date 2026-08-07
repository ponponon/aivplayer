import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getWaveformCacheKey, resolveWaveformCache } from '../../src/core/media/waveform-cache'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('waveform cache', () => {
  it('writes a derived waveform atomically and reuses it for the same source signature', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-waveform-cache-test-'))
    temporaryDirectories.push(directory)
    const mediaPath = join(directory, 'source.mp4')
    await writeFile(mediaPath, 'source')
    let renderCount = 0
    const renderWaveform = async (): Promise<Buffer> => { renderCount += 1; return Buffer.from(`waveform-${renderCount}`) }
    const options = { cacheDirectory: join(directory, 'cache'), mediaPath, width: 1200, height: 64, renderWaveform }

    const first = await resolveWaveformCache(options)
    const second = await resolveWaveformCache(options)

    expect(first).toMatchObject({ cacheHit: false, generated: true, buffer: Buffer.from('waveform-1') })
    expect(second).toMatchObject({ cacheHit: true, generated: false, buffer: Buffer.from('waveform-1'), cacheKey: first.cacheKey })
    expect(renderCount).toBe(1)
  })

  it('isolates cache keys by source fingerprint and render dimensions', () => {
    const base = getWaveformCacheKey('/tmp/source.mp4', 100, 10, 1200, 64)
    expect(getWaveformCacheKey('/tmp/source.mp4', 101, 10, 1200, 64)).not.toBe(base)
    expect(getWaveformCacheKey('/tmp/source.mp4', 100, 11, 1200, 64)).not.toBe(base)
    expect(getWaveformCacheKey('/tmp/source.mp4', 100, 10, 900, 64)).not.toBe(base)
    expect(getWaveformCacheKey('/tmp/source.mp4', 100, 10, 1200, 48)).not.toBe(base)
  })
})
