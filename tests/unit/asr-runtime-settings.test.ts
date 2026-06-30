import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

  it('uses the compact whisper version output instead of help text in the runtime status message', async () => {
    const binaryDirectory = join(tempDirectory, 'bin')
    const whisperBinaryPath = join(binaryDirectory, 'whisper-cli')
    const ffmpegPath = join(binaryDirectory, 'ffmpeg')
    const modelDirectory = join(tempDirectory, 'models')
    const modelPath = join(modelDirectory, 'ggml-large-v3-turbo-q5_0.bin')

    await mkdir(binaryDirectory, { recursive: true })
    await mkdir(modelDirectory, { recursive: true })
    await writeFile(
      whisperBinaryPath,
      [
        '#!/bin/sh',
        'case "$1" in',
        '  --version)',
        '    echo "whisper.cpp version: 9.9.9"',
        '    exit 0',
        '    ;;',
        '  --help)',
        '    echo "usage: /very/long/path/to/whisper-cli [options] file0 file1 ..."',
        '    exit 0',
        '    ;;',
        'esac',
        'exit 1'
      ].join('\n')
    )
    await writeFile(ffmpegPath, '#!/bin/sh\necho "ffmpeg mock"\n')
    await writeFile(modelPath, 'mock model')
    await chmod(whisperBinaryPath, 0o755)
    await chmod(ffmpegPath, 0o755)

    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        PATH: '',
        AIVPLAYER_ASR_MODEL_DIR: modelDirectory
      },
      extraBinaryDirectories: [binaryDirectory]
    })

    const status = await runtime.healthCheck()

    expect(status.available).toBe(true)
    expect(status.message).toBe('已检测到 whisper.cpp：9.9.9')
    expect(status.message).not.toContain('usage:')
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

  it('prefers the replacement whisper binary when the selected whisper-cli is only a deprecation wrapper', async () => {
    const binaryDirectory = join(tempDirectory, 'bin')
    const deprecatedWhisperBinaryPath = join(binaryDirectory, 'whisper-cli')
    const replacementWhisperBinaryPath = join(binaryDirectory, 'whisper-whisper-cli')
    const ffmpegPath = join(binaryDirectory, 'ffmpeg')

    await mkdir(binaryDirectory, { recursive: true })
    await writeFile(
      deprecatedWhisperBinaryPath,
      [
        '#!/bin/sh',
        "echo \"WARNING: The binary 'whisper-cli' is deprecated.\" >&2",
        "echo \" Please use 'whisper-whisper-cli' instead.\" >&2",
        'exit 1'
      ].join('\n')
    )
    await writeFile(replacementWhisperBinaryPath, '#!/bin/sh\necho "whisper.cpp replacement mock"\n')
    await writeFile(ffmpegPath, '#!/bin/sh\necho "ffmpeg mock"\n')
    await chmod(deprecatedWhisperBinaryPath, 0o755)
    await chmod(replacementWhisperBinaryPath, 0o755)
    await chmod(ffmpegPath, 0o755)
    await saveWhisperBinaryPath(tempDirectory, deprecatedWhisperBinaryPath)

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

    expect(status.binaryPath).toBe(replacementWhisperBinaryPath)

    await runtime.autoConfigureWhisperBinaryPath()

    await expect(readAsrRuntimeSettings(tempDirectory)).resolves.toEqual({
      whisperBinaryPath: replacementWhisperBinaryPath
    })
  })

  it('exports an SRT file from a VTT subtitle file', async () => {
    const subtitleDirectory = join(tempDirectory, 'subtitles')
    const vttPath = join(subtitleDirectory, 'demo.vtt')
    const srtPath = join(subtitleDirectory, 'demo.srt')

    await mkdir(subtitleDirectory, { recursive: true })
    await writeFile(vttPath, 'WEBVTT\n\nintro\n00:00:00.000 --> 00:00:01.250\nhello world\n')

    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources')
    })

    const result = await runtime.exportSubtitleSrt({ subtitlePath: vttPath })

    expect(result.success).toBe(true)
    expect(result.subtitleSrtPath).toBe(srtPath)
    await expect(readFile(srtPath, 'utf8')).resolves.toBe(
      '1\n00:00:00,000 --> 00:00:01,250\nhello world\n'
    )
  })
})
