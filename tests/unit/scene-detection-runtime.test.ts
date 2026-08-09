import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectSceneCutTimestamps } from '../../src/core/media/scene-detection-runtime'

describe('scene detection runtime', () => {
  it('runs the FFmpeg wrapper and parses showinfo output from stderr', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-scene-runtime-'))
    const fakeFfmpeg = join(directory, 'ffmpeg')
    await writeFile(fakeFfmpeg, '#!/bin/sh\nprintf \'%s\\n\' \'[Parsed_showinfo] pts_time:12.500\' \'[Parsed_showinfo] pts_time:12.900\' \'[Parsed_showinfo] pts_time:21.250\' >&2\n')
    await chmod(fakeFfmpeg, 0o755)

    try {
      await expect(detectSceneCutTimestamps(fakeFfmpeg, '/tmp/demo.mp4', 0.18, 0.8)).resolves.toEqual([12.5, 21.25])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects before spawning FFmpeg when the caller has aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(detectSceneCutTimestamps('/missing/ffmpeg', '/tmp/demo.mp4', undefined, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
