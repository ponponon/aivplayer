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
    const ffprobeSource = join(sourceDirectory, 'ffprobe')

    await mkdir(sourceDirectory, { recursive: true })
    await writeFile(whisperSource, '#!/bin/sh\necho whisper\n')
    await writeFile(ffmpegSource, '#!/bin/sh\necho ffmpeg\n')
    await writeFile(ffprobeSource, '#!/bin/sh\necho ffprobe\n')
    await chmod(whisperSource, 0o755)
    await chmod(ffmpegSource, 0o755)
    await chmod(ffprobeSource, 0o755)

    const result = await prepareAsrRuntime({
      resourcePath,
      platform: 'darwin',
      whisperBinaryPath: whisperSource,
      ffmpegBinaryPath: ffmpegSource
    })

    expect(result.ok).toBe(true)
    expect(result.whisperBinaryPath).toBe(join(resourcePath, 'whisper.cpp', 'whisper-cli'))
    expect(result.ffmpegPath).toBe(join(resourcePath, 'ffmpeg', 'ffmpeg'))
    expect(result.ffprobePath).toBe(join(resourcePath, 'ffmpeg', 'ffprobe'))
    await expect(readFile(result.whisperBinaryPath, 'utf-8')).resolves.toContain('whisper')
    await expect(readFile(result.ffmpegPath, 'utf-8')).resolves.toContain('ffmpeg')
    await expect(readFile(result.ffprobePath, 'utf-8')).resolves.toContain('ffprobe')

    const check = await checkBundledAsrRuntime({ resourcePath, platform: 'darwin' })
    expect(check.ok).toBe(true)
  })

  it('preserves recognized whisper binary names when staging runtime resources', async () => {
    const sourceDirectory = join(tempDirectory, 'source')
    const resourcePath = join(tempDirectory, 'resources')
    const whisperSource = join(sourceDirectory, 'whisper-whisper-cli')
    const ffmpegSource = join(sourceDirectory, 'ffmpeg')
    const ffprobeSource = join(sourceDirectory, 'ffprobe')

    await mkdir(sourceDirectory, { recursive: true })
    await writeFile(whisperSource, '#!/bin/sh\necho whisper\n')
    await writeFile(ffmpegSource, '#!/bin/sh\necho ffmpeg\n')
    await writeFile(ffprobeSource, '#!/bin/sh\necho ffprobe\n')
    await chmod(whisperSource, 0o755)
    await chmod(ffmpegSource, 0o755)
    await chmod(ffprobeSource, 0o755)

    const result = await prepareAsrRuntime({
      resourcePath,
      platform: 'darwin',
      whisperBinaryPath: whisperSource,
      ffmpegBinaryPath: ffmpegSource
    })

    expect(result.ok).toBe(true)
    expect(result.whisperBinaryPath).toBe(join(resourcePath, 'whisper.cpp', 'whisper-whisper-cli'))
    await expect(readFile(result.whisperBinaryPath, 'utf-8')).resolves.toContain('whisper')

    const check = await checkBundledAsrRuntime({ resourcePath, platform: 'darwin' })
    expect(check.ok).toBe(true)
    expect(check.whisperBinaryPath).toBe(result.whisperBinaryPath)
  })

  it('prefers the newer whisper binary name when both old and new executables exist in a source directory', async () => {
    const sourceDirectory = join(tempDirectory, 'source')
    const resourcePath = join(tempDirectory, 'resources')
    const oldWhisperSource = join(sourceDirectory, 'whisper-cli')
    const newWhisperSource = join(sourceDirectory, 'whisper-whisper-cli')
    const ffmpegSource = join(sourceDirectory, 'ffmpeg')
    const ffprobeSource = join(sourceDirectory, 'ffprobe')

    await mkdir(sourceDirectory, { recursive: true })
    await writeFile(oldWhisperSource, '#!/bin/sh\necho old whisper\n')
    await writeFile(newWhisperSource, '#!/bin/sh\necho new whisper\n')
    await writeFile(ffmpegSource, '#!/bin/sh\necho ffmpeg\n')
    await writeFile(ffprobeSource, '#!/bin/sh\necho ffprobe\n')
    await chmod(oldWhisperSource, 0o755)
    await chmod(newWhisperSource, 0o755)
    await chmod(ffmpegSource, 0o755)
    await chmod(ffprobeSource, 0o755)

    const result = await prepareAsrRuntime({
      resourcePath,
      platform: 'darwin',
      whisperDirectory: sourceDirectory,
      ffmpegBinaryPath: ffmpegSource
    })

    expect(result.ok).toBe(true)
    expect(result.whisperBinaryPath).toBe(join(resourcePath, 'whisper.cpp', 'whisper-whisper-cli'))
    await expect(readFile(result.whisperBinaryPath, 'utf-8')).resolves.toContain('new whisper')
  })

  it('copies whisper.cpp sidecar runtime libraries from a build directory', async () => {
    const whisperDirectory = join(tempDirectory, 'whisper-build')
    const ffmpegDirectory = join(tempDirectory, 'ffmpeg-build')
    const resourcePath = join(tempDirectory, 'resources')
    const whisperSource = join(whisperDirectory, 'whisper-cli')
    const whisperSidecar = join(whisperDirectory, 'libggml.dylib')
    const ignoredFile = join(whisperDirectory, 'notes.txt')
    const ffmpegSource = join(ffmpegDirectory, 'ffmpeg')
    const ffprobeSource = join(ffmpegDirectory, 'ffprobe')

    await mkdir(whisperDirectory, { recursive: true })
    await mkdir(ffmpegDirectory, { recursive: true })
    await writeFile(whisperSource, '#!/bin/sh\necho whisper\n')
    await writeFile(whisperSidecar, 'sidecar')
    await writeFile(ignoredFile, 'not needed in release resources')
    await writeFile(ffmpegSource, '#!/bin/sh\necho ffmpeg\n')
    await writeFile(ffprobeSource, '#!/bin/sh\necho ffprobe\n')
    await chmod(whisperSource, 0o755)
    await chmod(ffmpegSource, 0o755)
    await chmod(ffprobeSource, 0o755)

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
