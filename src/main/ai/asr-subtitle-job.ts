import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AsrJobProgress } from '../../shared/media-types.ts'
import { pathExists } from './model-manager.ts'

export type WhisperSubtitleArgs = {
  modelPath: string
  audioPath: string
  outputBase: string
  language?: string
}

export type RunAsrSubtitleJobOptions = {
  ffmpegPath: string
  whisperBinaryPath: string
  modelPath: string
  modelId: string
  mediaPath: string
  cacheDirectory: string
  language?: string
  onProgress?: (progress: AsrJobProgress) => void
}

export type RunAsrSubtitleJobResult = {
  subtitlePath: string
  subtitleSrtPath: string
}

function emitProgress(
  onProgress: ((progress: AsrJobProgress) => void) | undefined,
  progress: AsrJobProgress
): void {
  onProgress?.(progress)
}

function sanitizeFileStem(filePath: string): string {
  const stem = basename(filePath, extname(filePath))
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return stem || 'media'
}

function createCacheKey(mediaPath: string, mediaMtimeMs: number, modelId: string): string {
  return createHash('sha1').update(`${mediaPath}:${mediaMtimeMs}:${modelId}`).digest('hex').slice(0, 12)
}

function tailOutput(output: string): string {
  const normalized = output.trim()
  return normalized.length > 1800 ? normalized.slice(-1800) : normalized
}

async function runProcess(command: string, args: string[], label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${label} 失败，退出码 ${code ?? 'unknown'}：${tailOutput(output)}`))
    })
  })
}

export function buildFfmpegAudioExtractArgs(mediaPath: string, audioPath: string): string[] {
  return ['-y', '-i', mediaPath, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', audioPath]
}

export function buildWhisperSubtitleArgs(options: WhisperSubtitleArgs): string[] {
  return [
    '-m',
    options.modelPath,
    '-f',
    options.audioPath,
    '-of',
    options.outputBase,
    '-ovtt',
    '-osrt',
    '-l',
    options.language ?? 'auto'
  ]
}

export function createSubtitleOutputBase(
  cacheDirectory: string,
  mediaPath: string,
  mediaMtimeMs: number,
  modelId: string
): string {
  const safeStem = sanitizeFileStem(mediaPath)
  const cacheKey = createCacheKey(mediaPath, mediaMtimeMs, modelId)
  return join(cacheDirectory, 'subtitles', `${safeStem}-${modelId}-${cacheKey}`)
}

export function getWhisperSubtitleOutputPath(outputBase: string): string {
  return `${outputBase}.vtt`
}

export function getWhisperSubtitleSrtOutputPath(outputBase: string): string {
  return `${outputBase}.srt`
}

export async function runAsrSubtitleJob(options: RunAsrSubtitleJobOptions): Promise<RunAsrSubtitleJobResult> {
  emitProgress(options.onProgress, {
    stage: 'checking',
    percent: 0.05,
    message: '正在准备音频和字幕缓存。'
  })

  const mediaStat = await stat(options.mediaPath)
  const outputBase = createSubtitleOutputBase(
    options.cacheDirectory,
    options.mediaPath,
    mediaStat.mtimeMs,
    options.modelId
  )
  const subtitlePath = getWhisperSubtitleOutputPath(outputBase)
  const subtitleSrtPath = getWhisperSubtitleSrtOutputPath(outputBase)

  if ((await pathExists(subtitlePath)) && (await pathExists(subtitleSrtPath))) {
    emitProgress(options.onProgress, {
      stage: 'completed',
      percent: 1,
      message: '已命中本地字幕缓存（VTT / SRT）。'
    })
    return { subtitlePath, subtitleSrtPath }
  }

  await mkdir(dirname(outputBase), { recursive: true })
  const tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-asr-'))
  const audioPath = join(tempDirectory, 'audio.wav')

  try {
    emitProgress(options.onProgress, {
      stage: 'extracting-audio',
      percent: 0.18,
      message: '正在用 ffmpeg 抽取 16k 单声道音频。'
    })
    await runProcess(options.ffmpegPath, buildFfmpegAudioExtractArgs(options.mediaPath, audioPath), 'ffmpeg')

    emitProgress(options.onProgress, {
      stage: 'transcribing',
      percent: 0.42,
      message: '正在用 whisper.cpp 识别语音并生成 VTT / SRT 字幕。'
    })
    await runProcess(
      options.whisperBinaryPath,
      buildWhisperSubtitleArgs({
        modelPath: options.modelPath,
        audioPath,
        outputBase,
        language: options.language
      }),
      'whisper.cpp'
    )

    if (!(await pathExists(subtitlePath)) || !(await pathExists(subtitleSrtPath))) {
      throw new Error('whisper.cpp 已结束，但没有同时生成预期的 VTT / SRT 字幕文件。')
    }

    emitProgress(options.onProgress, {
      stage: 'completed',
      percent: 1,
      message: '字幕已生成并挂载到播放器，SRT 也已导出。'
    })

    return { subtitlePath, subtitleSrtPath }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true })
  }
}
