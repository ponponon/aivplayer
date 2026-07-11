import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AsrJobProgress } from '../../shared/media-types.ts'
import type { AppLocale } from '../../shared/localization'
import { getAppCopy } from '../../shared/i18n'
import { pathExists } from './model-manager.ts'

export type WhisperSubtitleArgs = {
  modelPath: string
  audioPath: string
  outputBase: string
  language?: string
  disableGpu?: boolean
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
  getLocale?: () => AppLocale
}

export type RunAsrSubtitleJobResult = {
  subtitlePath: string
  subtitleSrtPath: string
  subtitleLanguage?: string
}

export type WhisperSubtitleOutputPaths = {
  outputBase: string
  subtitlePath: string
  subtitleSrtPath: string
}

export type WhisperSubtitleCacheQuery = {
  cacheDirectory: string
  mediaPath: string
  modelId: string
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

type ProcessExecutionError = Error & {
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  output?: string
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
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      const error = new Error(
        `${label} 失败，退出码 ${code ?? 'unknown'}${signal ? `，信号 ${signal}` : ''}：${tailOutput(output)}`
      ) as ProcessExecutionError
      error.exitCode = code
      error.signal = signal
      error.output = output
      reject(error)
    })
  })
}

export function buildFfmpegAudioExtractArgs(mediaPath: string, audioPath: string): string[] {
  return ['-y', '-i', mediaPath, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', audioPath]
}

export function buildWhisperSubtitleArgs(options: WhisperSubtitleArgs): string[] {
  const args = [
    '-m',
    options.modelPath,
    '-f',
    options.audioPath,
    '-of',
    options.outputBase,
    '-ovtt',
    '-osrt',
    '-oj',
    '-l',
    options.language ?? 'auto'
  ]

  if (options.disableGpu) {
    args.push('-ng')
  }

  return args
}

export function isWhisperGpuResourceFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as ProcessExecutionError
  const output = candidate.output?.toLowerCase() ?? ''
  const mentionsGpuAllocation =
    output.includes('ggml_metal_buffer_init') ||
    output.includes('failed to allocate buffer') ||
    (output.includes('metal') && output.includes('allocate'))

  if (!mentionsGpuAllocation) {
    return false
  }

  return candidate.signal === 'SIGSEGV' || candidate.exitCode === 139
}

export function getWhisperSubtitleJsonOutputPath(outputBase: string): string {
  return `${outputBase}.json`
}

export async function readWhisperSubtitleLanguage(outputBase: string): Promise<string | null> {
  const jsonPath = getWhisperSubtitleJsonOutputPath(outputBase)

  try {
    const text = await readFile(jsonPath, 'utf8')
    const parsed = JSON.parse(text) as {
      result?: {
        language?: unknown
      }
    }
    const language = parsed.result?.language

    return typeof language === 'string' && language.trim().length > 0 ? language.trim() : null
  } catch {
    return null
  }
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

export function getWhisperSubtitleOutputPaths(
  cacheDirectory: string,
  mediaPath: string,
  mediaMtimeMs: number,
  modelId: string
): WhisperSubtitleOutputPaths {
  const outputBase = createSubtitleOutputBase(cacheDirectory, mediaPath, mediaMtimeMs, modelId)

  return {
    outputBase,
    subtitlePath: getWhisperSubtitleOutputPath(outputBase),
    subtitleSrtPath: getWhisperSubtitleSrtOutputPath(outputBase)
  }
}

export async function findWhisperSubtitleCache(
  query: WhisperSubtitleCacheQuery
): Promise<WhisperSubtitleOutputPaths | null> {
  const mediaStat = await stat(query.mediaPath)
  const paths = getWhisperSubtitleOutputPaths(query.cacheDirectory, query.mediaPath, mediaStat.mtimeMs, query.modelId)

  if ((await pathExists(paths.subtitlePath)) && (await pathExists(paths.subtitleSrtPath))) {
    return paths
  }

  return null
}

export async function runAsrSubtitleJob(options: RunAsrSubtitleJobOptions): Promise<RunAsrSubtitleJobResult> {
  const copy = getAppCopy(options.getLocale?.())
  emitProgress(options.onProgress, {
    stage: 'checking',
    percent: 0.05,
    message: copy.runtime.preparingSubtitleCache
  })

  const mediaStat = await stat(options.mediaPath)
  const outputBase = createSubtitleOutputBase(
    options.cacheDirectory,
    options.mediaPath,
    mediaStat.mtimeMs,
    options.modelId
  )
  const { subtitlePath, subtitleSrtPath } = getWhisperSubtitleOutputPaths(
    options.cacheDirectory,
    options.mediaPath,
    mediaStat.mtimeMs,
    options.modelId
  )

  if ((await pathExists(subtitlePath)) && (await pathExists(subtitleSrtPath))) {
    const subtitleLanguage = await readWhisperSubtitleLanguage(outputBase)

    emitProgress(options.onProgress, {
      stage: 'completed',
      percent: 1,
      message: copy.runtime.subtitleCacheHit
    })
    return {
      subtitlePath,
      subtitleSrtPath,
      subtitleLanguage: subtitleLanguage ?? undefined
    }
  }

  await mkdir(dirname(outputBase), { recursive: true })
  const tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-asr-'))
  const audioPath = join(tempDirectory, 'audio.wav')

  try {
    emitProgress(options.onProgress, {
      stage: 'extracting-audio',
      percent: 0.18,
      message: copy.runtime.extractingAudio
    })
    await runProcess(options.ffmpegPath, buildFfmpegAudioExtractArgs(options.mediaPath, audioPath), 'ffmpeg')

    emitProgress(options.onProgress, {
      stage: 'transcribing',
      percent: 0.42,
      message: copy.runtime.transcribing
    })
    const whisperArgs = {
      modelPath: options.modelPath,
      audioPath,
      outputBase,
      language: options.language
    }

    try {
      await runProcess(options.whisperBinaryPath, buildWhisperSubtitleArgs(whisperArgs), 'whisper.cpp')
    } catch (error) {
      if (!isWhisperGpuResourceFailure(error)) {
        throw error
      }

      await Promise.all([
        rm(`${outputBase}.vtt`, { force: true }),
        rm(`${outputBase}.srt`, { force: true }),
        rm(`${outputBase}.json`, { force: true })
      ])
      emitProgress(options.onProgress, {
        stage: 'transcribing',
        percent: 0.42,
        message: copy.runtime.asrGpuFallback
      })
      await runProcess(
        options.whisperBinaryPath,
        buildWhisperSubtitleArgs({ ...whisperArgs, disableGpu: true }),
        'whisper.cpp CPU fallback'
      )
    }

    if (!(await pathExists(subtitlePath)) || !(await pathExists(subtitleSrtPath))) {
      throw new Error(copy.runtime.noSubtitleFiles)
    }

    const subtitleLanguage = await readWhisperSubtitleLanguage(outputBase)

    emitProgress(options.onProgress, {
      stage: 'completed',
      percent: 1,
      message: copy.runtime.subtitleGenerated
    })

    return {
      subtitlePath,
      subtitleSrtPath,
      subtitleLanguage: subtitleLanguage ?? undefined
    }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true })
  }
}
