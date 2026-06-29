import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkBundledAsrRuntime } from '../../scripts/check-bundled-asr-runtime'
import { prepareAsrRuntime } from '../../scripts/prepare-asr-runtime'

describe('prepare ASR runtime', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-prepare-runtime-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('stages explicit whisper.cpp and ffmpeg binaries with release-friendly names', async () => {
    const sourceDirectory = join(tempDirectory, 'source')
    const resourcePath = join(tempDirectory, 'resources')
    const whisperSource = join(sourceDirectory, 'custom-whisper')
    const ffmpegSource = join(sourceDirectory, 'custom-ffmpeg')

    await mkdir(sourceDirectory, { recursive: true })
    await writeFile(whisperSource, '#!/bin/sh\necho whisper\n')
    await writeFile(ffmpegSource, '#!/bin/sh\necho ffmpeg\n')
    await chmod(whisperSource, 0o755)
    await chmod(ffmpegSource, 0o755)

    const result = await prepareAsrRuntime({
      resourcePath,
      platform: 'darwin',
      whisperBinaryPath: whisperSource,
      ffmpegBinaryPath: ffmpegSource
    })

    expect(result.ok).toBe(true)
    expect(result.whisperBinaryPath).toBe(join(resourcePath, 'whisper.cpp', 'whisper-cli'))
    expect(result.ffmpegPath).toBe(join(resourcePath, 'ffmpeg', 'ffmpeg'))
    await expect(readFile(result.whisperBinaryPath, 'utf-8')).resolves.toContain('whisper')
    await expect(readFile(result.ffmpegPath, 'utf-8')).resolves.toContain('ffmpeg')

    const check = await checkBundledAsrRuntime({ resourcePath, platform: 'darwin' })
    expect(check.ok).toBe(true)
  })

  it('copies whisper.cpp sidecar runtime libraries from a build directory', async () => {
    const whisperDirectory = join(tempDirectory, 'whisper-build')
    const ffmpegDirectory = join(tempDirectory, 'ffmpeg-build')
    const resourcePath = join(tempDirectory, 'resources')
    const whisperSource = join(whisperDirectory, 'whisper-cli')
    const whisperSidecar = join(whisperDirectory, 'libggml.dylib')
    const ignoredFile = join(whisperDirectory, 'notes.txt')
    const ffmpegSource = join(ffmpegDirectory, 'ffmpeg')

    await mkdir(whisperDirectory, { recursive: true })
    await mkdir(ffmpegDirectory, { recursive: true })
    await writeFile(whisperSource, '#!/bin/sh\necho whisper\n')
    await writeFile(whisperSidecar, 'sidecar')
    await writeFile(ignoredFile, 'not needed in release resources')
    await writeFile(ffmpegSource, '#!/bin/sh\necho ffmpeg\n')
    await chmod(whisperSource, 0o755)
    await chmod(ffmpegSource, 0o755)

    const result = await prepareAsrRuntime({
      resourcePath,
      platform: 'darwin',
      whisperDirectory,
      ffmpegDirectory
    })

    expect(result.ok).toBe(true)
    await expect(access(join(resourcePath, 'whisper.cpp', 'libggml.dylib'), constants.F_OK)).resolves.toBeUndefined()
    await expect(access(join(resourcePath, 'whisper.cpp', 'notes.txt'), constants.F_OK)).rejects.toThrow()
  })
})
