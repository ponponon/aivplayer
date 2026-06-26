import { describe, expect, it } from 'vitest'
import {
  buildFfmpegAudioExtractArgs,
  buildWhisperSubtitleArgs,
  createSubtitleOutputBase,
  getWhisperSubtitleOutputPath
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

  it('asks whisper.cpp to create a VTT subtitle file with auto language detection', () => {
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
  })
})
