import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { copyFile, mkdtemp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AsrJobProgress, AsrPriorityWindow, AsrSubtitleGenerationStats, TranscriptSegment } from '../../shared/media-types.ts'
import type { AppLocale } from '../../shared/localization'
import { getAppCopy } from '../../shared/i18n'
import { pathExists } from './model-manager.ts'
import { parseVtt, writeSrt, writeVtt } from './subtitle-writer.ts'

export type WhisperSubtitleArgs = {
  modelPath: string
  audioPath: string
  outputBase: string
  language?: string
  offsetSeconds?: number
  durationSeconds?: number
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
  signal?: AbortSignal
  priorityWindow?: AsrPriorityWindow
  onProgress?: (progress: AsrJobProgress) => void | Promise<void>
  getLocale?: () => AppLocale
}

export type RunAsrSubtitleJobResult = {
  subtitlePath: string
  subtitleSrtPath: string
  subtitleLanguage?: string
  generationStats: AsrSubtitleGenerationStats
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

type ProgressCallback = (progress: AsrJobProgress) => void | Promise<void>

function emitProgress(onProgress: ProgressCallback | undefined, progress: AsrJobProgress): void | Promise<void> {
  return onProgress?.(progress)
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

type ProcessOutputListener = (chunk: string) => void

type ProcessExecutionError = Error & {
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  output?: string
}

async function runProcess(
  command: string,
  args: string[],
  label: string,
  abortSignal?: AbortSignal,
  onOutput?: ProcessOutputListener
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    let settled = false
    const handleAbort = (): void => {
      if (settled) return
      settled = true
      child.kill()
      cleanup()
      reject(new Error('ASR process cancelled'))
    }
    const cleanup = (): void => abortSignal?.removeEventListener('abort', handleAbort)

    if (abortSignal?.aborted) {
      child.kill()
      reject(new Error('ASR process cancelled'))
      return
    }
    abortSignal?.addEventListener('abort', handleAbort, { once: true })

    const handleOutput = (chunk: Buffer): void => {
      const text = chunk.toString()
      output += text
      onOutput?.(text)
    }

    child.stdout.on('data', handleOutput)
    child.stderr.on('data', handleOutput)

    child.on('error', (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    })
    child.on('close', (code, processSignal) => {
      if (settled) return
      settled = true
      cleanup()
      if (abortSignal?.aborted) {
        reject(new Error('ASR process cancelled'))
        return
      }
      if (code === 0) {
        resolve()
        return
      }

      const error = new Error(
        `${label} 失败，退出码 ${code ?? 'unknown'}${processSignal ? `，信号 ${processSignal}` : ''}：${tailOutput(output)}`
      ) as ProcessExecutionError
      error.exitCode = code
      error.signal = processSignal
      error.output = output
      reject(error)
    })
  })
}

const WHISPER_SEGMENT_LINE_PATTERN = /^\[(?<start>\d+:\d{2}:\d{2}[.,]\d{3})\s+-->\s+(?<end>\d+:\d{2}:\d{2}[.,]\d{3})\]\s*(?<text>.*)$/

function parseWhisperTimestamp(timestamp: string): number | null {
  const match = timestamp.trim().match(/^(\d+):(\d{2}):(\d{2})[.,](\d{3})$/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const milliseconds = Number(match[4])
  if (minutes > 59 || seconds > 59 || !Number.isFinite(milliseconds)) return null

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

export function parseWhisperSegmentLine(line: string): TranscriptSegment | null {
  const match = line.trim().match(WHISPER_SEGMENT_LINE_PATTERN)
  if (!match?.groups) return null

  const startSeconds = parseWhisperTimestamp(match.groups.start ?? '')
  const endSeconds = parseWhisperTimestamp(match.groups.end ?? '')
  const text = (match.groups.text ?? '').trim()
  if (startSeconds === null || endSeconds === null || endSeconds < startSeconds || !text) return null

  return { startSeconds, endSeconds, text }
}

export type WhisperSubtitlePartialOutputPaths = {
  subtitlePath: string
  subtitleSrtPath: string
}

export type WhisperSubtitleCheckpointPaths = WhisperSubtitlePartialOutputPaths & {
  metadataPath: string
}

type WhisperSubtitleCheckpoint = {
  lastEndSeconds: number
  savedAt: string
}

const resumeOverlapSeconds = 3
const minimumResumeCheckpointSeconds = 30

export function getWhisperSubtitlePartialOutputPaths(outputBase: string): WhisperSubtitlePartialOutputPaths {
  return {
    subtitlePath: `${outputBase}.partial.vtt`,
    subtitleSrtPath: `${outputBase}.partial.srt`
  }
}

export function getWhisperSubtitleCheckpointPaths(outputBase: string): WhisperSubtitleCheckpointPaths {
  return {
    subtitlePath: `${outputBase}.checkpoint.vtt`,
    subtitleSrtPath: `${outputBase}.checkpoint.srt`,
    metadataPath: `${outputBase}.checkpoint.json`
  }
}

async function writePartialSubtitleFile(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, content, 'utf8')
  await rename(temporaryPath, filePath)
}

async function removePartialSubtitleFiles(paths: WhisperSubtitlePartialOutputPaths): Promise<void> {
  await Promise.all([
    rm(paths.subtitlePath, { force: true }),
    rm(paths.subtitleSrtPath, { force: true }),
    rm(`${paths.subtitlePath}.tmp`, { force: true }),
    rm(`${paths.subtitleSrtPath}.tmp`, { force: true })
  ])
}

async function removeCheckpointFiles(paths: WhisperSubtitleCheckpointPaths): Promise<void> {
  await Promise.all([
    rm(paths.subtitlePath, { force: true }),
    rm(paths.subtitleSrtPath, { force: true }),
    rm(paths.metadataPath, { force: true }),
    rm(`${paths.subtitlePath}.tmp`, { force: true }),
    rm(`${paths.subtitleSrtPath}.tmp`, { force: true }),
    rm(`${paths.metadataPath}.tmp`, { force: true })
  ])
}

async function writeSubtitlePair(paths: WhisperSubtitlePartialOutputPaths, segments: TranscriptSegment[]): Promise<void> {
  await Promise.all([
    writePartialSubtitleFile(paths.subtitlePath, writeVtt(segments)),
    writePartialSubtitleFile(paths.subtitleSrtPath, writeSrt(segments))
  ])
}

function getLastSegmentEndSeconds(segments: TranscriptSegment[]): number {
  return segments.reduce((latest, segment) => Math.max(latest, segment.endSeconds), 0)
}

async function preserveSubtitleCheckpoint(
  sourcePaths: WhisperSubtitlePartialOutputPaths,
  checkpointPaths: WhisperSubtitleCheckpointPaths
): Promise<boolean> {
  try {
    const segments = parseVtt(await readFile(sourcePaths.subtitlePath, 'utf8'))
    const lastEndSeconds = getLastSegmentEndSeconds(segments)
    if (segments.length === 0 || lastEndSeconds < minimumResumeCheckpointSeconds) return false

    await writeSubtitlePair(checkpointPaths, segments)
    const metadataPath = `${checkpointPaths.metadataPath}.tmp`
    await writeFile(metadataPath, JSON.stringify({ lastEndSeconds, savedAt: new Date().toISOString() } satisfies WhisperSubtitleCheckpoint), 'utf8')
    await rename(metadataPath, checkpointPaths.metadataPath)
    return true
  } catch {
    return false
  }
}

async function readSubtitleCheckpoint(paths: WhisperSubtitleCheckpointPaths): Promise<{ segments: TranscriptSegment[]; lastEndSeconds: number } | null> {
  try {
    const segments = parseVtt(await readFile(paths.subtitlePath, 'utf8'))
    if (segments.length === 0) return null
    const metadata = JSON.parse(await readFile(paths.metadataPath, 'utf8')) as Partial<WhisperSubtitleCheckpoint>
    const metadataEnd = typeof metadata.lastEndSeconds === 'number' && Number.isFinite(metadata.lastEndSeconds) ? metadata.lastEndSeconds : 0
    const lastEndSeconds = Math.max(metadataEnd, getLastSegmentEndSeconds(segments))
    if (lastEndSeconds < minimumResumeCheckpointSeconds) return null
    return { segments, lastEndSeconds }
  } catch {
    return null
  }
}

export async function findWhisperSubtitleCheckpoint(
  query: WhisperSubtitleCacheQuery
): Promise<{ lastEndSeconds: number; resumeFromSeconds: number; subtitleCueCount: number } | null> {
  try {
    const mediaStat = await stat(query.mediaPath)
    const paths = getWhisperSubtitleOutputPaths(query.cacheDirectory, query.mediaPath, mediaStat.mtimeMs, query.modelId)
    const checkpoint = await readSubtitleCheckpoint(getWhisperSubtitleCheckpointPaths(paths.outputBase))
    if (!checkpoint) return null

    return {
      lastEndSeconds: checkpoint.lastEndSeconds,
      resumeFromSeconds: Math.max(0, checkpoint.lastEndSeconds - resumeOverlapSeconds),
      subtitleCueCount: checkpoint.segments.length
    }
  } catch {
    return null
  }
}

function mergeResumedSubtitleSegments(prefixSegments: TranscriptSegment[], resumedSegments: TranscriptSegment[], resumeStartSeconds: number): TranscriptSegment[] {
  const prefix = prefixSegments.filter((segment) => segment.endSeconds <= resumeStartSeconds)
  const merged: TranscriptSegment[] = []
  const seen = new Set<string>()

  for (const segment of [...prefix, ...resumedSegments].sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)) {
    const key = `${segment.startSeconds}:${segment.endSeconds}:${segment.text}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(segment)
  }

  return merged
}

function createWhisperPartialSubtitlePublisher(options: {
  outputBase: string
  mediaPath: string
  onProgress?: ProgressCallback
  message: string
}): { pushOutput: ProcessOutputListener; finish: () => Promise<void> } {
  const partialPaths = getWhisperSubtitlePartialOutputPaths(options.outputBase)
  const segments: TranscriptSegment[] = []
  const seenSegments = new Set<string>()
  let lineBuffer = ''
  let publishTimer: ReturnType<typeof setTimeout> | null = null
  let lastPublishedCueCount = 0
  let revision = 0
  let writeQueue = Promise.resolve()

  const appendSegment = (line: string): void => {
    const segment = parseWhisperSegmentLine(line)
    if (!segment) return

    const key = `${segment.startSeconds}:${segment.endSeconds}:${segment.text}`
    if (seenSegments.has(key)) return
    seenSegments.add(key)
    segments.push(segment)
    schedulePublish()
  }

  const publish = (): void => {
    if (segments.length === 0 || segments.length === lastPublishedCueCount) return

    const snapshot = segments.slice()
    lastPublishedCueCount = snapshot.length
    revision += 1
    writeQueue = writeQueue.then(async () => {
      await Promise.all([
        writePartialSubtitleFile(partialPaths.subtitlePath, writeVtt(snapshot)),
        writePartialSubtitleFile(partialPaths.subtitleSrtPath, writeSrt(snapshot))
      ])
      await options.onProgress?.({
        stage: 'transcribing',
        percent: 0.42,
        message: options.message,
        mediaPath: options.mediaPath,
        partialSubtitlePath: partialPaths.subtitlePath,
        partialSubtitleSrtPath: partialPaths.subtitleSrtPath,
        partialSubtitleCueCount: snapshot.length,
        partialSubtitleRevision: revision
      })
    }).catch(() => {
      // Partial subtitle updates are best-effort and must not abort ASR.
    })
  }

  function schedulePublish(): void {
    if (publishTimer !== null) return
    publishTimer = setTimeout(() => {
      publishTimer = null
      publish()
    }, 350)
  }

  const pushOutput = (chunk: string): void => {
    lineBuffer += chunk
    let lineEnd = lineBuffer.indexOf('\n')
    while (lineEnd >= 0) {
      appendSegment(lineBuffer.slice(0, lineEnd).replace(/\r$/, ''))
      lineBuffer = lineBuffer.slice(lineEnd + 1)
      lineEnd = lineBuffer.indexOf('\n')
    }
  }

  const finish = async (): Promise<void> => {
    if (lineBuffer) appendSegment(lineBuffer)
    if (publishTimer !== null) {
      clearTimeout(publishTimer)
      publishTimer = null
    }
    publish()
    await writeQueue
  }

  return { pushOutput, finish }
}

async function runWhisperWithPartialOutput(options: {
  command: string
  args: string[]
  label: string
  outputBase: string
  mediaPath: string
  abortSignal?: AbortSignal
  onProgress?: ProgressCallback
  message: string
}): Promise<void> {
  const publisher = createWhisperPartialSubtitlePublisher(options)
  try {
    await runProcess(options.command, options.args, options.label, options.abortSignal, publisher.pushOutput)
  } finally {
    await publisher.finish()
  }
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
    '-ojf',
    '-l',
    options.language ?? 'auto'
  ]

  if (options.disableGpu) {
    args.push('-ng')
  }

  if (Number.isFinite(options.offsetSeconds) && (options.offsetSeconds ?? 0) > 0) {
    args.push('-ot', String(Math.round((options.offsetSeconds ?? 0) * 1000)))
  }

  if (Number.isFinite(options.durationSeconds) && (options.durationSeconds ?? 0) > 0) {
    args.push('-d', String(Math.round((options.durationSeconds ?? 0) * 1000)))
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

async function runWhisperWithGpuFallback(options: {
  command: string
  whisperArgs: WhisperSubtitleArgs
  label: string
  outputBase: string
  mediaPath: string
  abortSignal?: AbortSignal
  onProgress?: ProgressCallback
  message: string
  gpuFallbackMessage: string
}): Promise<void> {
  try {
    await runWhisperWithPartialOutput({
      command: options.command,
      args: buildWhisperSubtitleArgs(options.whisperArgs),
      label: options.label,
      outputBase: options.outputBase,
      mediaPath: options.mediaPath,
      abortSignal: options.abortSignal,
      onProgress: options.onProgress,
      message: options.message
    })
  } catch (error) {
    if (!isWhisperGpuResourceFailure(error)) throw error

    await Promise.all([
      rm(`${options.outputBase}.vtt`, { force: true }),
      rm(`${options.outputBase}.srt`, { force: true }),
      rm(`${options.outputBase}.json`, { force: true })
    ])
    await removePartialSubtitleFiles(getWhisperSubtitlePartialOutputPaths(options.outputBase))
    await options.onProgress?.({
      stage: 'transcribing',
      percent: 0.42,
      message: options.gpuFallbackMessage
    })
    await runWhisperWithPartialOutput({
      command: options.command,
      args: buildWhisperSubtitleArgs({ ...options.whisperArgs, disableGpu: true }),
      label: `${options.label} CPU fallback`,
      outputBase: options.outputBase,
      mediaPath: options.mediaPath,
      abortSignal: options.abortSignal,
      onProgress: options.onProgress,
      message: options.message
    })
  }
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
  return `${createLegacySubtitleOutputBase(cacheDirectory, mediaPath, mediaMtimeMs, modelId)}-raw`
}

function createLegacySubtitleOutputBase(
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

export function getLegacyWhisperSubtitleOutputPaths(
  cacheDirectory: string,
  mediaPath: string,
  mediaMtimeMs: number,
  modelId: string
): WhisperSubtitleOutputPaths {
  const outputBase = createLegacySubtitleOutputBase(cacheDirectory, mediaPath, mediaMtimeMs, modelId)

  return {
    outputBase,
    subtitlePath: getWhisperSubtitleOutputPath(outputBase),
    subtitleSrtPath: getWhisperSubtitleSrtOutputPath(outputBase)
  }
}

async function hasSubtitlePair(paths: Pick<WhisperSubtitleOutputPaths, 'subtitlePath' | 'subtitleSrtPath'>): Promise<boolean> {
  return (await pathExists(paths.subtitlePath)) && (await pathExists(paths.subtitleSrtPath))
}

async function copyLegacySubtitleCache(
  legacyPaths: WhisperSubtitleOutputPaths,
  currentPaths: WhisperSubtitleOutputPaths
): Promise<void> {
  await mkdir(dirname(currentPaths.outputBase), { recursive: true })

  await copyFile(legacyPaths.subtitlePath, currentPaths.subtitlePath)
  await copyFile(legacyPaths.subtitleSrtPath, currentPaths.subtitleSrtPath)

  const legacyJsonPath = getWhisperSubtitleJsonOutputPath(legacyPaths.outputBase)
  if (await pathExists(legacyJsonPath)) {
    await copyFile(legacyJsonPath, getWhisperSubtitleJsonOutputPath(currentPaths.outputBase))
  }
}

export async function findWhisperSubtitleCache(
  query: WhisperSubtitleCacheQuery
): Promise<WhisperSubtitleOutputPaths | null> {
  const mediaStat = await stat(query.mediaPath)
  const paths = getWhisperSubtitleOutputPaths(query.cacheDirectory, query.mediaPath, mediaStat.mtimeMs, query.modelId)

  if (await hasSubtitlePair(paths)) {
    return paths
  }

  const legacyPaths = getLegacyWhisperSubtitleOutputPaths(
    query.cacheDirectory,
    query.mediaPath,
    mediaStat.mtimeMs,
    query.modelId
  )

  if (!(await hasSubtitlePair(legacyPaths))) {
    return null
  }

  try {
    await copyLegacySubtitleCache(legacyPaths, paths)
    return (await hasSubtitlePair(paths)) ? paths : legacyPaths
  } catch {
    return legacyPaths
  }
}

export async function runAsrSubtitleJob(options: RunAsrSubtitleJobOptions): Promise<RunAsrSubtitleJobResult> {
  const startedAt = performance.now()
  const copy = getAppCopy(options.getLocale?.())
  const emitJobProgress = (progress: AsrJobProgress): void | Promise<void> => emitProgress(options.onProgress, { ...progress, mediaPath: options.mediaPath })

  emitJobProgress({
    stage: 'checking',
    percent: 0.05,
    message: copy.runtime.preparingSubtitleCache
  })

  const mediaStat = await stat(options.mediaPath)
  const { outputBase, subtitlePath, subtitleSrtPath } = getWhisperSubtitleOutputPaths(
    options.cacheDirectory,
    options.mediaPath,
    mediaStat.mtimeMs,
    options.modelId
  )
  const partialPaths = getWhisperSubtitlePartialOutputPaths(outputBase)
  const checkpointPaths = getWhisperSubtitleCheckpointPaths(outputBase)

  const createGenerationStats = async (subtitleFilePath: string, cacheHit: boolean) => {
    let subtitleCueCount = 0

    try {
      subtitleCueCount = parseVtt(await readFile(subtitleFilePath, 'utf8')).length
    } catch {
      // Timing and cache state should remain available even if a malformed subtitle
      // prevents us from counting cues for the summary card.
    }

    return {
      elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
      subtitleCueCount,
      cacheHit
    }
  }

  if (await hasSubtitlePair({ subtitlePath, subtitleSrtPath })) {
    const subtitleLanguage = await readWhisperSubtitleLanguage(outputBase)

    emitJobProgress({
      stage: 'completed',
      percent: 1,
      message: copy.runtime.subtitleCacheHit
    })
    return {
      subtitlePath,
      subtitleSrtPath,
      subtitleLanguage: subtitleLanguage ?? undefined,
      generationStats: await createGenerationStats(subtitlePath, true)
    }
  }

  const legacyPaths = getLegacyWhisperSubtitleOutputPaths(
    options.cacheDirectory,
    options.mediaPath,
    mediaStat.mtimeMs,
    options.modelId
  )

  if (await hasSubtitlePair(legacyPaths)) {
    let cachedPaths = legacyPaths

    try {
      await copyLegacySubtitleCache(legacyPaths, { outputBase, subtitlePath, subtitleSrtPath })
      if (await hasSubtitlePair({ subtitlePath, subtitleSrtPath })) {
        cachedPaths = { outputBase, subtitlePath, subtitleSrtPath }
      }
    } catch {
      // Keep using the legacy cache when promotion cannot be completed.
    }

    const subtitleLanguage = await readWhisperSubtitleLanguage(cachedPaths.outputBase)

    emitJobProgress({
      stage: 'completed',
      percent: 1,
      message: copy.runtime.subtitleCacheHit
    })
    return {
      subtitlePath: cachedPaths.subtitlePath,
      subtitleSrtPath: cachedPaths.subtitleSrtPath,
      subtitleLanguage: subtitleLanguage ?? undefined,
      generationStats: await createGenerationStats(cachedPaths.subtitlePath, true)
    }
  }

  await mkdir(dirname(outputBase), { recursive: true })
  const tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-asr-'))
  const audioPath = join(tempDirectory, 'audio.wav')
  const priorityWindow = options.priorityWindow && options.priorityWindow.startSeconds >= 0 && options.priorityWindow.durationSeconds > 0 && options.priorityWindow.endSeconds > options.priorityWindow.startSeconds
    ? options.priorityWindow
    : null
  const checkpoint = await readSubtitleCheckpoint(checkpointPaths)
  let completed = false

  try {
    await removePartialSubtitleFiles(partialPaths)

    emitJobProgress({
      stage: 'extracting-audio',
      percent: 0.18,
      message: copy.runtime.extractingAudio
    })
    await runProcess(options.ffmpegPath, buildFfmpegAudioExtractArgs(options.mediaPath, audioPath), 'ffmpeg', options.signal)

    emitJobProgress({
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

    let priorityMetadata: Pick<AsrJobProgress, 'prioritySubtitlePath' | 'prioritySubtitleSrtPath' | 'prioritySubtitleRevision' | 'prioritySubtitleReady' | 'priorityStartSeconds' | 'priorityEndSeconds'> | null = null
    let priorityRevision = 0
    const emitFullProgress = (progress: AsrJobProgress): void | Promise<void> => {
      return emitJobProgress(priorityMetadata ? { ...progress, ...priorityMetadata } : progress)
    }

    if (priorityWindow) {
      const priorityOutputBase = join(tempDirectory, 'priority-subtitle')
      const priorityPaths = {
        outputBase: priorityOutputBase,
        subtitlePath: getWhisperSubtitleOutputPath(priorityOutputBase),
        subtitleSrtPath: getWhisperSubtitleSrtOutputPath(priorityOutputBase)
      }
      const priorityWhisperArgs = {
        ...whisperArgs,
        outputBase: priorityOutputBase,
        offsetSeconds: priorityWindow.startSeconds,
        durationSeconds: priorityWindow.durationSeconds
      }
      const emitPriorityProgress = (progress: AsrJobProgress): void | Promise<void> => {
        if (progress.partialSubtitlePath) priorityRevision = Math.max(priorityRevision, progress.partialSubtitleRevision ?? 0)
        return emitJobProgress({
          stage: progress.stage,
          percent: progress.percent,
          message: progress.message,
          prioritySubtitlePath: progress.partialSubtitlePath,
          prioritySubtitleSrtPath: progress.partialSubtitleSrtPath,
          prioritySubtitleRevision: priorityRevision,
          prioritySubtitleReady: false,
          priorityStartSeconds: priorityWindow.startSeconds,
          priorityEndSeconds: priorityWindow.endSeconds
        })
      }

      try {
        await runWhisperWithGpuFallback({
          command: options.whisperBinaryPath,
          whisperArgs: priorityWhisperArgs,
          label: 'whisper.cpp priority window',
          outputBase: priorityOutputBase,
          mediaPath: options.mediaPath,
          abortSignal: options.signal,
          onProgress: emitPriorityProgress,
          message: copy.runtime.transcribing,
          gpuFallbackMessage: copy.runtime.asrGpuFallback
        })

        if (await hasSubtitlePair(priorityPaths)) {
          priorityRevision += 1
          priorityMetadata = {
            prioritySubtitlePath: priorityPaths.subtitlePath,
            prioritySubtitleSrtPath: priorityPaths.subtitleSrtPath,
            prioritySubtitleRevision: priorityRevision,
            prioritySubtitleReady: true,
            priorityStartSeconds: priorityWindow.startSeconds,
            priorityEndSeconds: priorityWindow.endSeconds
          }
          await emitFullProgress({
            stage: 'transcribing',
            percent: 0.42,
            message: copy.runtime.transcribing
          })
        }
      } catch (error) {
        if (options.signal?.aborted) throw error
        await Promise.all([
          rm(`${priorityOutputBase}.vtt`, { force: true }),
          rm(`${priorityOutputBase}.srt`, { force: true }),
          rm(`${priorityOutputBase}.json`, { force: true }),
          removePartialSubtitleFiles(getWhisperSubtitlePartialOutputPaths(priorityOutputBase))
        ])
      }
    }

    let resumedSuccessfully = false
    if (checkpoint) {
      const resumeOutputBase = join(tempDirectory, 'resume-subtitle')
      const resumePaths = {
        outputBase: resumeOutputBase,
        subtitlePath: getWhisperSubtitleOutputPath(resumeOutputBase),
        subtitleSrtPath: getWhisperSubtitleSrtOutputPath(resumeOutputBase)
      }
      const resumeStartSeconds = Math.max(0, checkpoint.lastEndSeconds - resumeOverlapSeconds)
      let resumeRevision = 0

      await writeSubtitlePair(partialPaths, checkpoint.segments)
      emitFullProgress({
        stage: 'transcribing',
        percent: 0.42,
        message: copy.runtime.transcribing,
        resumingFromSeconds: resumeStartSeconds,
        partialSubtitlePath: partialPaths.subtitlePath,
        partialSubtitleSrtPath: partialPaths.subtitleSrtPath,
        partialSubtitleCueCount: checkpoint.segments.length,
        partialSubtitleRevision: ++resumeRevision
      })

      const emitResumedProgress = async (progress: AsrJobProgress): Promise<void> => {
        if (!progress.partialSubtitlePath) return
        const resumedSegments = parseVtt(await readFile(progress.partialSubtitlePath, 'utf8'))
        const mergedSegments = mergeResumedSubtitleSegments(checkpoint.segments, resumedSegments, resumeStartSeconds)
        await writeSubtitlePair(partialPaths, mergedSegments)
        await emitFullProgress({
          ...progress,
          partialSubtitlePath: partialPaths.subtitlePath,
          partialSubtitleSrtPath: partialPaths.subtitleSrtPath,
          partialSubtitleCueCount: mergedSegments.length,
          partialSubtitleRevision: ++resumeRevision
        })
      }

      try {
        await runWhisperWithGpuFallback({
          command: options.whisperBinaryPath,
          whisperArgs: { ...whisperArgs, outputBase: resumeOutputBase, offsetSeconds: resumeStartSeconds },
          label: 'whisper.cpp resumed subtitle pass',
          outputBase: resumeOutputBase,
          mediaPath: options.mediaPath,
          abortSignal: options.signal,
          onProgress: emitResumedProgress,
          message: copy.runtime.transcribing,
          gpuFallbackMessage: copy.runtime.asrGpuFallback
        })

        if (await hasSubtitlePair(resumePaths)) {
          const resumedSegments = parseVtt(await readFile(resumePaths.subtitlePath, 'utf8'))
          const mergedSegments = mergeResumedSubtitleSegments(checkpoint.segments, resumedSegments, resumeStartSeconds)
          await writeSubtitlePair({ subtitlePath, subtitleSrtPath }, mergedSegments)
          const resumeJsonPath = getWhisperSubtitleJsonOutputPath(resumeOutputBase)
          if (await pathExists(resumeJsonPath)) {
            await copyFile(resumeJsonPath, getWhisperSubtitleJsonOutputPath(outputBase))
          }
          resumedSuccessfully = true
        }
      } catch (error) {
        if (options.signal?.aborted) throw error
      } finally {
        await Promise.all([
          rm(`${resumeOutputBase}.vtt`, { force: true }),
          rm(`${resumeOutputBase}.srt`, { force: true }),
          rm(`${resumeOutputBase}.json`, { force: true }),
          removePartialSubtitleFiles(getWhisperSubtitlePartialOutputPaths(resumeOutputBase))
        ])
      }
    }

    if (!resumedSuccessfully) {
      await removePartialSubtitleFiles(partialPaths)
      await runWhisperWithGpuFallback({
        command: options.whisperBinaryPath,
        whisperArgs,
        label: 'whisper.cpp',
        outputBase,
        mediaPath: options.mediaPath,
        abortSignal: options.signal,
        onProgress: emitFullProgress,
        message: copy.runtime.transcribing,
        gpuFallbackMessage: copy.runtime.asrGpuFallback
      })
    }

    if (!(await pathExists(subtitlePath)) || !(await pathExists(subtitleSrtPath))) {
      throw new Error(copy.runtime.noSubtitleFiles)
    }

    const subtitleLanguage = await readWhisperSubtitleLanguage(outputBase)

    emitFullProgress({
      stage: 'completed',
      percent: 1,
      message: copy.runtime.subtitleGenerated
    })

    completed = true
    return {
      subtitlePath,
      subtitleSrtPath,
      subtitleLanguage: subtitleLanguage ?? undefined,
      generationStats: await createGenerationStats(subtitlePath, false)
    }
  } finally {
    if (completed) {
      await removeCheckpointFiles(checkpointPaths)
    } else {
      await preserveSubtitleCheckpoint(partialPaths, checkpointPaths)
    }
    await removePartialSubtitleFiles(partialPaths)
    await rm(tempDirectory, { recursive: true, force: true })
  }
}
