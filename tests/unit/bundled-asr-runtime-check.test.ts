import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkBundledAsrRuntime } from '../../scripts/check-bundled-asr-runtime'

describe('bundled ASR runtime check', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-bundled-runtime-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('passes when whisper.cpp and ffmpeg binaries are staged in resources', async () => {
    const whisperPath = join(tempDirectory, 'whisper.cpp', 'whisper-cli')
    const ffmpegPath = join(tempDirectory, 'ffmpeg', 'ffmpeg')

    await mkdir(join(tempDirectory, 'whisper.cpp'), { recursive: true })
    await mkdir(join(tempDirectory, 'ffmpeg'), { recursive: true })
    await writeFile(whisperPath, '#!/bin/sh\necho "whisper.cpp mock"\n')
    await writeFile(ffmpegPath, '#!/bin/sh\necho "ffmpeg mock"\n')
    await chmod(whisperPath, 0o755)
    await chmod(ffmpegPath, 0o755)

    const result = await checkBundledAsrRuntime({ resourcePath: tempDirectory })

    expect(result.ok).toBe(true)
    expect(result.whisperBinaryPath).toBe(whisperPath)
    expect(result.ffmpegPath).toBe(ffmpegPath)
    expect(result.missing).toEqual([])
  })

  it('reports missing runtime components before release packaging', async () => {
    const result = await checkBundledAsrRuntime({ resourcePath: tempDirectory })

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['whisper.cpp', 'ffmpeg'])
    expect(result.message).toContain('resources/whisper.cpp')
    expect(result.message).toContain('resources/ffmpeg')
  })
})
