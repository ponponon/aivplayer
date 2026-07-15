import { chmod, mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  buildFfmpegAudioExtractArgs,
  buildWhisperSubtitleArgs,
  createSubtitleOutputBase,
  findWhisperSubtitleCache,
  getLegacyWhisperSubtitleOutputPaths,
  getWhisperSubtitleOutputPath,
  getWhisperSubtitleSrtOutputPath,
  isWhisperGpuResourceFailure,
  readWhisperSubtitleLanguage,
  runAsrSubtitleJob
} from '../../src/main/ai/asr-subtitle-job'

describe('ASR subtitle job command planning', () => {
  it('extracts video audio into 16 kHz mono wav for ASR', () => {
    expect(buildFfmpegAudioExtractArgs('/video/input.mp4', '/tmp/audio.wav')).toEqual([
      '-y',
      '-i',
      '/video/input.mp4',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'wav',
      '/tmp/audio.wav'
    ])
  })

  it('asks whisper.cpp to create both VTT and SRT subtitle files with auto language detection', () => {
    expect(
      buildWhisperSubtitleArgs({
        modelPath: '/models/ggml-large-v3-turbo-q5_0.bin',
        audioPath: '/tmp/audio.wav',
        outputBase: '/tmp/subtitle',
        language: 'auto'
      })
    ).toEqual([
      '-m',
      '/models/ggml-large-v3-turbo-q5_0.bin',
      '-f',
      '/tmp/audio.wav',
      '-of',
      '/tmp/subtitle',
      '-ovtt',
      '-osrt',
      '-oj',
      '-l',
      'auto'
    ])
  })

  it('can append the whisper.cpp CPU fallback flag without changing the default command', () => {
    expect(
      buildWhisperSubtitleArgs({
        modelPath: '/models/model.bin',
        audioPath: '/tmp/audio.wav',
        outputBase: '/tmp/subtitle',
        disableGpu: true
      }).at(-1)
    ).toBe('-ng')
  })

  it('only classifies Metal buffer allocation crashes as GPU resource failures', () => {
    expect(
      isWhisperGpuResourceFailure({
        exitCode: 139,
        signal: 'SIGSEGV',
        output: 'ggml_metal_buffer_init: error: failed to allocate buffer'
      })
    ).toBe(true)
    expect(
      isWhisperGpuResourceFailure({
        exitCode: 1,
        output: 'whisper.cpp failed to parse the media'
      })
    ).toBe(false)
  })

  it('creates deterministic cache paths per media file and model', () => {
    const first = createSubtitleOutputBase('/cache', '/Users/me/movie.mp4', 1234, 'large-v3-turbo-q5_0')
    const second = createSubtitleOutputBase('/cache', '/Users/me/movie.mp4', 1234, 'large-v3-turbo-q5_0')

    expect(first).toBe(second)
    expect(first).toContain('/cache/subtitles/movie-large-v3-turbo-q5_0-')
    expect(first).toMatch(/-raw$/)
    expect(getWhisperSubtitleOutputPath(first)).toBe(`${first}.vtt`)
    expect(getWhisperSubtitleSrtOutputPath(first)).toBe(`${first}.srt`)
  })

  it('finds cached VTT and SRT subtitles for the same media file and model', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-cache-'))
    const mediaPath = join(cacheDirectory, 'video.mp4')
    await writeFile(mediaPath, 'video')

    const mediaStat = await stat(mediaPath)
    const outputBase = createSubtitleOutputBase(
      cacheDirectory,
      mediaPath,
      mediaStat.mtimeMs,
      'large-v3-turbo-q5_0'
    )

    await mkdir(join(cacheDirectory, 'subtitles'), { recursive: true })
    await writeFile(getWhisperSubtitleOutputPath(outputBase), 'WEBVTT\n\n00:00.000 --> 00:01.000\nhello\n')
    await writeFile(getWhisperSubtitleSrtOutputPath(outputBase), '1\n00:00:00,000 --> 00:00:01,000\nhello\n')

    await expect(
      findWhisperSubtitleCache({
        cacheDirectory,
        mediaPath,
        modelId: 'large-v3-turbo-q5_0'
      })
    ).resolves.toMatchObject({
      subtitlePath: getWhisperSubtitleOutputPath(outputBase),
      subtitleSrtPath: getWhisperSubtitleSrtOutputPath(outputBase)
    })
  })

  it('promotes legacy raw subtitle caches to the explicitly marked filename', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-legacy-cache-'))
    const mediaPath = join(cacheDirectory, 'video.mp4')
    const modelId = 'large-v3-turbo-q5_0'
    await writeFile(mediaPath, 'video')

    const mediaStat = await stat(mediaPath)
    const legacyPaths = getLegacyWhisperSubtitleOutputPaths(cacheDirectory, mediaPath, mediaStat.mtimeMs, modelId)
    await mkdir(join(cacheDirectory, 'subtitles'), { recursive: true })
    await writeFile(legacyPaths.subtitlePath, 'WEBVTT\n\n00:00.000 --> 00:01.000\nhello\n')
    await writeFile(legacyPaths.subtitleSrtPath, '1\n00:00:00,000 --> 00:01:00,000\nhello\n')
    await writeFile(
      `${legacyPaths.outputBase}.json`,
      JSON.stringify({ result: { language: 'en' } })
    )

    const resolved = await findWhisperSubtitleCache({
      cacheDirectory,
      mediaPath,
      modelId
    })

    expect(resolved?.subtitlePath).toMatch(/-raw\.vtt$/)
    expect(resolved?.subtitleSrtPath).toMatch(/-raw\.srt$/)
    await expect(stat(resolved?.subtitlePath ?? '')).resolves.toBeTruthy()
    await expect(readWhisperSubtitleLanguage(resolved?.outputBase ?? '')).resolves.toBe('en')
  })

  it('reads the whisper.cpp subtitle language from the JSON sidecar', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-cache-'))
    const outputBase = join(cacheDirectory, 'subtitles', 'demo-large-v3-turbo-q5_0-123456789abc')
    const jsonPath = `${outputBase}.json`

    await mkdir(join(cacheDirectory, 'subtitles'), { recursive: true })
    await writeFile(
      jsonPath,
      JSON.stringify(
        {
          result: {
            language: 'ja'
          }
        },
        null,
        2
      )
    )

    await expect(readWhisperSubtitleLanguage(outputBase)).resolves.toBe('ja')
  })

  it('returns the cached subtitle language when the ASR job hits an existing cache', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-cache-'))
    const mediaPath = join(cacheDirectory, 'video.mp4')
    const modelId = 'large-v3-turbo-q5_0'

    await writeFile(mediaPath, 'video')

    const mediaStat = await stat(mediaPath)
    const outputBase = createSubtitleOutputBase(cacheDirectory, mediaPath, mediaStat.mtimeMs, modelId)

    await mkdir(join(cacheDirectory, 'subtitles'), { recursive: true })
    await writeFile(getWhisperSubtitleOutputPath(outputBase), 'WEBVTT\n\n00:00.000 --> 00:01.000\nhello\n')
    await writeFile(getWhisperSubtitleSrtOutputPath(outputBase), '1\n00:00:00,000 --> 00:00:01,000\nhello\n')
    await writeFile(
      `${outputBase}.json`,
      JSON.stringify(
        {
          result: {
            language: 'ja'
          }
        },
        null,
        2
      )
    )

    await expect(
      runAsrSubtitleJob({
        ffmpegPath: '/bin/true',
        whisperBinaryPath: '/bin/true',
        modelPath: '/models/ggml-large-v3-turbo-q5_0.bin',
        modelId,
        mediaPath,
        cacheDirectory
      })
    ).resolves.toMatchObject({
      subtitlePath: getWhisperSubtitleOutputPath(outputBase),
      subtitleSrtPath: getWhisperSubtitleSrtOutputPath(outputBase),
      subtitleLanguage: 'ja',
      generationStats: {
        subtitleCueCount: 1,
        cacheHit: true
      }
    })
  })

  it('retries whisper.cpp with CPU when the GPU process crashes during Metal allocation', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-gpu-fallback-'))
    const mediaPath = join(cacheDirectory, 'video.mp4')
    const ffmpegPath = join(cacheDirectory, 'mock-ffmpeg')
    const whisperPath = join(cacheDirectory, 'mock-whisper')

    await writeFile(mediaPath, 'video')
    await writeFile(
      ffmpegPath,
      `#!${process.execPath}\nconst fs = require('node:fs')\nfs.writeFileSync(process.argv.at(-1), 'wav')\n`
    )
    await writeFile(
      whisperPath,
      `#!${process.execPath}\nconst fs = require('node:fs')\nconst args = process.argv.slice(2)\nconst outputBase = args[args.indexOf('-of') + 1]\nif (!args.includes('-ng')) {\n  process.stderr.write('ggml_metal_buffer_init: error: failed to allocate buffer')\n  process.exit(139)\n}\nfs.writeFileSync(outputBase + '.vtt', 'WEBVTT\\n\\n00:00.000 --> 00:01.000\\nhello\\n')\nfs.writeFileSync(outputBase + '.srt', '1\\n00:00:00,000 --> 00:00:01,000\\nhello\\n')\nfs.writeFileSync(outputBase + '.json', JSON.stringify({ result: { language: 'en' } }))\n`
    )
    await chmod(ffmpegPath, 0o755)
    await chmod(whisperPath, 0o755)

    await expect(
      runAsrSubtitleJob({
        ffmpegPath,
        whisperBinaryPath: whisperPath,
        modelPath: '/models/model.bin',
        modelId: 'large-v3-turbo-q5_0',
        mediaPath,
        cacheDirectory
      })
    ).resolves.toMatchObject({
      subtitleLanguage: 'en',
      generationStats: {
        subtitleCueCount: 1,
        cacheHit: false
      }
    })
  })
})
