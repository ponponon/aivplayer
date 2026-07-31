import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildPersonMatteTrack, getPersonMatteTrackCacheDirectory, getPersonMatteTrackTimestamps } from '../../src/core/ai/person-matte-track'

describe('person matte track', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-person-matte-track-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('samples a source range deterministically', () => {
    expect(getPersonMatteTrackTimestamps(1, 2.1, 2)).toEqual([1, 1.5, 2])
    expect(getPersonMatteTrackTimestamps(3, 3, 15)).toEqual([3])
  })

  it('builds and then reuses an atomic cached mask track', async () => {
    const calls: number[] = []
    const progress: string[] = []
    const runtime = {
      removeBackgroundToFile: async (_inputPath: string, outputPath: string): Promise<string> => {
        await writeFile(outputPath, Buffer.from('mask'))
        return outputPath
      }
    }
    const extractFrame = async (timestampSeconds: number, outputPath: string): Promise<void> => {
      calls.push(timestampSeconds)
      await writeFile(outputPath, Buffer.from('frame'))
    }

    const first = await buildPersonMatteTrack({ ffmpegPath: 'unused', sourcePath: '/videos/demo.mp4', sourceFingerprint: 'demo:1', sourceStartSeconds: 1, sourceEndSeconds: 2.1, sampleFps: 2, cacheRoot: tempDirectory, runtime, extractFrame, onProgress: (event) => progress.push(event.status) })
    const second = await buildPersonMatteTrack({ ffmpegPath: 'unused', sourcePath: '/videos/demo.mp4', sourceFingerprint: 'demo:1', sourceStartSeconds: 1, sourceEndSeconds: 2.1, sampleFps: 2, cacheRoot: tempDirectory, runtime, extractFrame })

    expect(calls).toEqual([1, 1.5, 2])
    expect(first).toEqual(second)
    expect(progress).toEqual(['processing', 'processing', 'processing'])
    expect(await readFile(join(getPersonMatteTrackCacheDirectory(tempDirectory, { sourceFingerprint: 'demo:1', sourceStartSeconds: 1, sourceEndSeconds: 2.1, sampleFps: 2 }), 'manifest.json'), 'utf8')).toContain('"providerId"')
  })

  it('removes a partial build when cancelled', async () => {
    const controller = new AbortController()
    const runtime = { removeBackgroundToFile: async (): Promise<string> => { controller.abort(); return '' } }

    await expect(buildPersonMatteTrack({ ffmpegPath: 'unused', sourcePath: '/videos/demo.mp4', sourceFingerprint: 'demo:2', sourceStartSeconds: 0, sourceEndSeconds: 1, sampleFps: 1, cacheRoot: tempDirectory, runtime, extractFrame: async (_timestamp, outputPath) => { await writeFile(outputPath, Buffer.from('frame')) }, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
