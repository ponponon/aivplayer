import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getMediaSubtitleSidecarPaths, resolveMediaSubtitleSidecar } from '../../src/core/ai/subtitle-sidecar'

describe('media subtitle sidecar resolver', () => {
  let temporaryDirectory: string | null = null

  afterEach(async () => {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
    temporaryDirectory = null
  })

  it('returns the VTT and SRT pair with a file revision', async () => {
    temporaryDirectory = await mkdtemp(join('/tmp', 'aivplayer-subtitle-sidecar-'))
    const mediaPath = join(temporaryDirectory, 'episode.mp4')
    const paths = getMediaSubtitleSidecarPaths(mediaPath)
    await writeFile(mediaPath, 'media')
    await writeFile(paths.subtitlePath, 'WEBVTT\n')
    await writeFile(paths.subtitleSrtPath, '1\n00:00:00,000 --> 00:00:01,000\nhello\n')

    await expect(resolveMediaSubtitleSidecar(mediaPath)).resolves.toMatchObject({
      subtitlePath: paths.subtitlePath,
      subtitleSrtPath: paths.subtitleSrtPath
    })
    const resolved = await resolveMediaSubtitleSidecar(mediaPath)
    expect(resolved?.revision).toBeGreaterThanOrEqual(0)
  })

  it('uses an SRT-only sidecar without borrowing another media path', async () => {
    temporaryDirectory = await mkdtemp(join('/tmp', 'aivplayer-subtitle-sidecar-'))
    const mediaPath = join(temporaryDirectory, 'episode.mp4')
    const otherMediaPath = join(temporaryDirectory, 'other.mp4')
    const paths = getMediaSubtitleSidecarPaths(mediaPath)
    await writeFile(mediaPath, 'media')
    await writeFile(otherMediaPath, 'other')
    await writeFile(paths.subtitleSrtPath, '1\n00:00:00,000 --> 00:00:01,000\nhello\n')

    await expect(resolveMediaSubtitleSidecar(mediaPath)).resolves.toMatchObject({
      subtitlePath: paths.subtitleSrtPath,
      subtitleSrtPath: paths.subtitleSrtPath
    })
    await expect(resolveMediaSubtitleSidecar(otherMediaPath)).resolves.toBeNull()
  })
})
