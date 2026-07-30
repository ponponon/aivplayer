import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  buildFfmpegAudioExtractArgs,
  buildWhisperSubtitleArgs,
  createSubtitleOutputBase,
  findWhisperSubtitleCache,
  getLegacyWhisperSubtitleOutputPaths,
  getWhisperSubtitlePartialOutputPaths,
  getWhisperSubtitleOutputPath,
  getWhisperSubtitleSrtOutputPath,
  isWhisperGpuResourceFailure,
  parseWhisperSegmentLine,
  readWhisperSubtitleLanguage,
  runAsrSubtitleJob
} from '../../src/core/ai/asr-subtitle-job'
import { getAsrPriorityWindow } from '../../src/shared/asr-types'

describe('ASR subtitle job command planning', () => {
  it('parses live whisper segment output into a timed transcript segment', () => {
    expect(parseWhisperSegmentLine('[01:02:03.400 --> 01:02:05.800]  Hello <world>')).toEqual({
      startSeconds: 3723.4,
      endSeconds: 3725.8,
      text: 'Hello <world>'
    })
    expect(parseWhisperSegmentLine('read_audio_data: reading audio data')).toBeNull()
  })

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
      '-ojf',
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

  it('adds an offset and duration when planning a priority recognition window', () => {
    expect(
      buildWhisperSubtitleArgs({
        modelPath: '/models/model.bin',
        audioPath: '/tmp/audio.wav',
        outputBase: '/tmp/subtitle',
        offsetSeconds: 123.456,
        durationSeconds: 60
      }).slice(-4)
    ).toEqual(['-ot', '123456', '-d', '60000'])
  })

  it('selects a bounded priority window around the current playback position', () => {
    expect(getAsrPriorityWindow(12, 5096)).toBeNull()
    expect(getAsrPriorityWindow(600, 5096)).toEqual({ startSeconds: 585, durationSeconds: 60, endSeconds: 645 })
    expect(getAsrPriorityWindow(5090, 5096)).toEqual({ startSeconds: 5036, durationSeconds: 60, endSeconds: 5096 })
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

  it('publishes partial VTT and SRT files while whisper is still running', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-partial-asr-'))
    const mediaPath = join(cacheDirectory, 'video.mp4')
    const ffmpegPath = join(cacheDirectory, 'mock-ffmpeg')
    const whisperPath = join(cacheDirectory, 'mock-whisper')
    const progress: Array<{ partialSubtitlePath?: string; partialSubtitleCueCount?: number }> = []

    await writeFile(mediaPath, 'video')
    await writeFile(
      ffmpegPath,
      `#!${process.execPath}\nconst fs = require('node:fs')\nfs.writeFileSync(process.argv.at(-1), 'wav')\n`
    )
    await writeFile(
      whisperPath,
      `#!${process.execPath}\nconst fs = require('node:fs')\nconst args = process.argv.slice(2)\nconst outputBase = args[args.indexOf('-of') + 1]\nprocess.stdout.write('[00:00:00.000 --> 00:00:01.000] first\\n')\nsetTimeout(() => {\n  process.stdout.write('[00:00:01.000 --> 00:00:02.000] second\\n')\n  setTimeout(() => {\n    fs.writeFileSync(outputBase + '.vtt', 'WEBVTT\\n\\n00:00.000 --> 00:02.000\\nfirst second\\n')\n    fs.writeFileSync(outputBase + '.srt', '1\\n00:00:00,000 --> 00:00:02,000\\nfirst second\\n')\n    fs.writeFileSync(outputBase + '.json', JSON.stringify({ result: { language: 'en' } }))\n  }, 80)\n}, 450)\n`
    )
    await chmod(ffmpegPath, 0o755)
    await chmod(whisperPath, 0o755)

    const result = await runAsrSubtitleJob({
      ffmpegPath,
      whisperBinaryPath: whisperPath,
      modelPath: '/models/model.bin',
      modelId: 'large-v3-turbo-q5_0',
      mediaPath,
      cacheDirectory,
      onProgress: (nextProgress) => {
        if (nextProgress.partialSubtitlePath) {
          progress.push(nextProgress)
        }
      }
    })

    expect(progress.length).toBeGreaterThan(0)
    expect(progress.some((item) => item.partialSubtitleCueCount === 1)).toBe(true)
    expect(await readFile(result.subtitlePath, 'utf8')).toContain('first second')
    const partialPaths = getWhisperSubtitlePartialOutputPaths(result.subtitlePath.slice(0, -4))
    await expect(readFile(partialPaths.subtitlePath, 'utf8')).rejects.toThrow()
  })

  it('recognizes a priority window before starting the full subtitle pass', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-priority-asr-'))
    const mediaPath = join(cacheDirectory, 'video.mp4')
    const ffmpegPath = join(cacheDirectory, 'mock-ffmpeg')
    const whisperPath = join(cacheDirectory, 'mock-whisper')
    const callLogPath = join(cacheDirectory, 'whisper-calls.log')
    const progress: Array<{ prioritySubtitleReady?: boolean; prioritySubtitlePath?: string }> = []
    let priorityContent = ''

    await writeFile(mediaPath, 'video')
    await writeFile(
      ffmpegPath,
      `#!${process.execPath}\nconst fs = require('node:fs')\nfs.writeFileSync(process.argv.at(-1), 'wav')\n`
    )
    await writeFile(
      whisperPath,
      `#!${process.execPath}
const fs = require('node:fs')
const args = process.argv.slice(2)
const outputBase = args[args.indexOf('-of') + 1]
const priority = args.includes('-ot')
fs.appendFileSync(${JSON.stringify(callLogPath)}, args.join(' ') + '\\n')
const text = priority ? 'priority cue' : 'full cue'
fs.writeFileSync(outputBase + '.vtt', 'WEBVTT\\n\\n00:02:00.000 --> 00:02:01.000\\n' + text + '\\n')
fs.writeFileSync(outputBase + '.srt', '1\\n00:02:00,000 --> 00:02:01,000\\n' + text + '\\n')
fs.writeFileSync(outputBase + '.json', JSON.stringify({ result: { language: 'en' } }))
`
    )
    await chmod(ffmpegPath, 0o755)
    await chmod(whisperPath, 0o755)

    const result = await runAsrSubtitleJob({
      ffmpegPath,
      whisperBinaryPath: whisperPath,
      modelPath: '/models/model.bin',
      modelId: 'large-v3-turbo-q5_0',
      mediaPath,
      cacheDirectory,
      priorityWindow: { startSeconds: 120, durationSeconds: 60, endSeconds: 180 },
      onProgress: async (nextProgress) => {
        progress.push(nextProgress)
        if (nextProgress.prioritySubtitleReady && nextProgress.prioritySubtitlePath) {
          priorityContent = await readFile(nextProgress.prioritySubtitlePath, 'utf8')
        }
      }
    })

    const calls = (await readFile(callLogPath, 'utf8')).trim().split(/\r?\n/)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('-ot 120000 -d 60000')
    expect(calls[1]).not.toContain('-ot')
    expect(progress.some((item) => item.prioritySubtitleReady)).toBe(true)
    expect(priorityContent).toContain('priority cue')
    await expect(readFile(result.subtitlePath, 'utf8')).resolves.toContain('full cue')
  })
})
