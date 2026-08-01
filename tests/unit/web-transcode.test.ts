import { chmod, mkdtemp, readFile, stat, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WebTranscodeManager, type WebTranscodeInput } from '../../src/core/media/web-transcode'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('WebTranscodeManager', () => {
  it('reports a clear error when ffmpeg is unavailable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-web-transcode-missing-'))
    temporaryDirectories.push(directory)
    const sourcePath = join(directory, 'source.mkv')
    await writeFile(sourcePath, 'source')
    const manager = new WebTranscodeManager({ cacheRoot: join(directory, 'cache'), getFfmpegPath: async () => null })

    const status = await manager.start({ id: 'missing-ffmpeg', sourcePath, durationSeconds: 10 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const finalStatus = await manager.getStatus({ id: 'missing-ffmpeg', sourcePath, durationSeconds: 10 })

    expect(status.state).toBe('queued')
    expect(finalStatus.state).toBe('error')
    expect(finalStatus.message).toContain('FFmpeg')
    await manager.stop()
  })

  it.skipIf(process.platform === 'win32')('transcodes once and reuses the completed cache', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-web-transcode-cache-'))
    temporaryDirectories.push(directory)
    const sourcePath = join(directory, 'source.mkv')
    const fakeFfmpegPath = join(directory, 'fake-ffmpeg')
    await writeFile(sourcePath, 'source')
    await writeFile(fakeFfmpegPath, '#!/bin/sh\nout=""\nfor arg in "$@"; do out="$arg"; done\nprintf "out_time_ms=1000000\\nprogress=end\\n" >&2\nprintf "fake-mp4" > "$out"\n')
    await chmod(fakeFfmpegPath, 0o755)
    const manager = new WebTranscodeManager({ cacheRoot: join(directory, 'cache'), getFfmpegPath: async () => fakeFfmpegPath })
    const input: WebTranscodeInput = { id: 'cache-hit', sourcePath, durationSeconds: 2 }

    await manager.start(input)
    let status = await manager.getStatus(input)
    for (let attempt = 0; attempt < 200 && status.state !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      status = await manager.getStatus(input)
    }
    expect(status.state).toBe('ready')
    expect(status.outputPath).toBeTruthy()
    expect(await readFile(status.outputPath!, 'utf8')).toBe('fake-mp4')
    expect((await stat(status.outputPath!)).size).toBe(8)

    await manager.stop()
    const cachedStatus = await manager.getStatus(input)
    expect(cachedStatus.state).toBe('ready')
    expect(cachedStatus.outputPath).toBe(status.outputPath)
    await manager.stop()
  })
})
