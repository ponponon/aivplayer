import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readAsrRuntimeSettings, saveWhisperBinaryPath } from '../../src/main/ai/asr-settings'
import { createWhisperCppRuntime } from '../../src/main/ai/whisper-cpp-runtime'

describe('ASR runtime settings', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-asr-settings-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('persists a user-selected whisper.cpp binary path', async () => {
    const binaryPath = join(tempDirectory, 'whisper-cli')

    await saveWhisperBinaryPath(tempDirectory, binaryPath)

    await expect(readAsrRuntimeSettings(tempDirectory)).resolves.toEqual({
      whisperBinaryPath: binaryPath
    })
  })

  it('uses the saved whisper.cpp binary when checking the runtime', async () => {
    const whisperBinaryPath = join(tempDirectory, 'whisper-cli')
    const ffmpegPath = join(tempDirectory, 'ffmpeg')

    await writeFile(whisperBinaryPath, '#!/bin/sh\necho "whisper.cpp mock"\n')
    await writeFile(ffmpegPath, '#!/bin/sh\necho "ffmpeg mock"\n')
    await chmod(whisperBinaryPath, 0o755)
    await chmod(ffmpegPath, 0o755)
    await saveWhisperBinaryPath(tempDirectory, whisperBinaryPath)

    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        AIVPLAYER_FFMPEG_BIN: ffmpegPath,
        AIVPLAYER_ASR_MODEL_DIR: join(tempDirectory, 'models')
      }
    })

    const status = await runtime.healthCheck()

    expect(status.binaryPath).toBe(whisperBinaryPath)
    expect(status.ffmpegPath).toBe(ffmpegPath)
    expect(status.message).toContain('模型目录暂无模型')
  })

  it('detects a whisper.cpp binary from known binary directories when PATH is empty', async () => {
    const binaryDirectory = join(tempDirectory, 'bin')
    const whisperBinaryPath = join(binaryDirectory, 'whisper-cli')
    const ffmpegPath = join(binaryDirectory, 'ffmpeg')

    await mkdir(binaryDirectory, { recursive: true })
    await writeFile(whisperBinaryPath, '#!/bin/sh\necho "whisper.cpp mock"\n')
    await writeFile(ffmpegPath, '#!/bin/sh\necho "ffmpeg mock"\n')
    await chmod(whisperBinaryPath, 0o755)
    await chmod(ffmpegPath, 0o755)

    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        PATH: '',
        AIVPLAYER_ASR_MODEL_DIR: join(tempDirectory, 'models')
      },
      extraBinaryDirectories: [binaryDirectory]
    })

    const status = await runtime.healthCheck()

    expect(status.binaryPath).toBe(whisperBinaryPath)
    expect(status.ffmpegPath).toBe(ffmpegPath)
  })

  it('persists the discovered whisper.cpp binary when auto-configuring the runtime', async () => {
    const binaryDirectory = join(tempDirectory, 'bin')
    const whisperBinaryPath = join(binaryDirectory, 'whisper-cli')
    const ffmpegPath = join(binaryDirectory, 'ffmpeg')

    await mkdir(binaryDirectory, { recursive: true })
    await writeFile(whisperBinaryPath, '#!/bin/sh\necho "whisper.cpp mock"\n')
    await writeFile(ffmpegPath, '#!/bin/sh\necho "ffmpeg mock"\n')
    await chmod(whisperBinaryPath, 0o755)
    await chmod(ffmpegPath, 0o755)

    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        PATH: '',
        AIVPLAYER_ASR_MODEL_DIR: join(tempDirectory, 'models')
      },
      extraBinaryDirectories: [binaryDirectory]
    })

    const status = await runtime.autoConfigureWhisperBinaryPath()

    expect(status.binaryPath).toBe(whisperBinaryPath)
    await expect(readAsrRuntimeSettings(tempDirectory)).resolves.toEqual({
      whisperBinaryPath
    })
  })
})
