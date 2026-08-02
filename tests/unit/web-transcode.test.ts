import { access, chmod, mkdir, mkdtemp, readFile, stat, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WebTranscodeManager, type WebTranscodeInput, type WebTranscodeJobState, type WebTranscodeJobStatus } from '../../src/core/media/web-transcode'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('WebTranscodeManager', () => {
  async function waitForState(manager: WebTranscodeManager, input: WebTranscodeInput, expected: WebTranscodeJobState): Promise<WebTranscodeJobStatus> {
    let status = await manager.getStatus(input)
    for (let attempt = 0; attempt < 200 && status.state !== expected; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      status = await manager.getStatus(input)
    }
    expect(status.state).toBe(expected)
    return status
  }

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
    const staleOutputPath = join(directory, 'cache', 'stale.mp4')
    const staleMetadataPath = join(directory, 'cache', 'stale.json')
    const stalePartialPath = join(directory, 'cache', 'stale.part.mp4')
    await writeFile(sourcePath, 'source')
    await mkdir(join(directory, 'cache'), { recursive: true })
    await writeFile(staleOutputPath, 'stale')
    await writeFile(staleMetadataPath, '{}')
    await writeFile(stalePartialPath, 'partial')
    await writeFile(fakeFfmpegPath, '#!/bin/sh\nout=""\nfor arg in "$@"; do out="$arg"; done\nprintf "out_time_ms=1000000\\nprogress=end\\n" >&2\nprintf "fake-mp4" > "$out"\n')
    await chmod(fakeFfmpegPath, 0o755)
    const manager = new WebTranscodeManager({ cacheRoot: join(directory, 'cache'), getFfmpegPath: async () => fakeFfmpegPath, maxCacheAgeMs: -1 })
    const input: WebTranscodeInput = { id: 'cache-hit', sourcePath, durationSeconds: 2 }

    await manager.start(input)
    await expect(access(staleOutputPath)).rejects.toThrow()
    await expect(access(staleMetadataPath)).rejects.toThrow()
    await expect(access(stalePartialPath)).rejects.toThrow()
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

    await writeFile(sourcePath, 'changed-source')
    const changedStart = await manager.start(input)
    expect(changedStart.state).toBe('queued')
    let changedStatus = await manager.getStatus(input)
    for (let attempt = 0; attempt < 200 && changedStatus.state !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      changedStatus = await manager.getStatus(input)
    }
    expect(changedStatus.state).toBe('ready')
    expect(changedStatus.outputPath).not.toBe(status.outputPath)
    await manager.stop()
  })

  it.skipIf(process.platform === 'win32')('queues concurrent requests to protect local resources', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-web-transcode-queue-'))
    temporaryDirectories.push(directory)
    const firstSourcePath = join(directory, 'first.mkv')
    const secondSourcePath = join(directory, 'second.mkv')
    const fakeFfmpegPath = join(directory, 'fake-ffmpeg')
    await writeFile(firstSourcePath, 'first-source')
    await writeFile(secondSourcePath, 'second-source')
    await writeFile(fakeFfmpegPath, '#!/bin/sh\nout=""\nfor arg in "$@"; do out="$arg"; done\nprintf "running" > "$out.running"\nsleep 1\nprintf "fake-mp4" > "$out"\nrm -f "$out.running"\nprintf "out_time_ms=1000000\\nprogress=end\\n" >&2\n')
    await chmod(fakeFfmpegPath, 0o755)
    const manager = new WebTranscodeManager({ cacheRoot: join(directory, 'cache'), getFfmpegPath: async () => fakeFfmpegPath, maxConcurrentJobs: 1 })
    const firstInput: WebTranscodeInput = { id: 'queue-first', sourcePath: firstSourcePath, durationSeconds: 2 }
    const secondInput: WebTranscodeInput = { id: 'queue-second', sourcePath: secondSourcePath, durationSeconds: 2 }

    expect((await manager.start(firstInput)).state).toBe('queued')
    expect((await manager.start(secondInput)).state).toBe('queued')
    await waitForState(manager, firstInput, 'running')
    expect((await manager.getStatus(secondInput)).state).toBe('queued')
    await waitForState(manager, firstInput, 'ready')
    await waitForState(manager, secondInput, 'running')
    await waitForState(manager, secondInput, 'ready')
    await manager.stop()
  })

  it('rejects a transcode when the cache volume has insufficient free space', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-web-transcode-disk-'))
    temporaryDirectories.push(directory)
    const sourcePath = join(directory, 'source.mkv')
    await writeFile(sourcePath, 'source')
    const manager = new WebTranscodeManager({
      cacheRoot: join(directory, 'cache'),
      getFfmpegPath: async () => '/not-used/ffmpeg',
      getAvailableBytes: async () => 1,
      minFreeBytes: 1024
    })

    await expect(manager.start({ id: 'disk-space', sourcePath, durationSeconds: null })).rejects.toThrow('磁盘空间不足')
    await manager.stop()
  })
})
