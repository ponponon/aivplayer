import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  buildFfmpegAudioExtractArgs,
  buildWhisperSubtitleArgs,
  createSubtitleOutputBase,
  findWhisperSubtitleCache,
  getWhisperSubtitleOutputPath,
  getWhisperSubtitleSrtOutputPath,
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

  it('creates deterministic cache paths per media file and model', () => {
    const first = createSubtitleOutputBase('/cache', '/Users/me/movie.mp4', 1234, 'large-v3-turbo-q5_0')
    const second = createSubtitleOutputBase('/cache', '/Users/me/movie.mp4', 1234, 'large-v3-turbo-q5_0')

    expect(first).toBe(second)
    expect(first).toContain('/cache/subtitles/movie-large-v3-turbo-q5_0-')
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
      subtitleLanguage: 'ja'
    })
  })
})
