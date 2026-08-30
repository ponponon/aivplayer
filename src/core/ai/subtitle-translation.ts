import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { SubtitleTargetLanguageId } from '../../shared/app-settings.ts'
import type { AsrSubtitleTranslationStats, TranscriptSegment } from '../../shared/media-types.ts'
import { parseVtt, writeSrt, writeVtt } from './subtitle-writer.ts'
import { pathExists } from './model-manager.ts'

export type SubtitleTranslationProviderId = 'mock' | 'openai-compatible'

export type SubtitleTranslationSegment = {
  id: string
  text: string
}

export type SubtitleTranslationGlossaryEntry = {
  source: string
  target: string
}

export type SubtitleTranslationContextCue = SubtitleTranslationSegment & {
  translatedText?: string
}

export type SubtitleTranslationContext = {
  previous: SubtitleTranslationContextCue[]
  next: SubtitleTranslationContextCue[]
}

export type SubtitleTranslationBatchRequest = {
  sourceLanguage: string
  targetLanguage: SubtitleTargetLanguageId
  segments: SubtitleTranslationSegment[]
  context?: SubtitleTranslationContext
  glossary?: SubtitleTranslationGlossaryEntry[]
  signal?: AbortSignal
}

export type SubtitleTranslationProgress = {
  completedBatches: number
  totalBatches: number
  percent: number
}

export type SubtitleTranslationProvider = {
  id: SubtitleTranslationProviderId
  model: string
  glossary?: string | null
  translateBatch: (request: SubtitleTranslationBatchRequest) => Promise<SubtitleTranslationSegment[]>
}

export type SubtitleTranslationErrorCode =
  | 'cancelled'
  | 'network-error'
  | 'http-error'
  | 'invalid-json'
  | 'invalid-response'

export class SubtitleTranslationError extends Error {
  readonly code: SubtitleTranslationErrorCode
  readonly status?: number
  readonly statusText?: string
  readonly responseBody?: string

  constructor(
    code: SubtitleTranslationErrorCode,
    message: string,
    options?: { cause?: unknown; status?: number; statusText?: string; responseBody?: string }
  ) {
    super(message)
    this.name = 'SubtitleTranslationError'
    this.code = code
    this.status = options?.status
    this.statusText = options?.statusText
    this.responseBody = options?.responseBody
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

export type SubtitleTranslationProviderRef = Pick<SubtitleTranslationProvider, 'id' | 'model'> & {
  glossary?: string | null
}

export type RunSubtitleTranslationJobOptions = {
  sourceSubtitlePath: string
  cacheDirectory: string
  sourceLanguage?: string
  targetLanguage: SubtitleTargetLanguageId
  provider: SubtitleTranslationProvider
  signal?: AbortSignal
  onProgress?: (progress: SubtitleTranslationProgress) => void
  retryDelaysMs?: readonly number[]
}

export type SubtitleTranslationOutputPaths = {
  subtitlePath: string
  subtitleSrtPath: string
}

export type RunSubtitleTranslationJobResult = SubtitleTranslationOutputPaths & {
  translationStats: AsrSubtitleTranslationStats
}

export type SubtitleTranslationCacheQuery = {
  sourceSubtitlePath: string
  cacheDirectory: string
  sourceLanguage?: string
  targetLanguage: SubtitleTargetLanguageId
  provider: SubtitleTranslationProviderRef
}

export type OpenAiCompatibleTranslationProviderOptions = {
  baseUrl: string
  apiKey: string
  model: string
  glossary?: string | null
  headers?: Record<string, string>
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
  getEndpointCandidates?: () => Promise<string[]>
  onEndpointFailure?: (endpoint: string) => void
}

const translationBatchSize = 30
const minimumTranslationBatchSize = 1
const translationContextWindowSize = 2
const defaultTranslationRetryDelaysMs = [250, 1000] as const

const diagnosticBodyMaxLength = 12_000

function truncateDiagnosticBody(value: string): string {
  const normalized = value.trim()
  if (normalized.length <= diagnosticBodyMaxLength) {
    return normalized
  }

  return `${normalized.slice(0, diagnosticBodyMaxLength)}\n… [truncated]`
}

export function parseSubtitleTranslationGlossary(value: string | null | undefined): SubtitleTranslationGlossaryEntry[] {
  if (!value) {
    return []
  }

  const entries = new Map<string, SubtitleTranslationGlossaryEntry>()

  for (const rawLine of value.split(/\r?\n/)) {
    const separatorIndex = rawLine.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const source = rawLine.slice(0, separatorIndex).trim()
    const target = rawLine.slice(separatorIndex + 1).trim()
    if (source && target) {
      entries.set(source, { source, target })
    }
  }

  return [...entries.values()]
}

function normalizeGlossaryForCache(value: string | null | undefined): string {
  return parseSubtitleTranslationGlossary(value)
    .map((entry) => `${entry.source}=${entry.target}`)
    .join('\n')
}

function sanitizeFileStem(filePath: string): string {
  const stem = basename(filePath, extname(filePath))
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return stem || 'subtitle'
}

function sanitizePathPart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'default'
}

function getLegacySourceSubtitlePath(sourceSubtitlePath: string): string | null {
  const sourceStem = basename(sourceSubtitlePath, extname(sourceSubtitlePath))
  if (!sourceStem.endsWith('-raw')) {
    return null
  }

  return join(dirname(sourceSubtitlePath), `${sourceStem.slice(0, -4)}${extname(sourceSubtitlePath)}`)
}

function getTranslationFileStem(sourceSubtitlePath: string): string {
  const safeStem = sanitizeFileStem(sourceSubtitlePath)
  return safeStem.endsWith('-raw') ? safeStem.slice(0, -4) : safeStem
}

function createTranslationCacheKey(options: {
  sourceSubtitlePath: string
  sourceSubtitleText: string
  sourceLanguage: string
  targetLanguage: SubtitleTargetLanguageId
  provider: SubtitleTranslationProviderRef
}): string {
  const sourceTextHash = createHash('sha1').update(options.sourceSubtitleText).digest('hex')
  return createHash('sha1')
    .update(
      [
        options.sourceSubtitlePath,
        sourceTextHash,
        options.sourceLanguage,
        options.targetLanguage,
        options.provider.id,
        options.provider.model,
        normalizeGlossaryForCache(options.provider.glossary)
      ].join('\n')
    )
    .digest('hex')
    .slice(0, 12)
}

function getTranslatedSubtitleOutputBase(options: {
  cacheDirectory: string
  sourceSubtitlePath: string
  sourceSubtitleText: string
  sourceLanguage: string
  targetLanguage: SubtitleTargetLanguageId
  provider: SubtitleTranslationProviderRef
}): string {
  const safeStem = getTranslationFileStem(options.sourceSubtitlePath)
  const safeProvider = sanitizePathPart(options.provider.id)
  const safeModel = sanitizePathPart(options.provider.model)
  const cacheKey = createTranslationCacheKey(options)

  return join(
    options.cacheDirectory,
    'subtitles',
    `${safeStem}-translated-${options.targetLanguage}-${safeProvider}-${safeModel}-${cacheKey}`
  )
}

function createStreamingTranslationCacheKey(options: {
  sourceSubtitlePath: string
  sourceLanguage: string
  targetLanguage: SubtitleTargetLanguageId
  provider: SubtitleTranslationProviderRef
}): string {
  return createHash('sha1')
    .update(
      [
        options.sourceSubtitlePath,
        options.sourceLanguage,
        options.targetLanguage,
        options.provider.id,
        options.provider.model,
        normalizeGlossaryForCache(options.provider.glossary)
      ].join('\n')
    )
    .digest('hex')
    .slice(0, 12)
}

export function getStreamingSubtitleTranslationOutputPaths(options: {
  cacheDirectory: string
  sourceSubtitlePath: string
  sourceLanguage?: string
  targetLanguage: SubtitleTargetLanguageId
  provider: SubtitleTranslationProviderRef
}): SubtitleTranslationOutputPaths {
  const sourceLanguage = options.sourceLanguage ?? 'auto'
  const safeStem = getTranslationFileStem(options.sourceSubtitlePath)
  const safeProvider = sanitizePathPart(options.provider.id)
  const safeModel = sanitizePathPart(options.provider.model)
  const cacheKey = createStreamingTranslationCacheKey({ ...options, sourceLanguage })
  const outputBase = join(
    options.cacheDirectory,
    'subtitles',
    `${safeStem}-stream-translated-${options.targetLanguage}-${safeProvider}-${safeModel}-${cacheKey}`
  )

  return getTranslatedSubtitleOutputPaths(outputBase)
}

function getLegacyTranslatedSubtitleOutputBase(options: {
  cacheDirectory: string
  sourceSubtitlePath: string
  sourceSubtitleText: string
  sourceLanguage: string
  targetLanguage: SubtitleTargetLanguageId
  provider: SubtitleTranslationProviderRef
}): string {
  const legacySourceSubtitlePath = getLegacySourceSubtitlePath(options.sourceSubtitlePath) ?? options.sourceSubtitlePath
  const safeStem = getTranslationFileStem(legacySourceSubtitlePath)
  const safeProvider = sanitizePathPart(options.provider.id)
  const safeModel = sanitizePathPart(options.provider.model)
  const cacheKey = createTranslationCacheKey({
    ...options,
    sourceSubtitlePath: legacySourceSubtitlePath
  })

  return join(
    options.cacheDirectory,
    'translated-subtitles',
    `${safeStem}-${options.targetLanguage}-${safeProvider}-${safeModel}-${cacheKey}`
  )
}

function getTranslatedSubtitleOutputPaths(outputBase: string): SubtitleTranslationOutputPaths {
  return {
    subtitlePath: `${outputBase}.vtt`,
    subtitleSrtPath: `${outputBase}.srt`
  }
}

async function hasTranslationPair(paths: SubtitleTranslationOutputPaths): Promise<boolean> {
  return (await pathExists(paths.subtitlePath)) && (await pathExists(paths.subtitleSrtPath))
}

async function copyLegacyTranslationCache(
  legacyPaths: SubtitleTranslationOutputPaths,
  currentPaths: SubtitleTranslationOutputPaths
): Promise<void> {
  await mkdir(dirname(currentPaths.subtitlePath), { recursive: true })
  await copyFile(legacyPaths.subtitlePath, currentPaths.subtitlePath)
  await copyFile(legacyPaths.subtitleSrtPath, currentPaths.subtitleSrtPath)
}

export function createSubtitleTranslationProviderRef(
  model: string | null | undefined,
  glossary?: string | null
): SubtitleTranslationProviderRef | null {
  const trimmedModel = model?.trim()

  if (!trimmedModel) {
    return null
  }

  return {
    id: 'openai-compatible',
    model: trimmedModel,
    glossary: normalizeGlossaryForCache(glossary) || null
  }
}

function normalizeTranslationBatchSize(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return translationBatchSize
  }

  return Math.max(minimumTranslationBatchSize, Math.floor(value as number))
}

function chunkTranslationSegments(segments: SubtitleTranslationSegment[], batchSize = translationBatchSize): SubtitleTranslationSegment[][] {
  const chunks: SubtitleTranslationSegment[][] = []

  for (let index = 0; index < segments.length; index += batchSize) {
    chunks.push(segments.slice(index, index + batchSize))
  }

  return chunks
}

function throwIfTranslationAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new SubtitleTranslationError('cancelled', '字幕翻译已取消。')
  }
}

function isRetryableTranslationError(error: unknown): boolean {
  return (
    error instanceof SubtitleTranslationError &&
    (error.code === 'network-error' ||
      (error.code === 'http-error' && (error.status === 429 || (error.status ?? 0) >= 500)))
  )
}

async function waitForTranslationRetry(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
  throwIfTranslationAborted(signal)

  if (delayMs <= 0) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new SubtitleTranslationError('cancelled', '字幕翻译已取消。'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function translateBatchWithRetry(options: {
  sourceLanguage: string
  targetLanguage: SubtitleTargetLanguageId
  segments: SubtitleTranslationSegment[]
  context?: SubtitleTranslationContext
  glossary?: SubtitleTranslationGlossaryEntry[]
  provider: SubtitleTranslationProvider
  signal?: AbortSignal
  retryDelaysMs: readonly number[]
}): Promise<SubtitleTranslationSegment[]> {
  for (let attempt = 0; ; attempt += 1) {
    throwIfTranslationAborted(options.signal)

    try {
      return await options.provider.translateBatch({
        sourceLanguage: options.sourceLanguage,
        targetLanguage: options.targetLanguage,
        segments: options.segments,
        context: options.context,
        glossary: options.glossary,
        signal: options.signal
      })
    } catch (error) {
      if (!isRetryableTranslationError(error) || attempt >= options.retryDelaysMs.length) {
        throw error
      }

      await waitForTranslationRetry(options.retryDelaysMs[attempt] ?? 0, options.signal)
    }
  }
}

function assertProviderTranslations(
  inputSegments: SubtitleTranslationSegment[],
  translatedSegments: SubtitleTranslationSegment[]
): Map<string, string> {
  const translatedById = new Map<string, string>()

  for (const segment of translatedSegments) {
    if (!segment.id || typeof segment.text !== 'string') {
      throw new SubtitleTranslationError('invalid-response', '翻译服务返回了无效的字幕片段。')
    }

    translatedById.set(segment.id, segment.text)
  }

  for (const segment of inputSegments) {
    if (!translatedById.has(segment.id)) {
      throw new SubtitleTranslationError('invalid-response', `翻译服务缺少字幕片段：${segment.id}`)
    }
  }

  return translatedById
}

function createTranslationContext(options: {
  segments: SubtitleTranslationSegment[]
  translatedById: Map<string, string>
  startIndex: number
  endIndex: number
}): SubtitleTranslationContext {
  const previous = options.segments
    .slice(Math.max(0, options.startIndex - translationContextWindowSize), options.startIndex)
    .map((segment) => ({
      ...segment,
      translatedText: options.translatedById.get(segment.id)
    }))
  const next = options.segments.slice(options.endIndex, options.endIndex + translationContextWindowSize)

  return { previous, next }
}

async function translateSegments(options: {
  segments: TranscriptSegment[]
  sourceLanguage: string
  targetLanguage: SubtitleTargetLanguageId
  provider: SubtitleTranslationProvider
  signal?: AbortSignal
  onProgress?: (progress: SubtitleTranslationProgress) => void
  retryDelaysMs: readonly number[]
}): Promise<TranscriptSegment[]> {
  const inputSegments = options.segments.map((segment, index) => ({
    id: `cue-${index + 1}`,
    text: segment.text
  }))
  const translatedById = new Map<string, string>()

  const chunks = chunkTranslationSegments(inputSegments)

  for (const [index, chunk] of chunks.entries()) {
    const chunkStartIndex = index * translationBatchSize
    const context = createTranslationContext({
      segments: inputSegments,
      translatedById,
      startIndex: chunkStartIndex,
      endIndex: chunkStartIndex + chunk.length
    })
    const translatedChunk = await translateBatchWithRetry({
      sourceLanguage: options.sourceLanguage,
      targetLanguage: options.targetLanguage,
      segments: chunk,
      context,
      glossary: parseSubtitleTranslationGlossary(options.provider.glossary),
      provider: options.provider,
      signal: options.signal,
      retryDelaysMs: options.retryDelaysMs
    })
    const chunkTranslations = assertProviderTranslations(chunk, translatedChunk)

    for (const [id, text] of chunkTranslations) {
      translatedById.set(id, text)
    }

    options.onProgress?.({
      completedBatches: index + 1,
      totalBatches: chunks.length,
      percent: (index + 1) / chunks.length
    })
  }

  return options.segments.map((segment, index) => ({
    ...segment,
    text: translatedById.get(`cue-${index + 1}`) ?? segment.text
  }))
}

async function translateSegmentRange(options: {
  segments: TranscriptSegment[]
  startIndex: number
  endIndex: number
  previousTranslatedSegments: TranscriptSegment[]
  sourceLanguage: string
  targetLanguage: SubtitleTargetLanguageId
  provider: SubtitleTranslationProvider
  batchSize?: number
  signal?: AbortSignal
  onProgress?: (progress: SubtitleTranslationProgress) => void
  retryDelaysMs: readonly number[]
}): Promise<TranscriptSegment[]> {
  const inputSegments = options.segments.map((segment, index) => ({ id: `cue-${index + 1}`, text: segment.text }))
  const translatedById = new Map<string, string>()

  for (const [index, segment] of options.previousTranslatedSegments.entries()) {
    translatedById.set(`cue-${index + 1}`, segment.text)
  }

  const pendingSegments = inputSegments.slice(options.startIndex, options.endIndex)
  const batchSize = normalizeTranslationBatchSize(options.batchSize)
  const chunks = chunkTranslationSegments(pendingSegments, batchSize)

  for (const [chunkIndex, chunk] of chunks.entries()) {
    const chunkStartIndex = options.startIndex + chunkIndex * batchSize
    const context = createTranslationContext({
      segments: inputSegments,
      translatedById,
      startIndex: chunkStartIndex,
      endIndex: chunkStartIndex + chunk.length
    })
    const translatedChunk = await translateBatchWithRetry({
      sourceLanguage: options.sourceLanguage,
      targetLanguage: options.targetLanguage,
      segments: chunk,
      context,
      glossary: parseSubtitleTranslationGlossary(options.provider.glossary),
      provider: options.provider,
      signal: options.signal,
      retryDelaysMs: options.retryDelaysMs
    })
    const chunkTranslations = assertProviderTranslations(chunk, translatedChunk)

    for (const [id, text] of chunkTranslations) {
      translatedById.set(id, text)
    }

    options.onProgress?.({
      completedBatches: chunkIndex + 1,
      totalBatches: chunks.length,
      percent: (chunkIndex + 1) / chunks.length
    })
  }

  return options.segments.slice(0, options.endIndex).map((segment, index) => ({
    ...segment,
    text: translatedById.get(`cue-${index + 1}`) ?? segment.text
  }))
}

export type RunIncrementalSubtitleTranslationJobOptions = {
  sourceSubtitlePath: string
  cacheDirectory: string
  sourceLanguage?: string
  targetLanguage: SubtitleTargetLanguageId
  provider: SubtitleTranslationProvider
  batchSize?: number
  outputPaths?: SubtitleTranslationOutputPaths
  previousTranslatedSubtitlePath?: string
  translatedCueCount?: number
  flush?: boolean
  signal?: AbortSignal
  onProgress?: (progress: SubtitleTranslationProgress) => void
  retryDelaysMs?: readonly number[]
}

export type RunIncrementalSubtitleTranslationJobResult = SubtitleTranslationOutputPaths & {
  translationStats: AsrSubtitleTranslationStats
  translatedCueCount: number
  changed: boolean
}

export async function runIncrementalSubtitleTranslationJob(
  options: RunIncrementalSubtitleTranslationJobOptions
): Promise<RunIncrementalSubtitleTranslationJobResult> {
  const startedAt = performance.now()
  const sourceLanguage = options.sourceLanguage ?? 'auto'
  const batchSize = normalizeTranslationBatchSize(options.batchSize)
  const sourceSegments = parseVtt(await readFile(options.sourceSubtitlePath, 'utf8'))
  const outputPaths = options.outputPaths ?? getStreamingSubtitleTranslationOutputPaths({
    cacheDirectory: options.cacheDirectory,
    sourceSubtitlePath: options.sourceSubtitlePath,
    sourceLanguage,
    targetLanguage: options.targetLanguage,
    provider: options.provider
  })
  const previousPath = options.previousTranslatedSubtitlePath ?? outputPaths.subtitlePath
  let previousTranslatedSegments: TranscriptSegment[] = []

  if (await pathExists(previousPath)) {
    try {
      previousTranslatedSegments = parseVtt(await readFile(previousPath, 'utf8'))
    } catch {
      previousTranslatedSegments = []
    }
  }

  const translatedCueCount = Math.min(
    Math.max(0, options.translatedCueCount ?? previousTranslatedSegments.length),
    previousTranslatedSegments.length,
    sourceSegments.length
  )
  const endIndex = options.flush
    ? sourceSegments.length
    : Math.floor(sourceSegments.length / batchSize) * batchSize
  const translationBatchCount = Math.ceil(Math.max(0, endIndex - translatedCueCount) / batchSize)
  const createStats = (cacheHit: boolean): AsrSubtitleTranslationStats => ({
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
    subtitleCueCount: endIndex,
    translationBatchCount,
    cacheHit
  })

  if (endIndex <= translatedCueCount) {
    return {
      ...outputPaths,
      translationStats: createStats(true),
      translatedCueCount,
      changed: false
    }
  }

  throwIfTranslationAborted(options.signal)
  const translatedSegments = await translateSegmentRange({
    segments: sourceSegments,
    startIndex: translatedCueCount,
    endIndex,
    previousTranslatedSegments: previousTranslatedSegments.slice(0, translatedCueCount),
    batchSize,
    sourceLanguage,
    targetLanguage: options.targetLanguage,
    provider: options.provider,
    signal: options.signal,
    onProgress: options.onProgress,
    retryDelaysMs: options.retryDelaysMs ?? defaultTranslationRetryDelaysMs
  })

  await mkdir(dirname(outputPaths.subtitlePath), { recursive: true })
  const temporaryVttPath = `${outputPaths.subtitlePath}.tmp`
  const temporarySrtPath = `${outputPaths.subtitleSrtPath}.tmp`

  try {
    await writeFile(temporaryVttPath, writeVtt(translatedSegments), 'utf8')
    await writeFile(temporarySrtPath, writeSrt(translatedSegments), 'utf8')
    throwIfTranslationAborted(options.signal)
    await rename(temporaryVttPath, outputPaths.subtitlePath)
    await rename(temporarySrtPath, outputPaths.subtitleSrtPath)
  } finally {
    await unlink(temporaryVttPath).catch(() => undefined)
    await unlink(temporarySrtPath).catch(() => undefined)
  }

  return {
    ...outputPaths,
    translationStats: createStats(false),
    translatedCueCount: endIndex,
    changed: true
  }
}

export async function promoteIncrementalSubtitleTranslationCache(options: {
  sourceSubtitlePath: string
  sourceLanguage?: string
  targetLanguage: SubtitleTargetLanguageId
  provider: SubtitleTranslationProviderRef
  translatedSubtitlePath: string
  translatedSubtitleSrtPath: string
  cacheDirectory: string
}): Promise<SubtitleTranslationOutputPaths> {
  const sourceLanguage = options.sourceLanguage ?? 'auto'
  const sourceSubtitleText = await readFile(options.sourceSubtitlePath, 'utf8')
  const outputBase = getTranslatedSubtitleOutputBase({
    cacheDirectory: options.cacheDirectory,
    sourceSubtitlePath: options.sourceSubtitlePath,
    sourceSubtitleText,
    sourceLanguage,
    targetLanguage: options.targetLanguage,
    provider: options.provider
  })
  const outputPaths = getTranslatedSubtitleOutputPaths(outputBase)
  await mkdir(dirname(outputPaths.subtitlePath), { recursive: true })
  await copyFile(options.translatedSubtitlePath, outputPaths.subtitlePath)
  await copyFile(options.translatedSubtitleSrtPath, outputPaths.subtitleSrtPath)
  return outputPaths
}

function extractJsonArrayText(content: string): string {
  const trimmed = content.trim()
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const startIndex = trimmed.indexOf('[')
  const endIndex = trimmed.lastIndexOf(']')

  if (startIndex >= 0 && endIndex > startIndex) {
    return trimmed.slice(startIndex, endIndex + 1)
  }

  return trimmed
}

function parseProviderContent(content: string): SubtitleTranslationSegment[] {
  let parsed: unknown

  try {
    parsed = JSON.parse(extractJsonArrayText(content)) as unknown
  } catch (error) {
    throw new SubtitleTranslationError('invalid-json', '翻译服务返回的内容不是有效 JSON。', {
      cause: error
    })
  }

  if (!Array.isArray(parsed)) {
    throw new SubtitleTranslationError('invalid-response', '翻译服务没有返回 JSON 数组。')
  }

  return parsed.map((item) => {
    const value = item as Partial<SubtitleTranslationSegment>

    if (typeof value.id !== 'string' || typeof value.text !== 'string') {
      throw new SubtitleTranslationError('invalid-response', '翻译服务返回了无效的 JSON 结构。')
    }

    return {
      id: value.id,
      text: value.text
    }
  })
}

export async function runSubtitleTranslationJob(
  options: RunSubtitleTranslationJobOptions
): Promise<RunSubtitleTranslationJobResult> {
  const startedAt = performance.now()
  const sourceLanguage = options.sourceLanguage ?? 'auto'
  const sourceSubtitleText = await readFile(options.sourceSubtitlePath, 'utf8')
  const sourceSegments = parseVtt(sourceSubtitleText)
  const translationBatchCount = Math.ceil(sourceSegments.length / translationBatchSize)
  const createTranslationStats = (cacheHit: boolean): AsrSubtitleTranslationStats => ({
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
    subtitleCueCount: sourceSegments.length,
    translationBatchCount,
    cacheHit
  })
  const outputBase = getTranslatedSubtitleOutputBase({
    cacheDirectory: options.cacheDirectory,
    sourceSubtitlePath: options.sourceSubtitlePath,
    sourceSubtitleText,
    sourceLanguage,
    targetLanguage: options.targetLanguage,
    provider: options.provider
  })
  const outputPaths = getTranslatedSubtitleOutputPaths(outputBase)

  if (await hasTranslationPair(outputPaths)) {
    return { ...outputPaths, translationStats: createTranslationStats(true) }
  }

  const legacyOutputPaths = getTranslatedSubtitleOutputPaths(
    getLegacyTranslatedSubtitleOutputBase({
      cacheDirectory: options.cacheDirectory,
      sourceSubtitlePath: options.sourceSubtitlePath,
      sourceSubtitleText,
      sourceLanguage,
      targetLanguage: options.targetLanguage,
      provider: options.provider
    })
  )

  if (await hasTranslationPair(legacyOutputPaths)) {
    try {
      await copyLegacyTranslationCache(legacyOutputPaths, outputPaths)
      if (await hasTranslationPair(outputPaths)) {
        return { ...outputPaths, translationStats: createTranslationStats(true) }
      }
    } catch {
      // Keep using the legacy cache when promotion cannot be completed.
    }

    return { ...legacyOutputPaths, translationStats: createTranslationStats(true) }
  }

  throwIfTranslationAborted(options.signal)

  if (sourceSegments.length === 0) {
    throw new Error('当前字幕没有可翻译的内容。')
  }

  const translatedSegments = await translateSegments({
    segments: sourceSegments,
    sourceLanguage,
    targetLanguage: options.targetLanguage,
    provider: options.provider,
    signal: options.signal,
    onProgress: options.onProgress,
    retryDelaysMs: options.retryDelaysMs ?? defaultTranslationRetryDelaysMs
  })

  await mkdir(dirname(outputBase), { recursive: true })
  const temporaryVttPath = `${outputPaths.subtitlePath}.tmp`
  const temporarySrtPath = `${outputPaths.subtitleSrtPath}.tmp`

  try {
    await writeFile(temporaryVttPath, writeVtt(translatedSegments), 'utf8')
    await writeFile(temporarySrtPath, writeSrt(translatedSegments), 'utf8')
    throwIfTranslationAborted(options.signal)
    await rename(temporaryVttPath, outputPaths.subtitlePath)
    await rename(temporarySrtPath, outputPaths.subtitleSrtPath)
  } finally {
    await unlink(temporaryVttPath).catch(() => undefined)
    await unlink(temporarySrtPath).catch(() => undefined)
  }

  return { ...outputPaths, translationStats: createTranslationStats(false) }
}

export async function findSubtitleTranslationCache(
  query: SubtitleTranslationCacheQuery
): Promise<SubtitleTranslationOutputPaths | null> {
  try {
    const sourceSubtitleText = await readFile(query.sourceSubtitlePath, 'utf8')
    const outputBase = getTranslatedSubtitleOutputBase({
      cacheDirectory: query.cacheDirectory,
      sourceSubtitlePath: query.sourceSubtitlePath,
      sourceSubtitleText,
      sourceLanguage: query.sourceLanguage ?? 'auto',
      targetLanguage: query.targetLanguage,
      provider: query.provider
    })
    const outputPaths = getTranslatedSubtitleOutputPaths(outputBase)

    if (await hasTranslationPair(outputPaths)) {
      return outputPaths
    }

    const legacyOutputPaths = getTranslatedSubtitleOutputPaths(
      getLegacyTranslatedSubtitleOutputBase({
        cacheDirectory: query.cacheDirectory,
        sourceSubtitlePath: query.sourceSubtitlePath,
        sourceSubtitleText,
        sourceLanguage: query.sourceLanguage ?? 'auto',
        targetLanguage: query.targetLanguage,
        provider: query.provider
      })
    )

    if (!(await hasTranslationPair(legacyOutputPaths))) {
      return null
    }

    try {
      await copyLegacyTranslationCache(legacyOutputPaths, outputPaths)
      return (await hasTranslationPair(outputPaths)) ? outputPaths : legacyOutputPaths
    } catch {
      return legacyOutputPaths
    }
  } catch {
    return null
  }
}

export function createOpenAiCompatibleTranslationProvider(
  options: OpenAiCompatibleTranslationProviderOptions
): SubtitleTranslationProvider {
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    id: 'openai-compatible',
    model: options.model,
    glossary: normalizeGlossaryForCache(options.glossary) || null,
    async translateBatch(request): Promise<SubtitleTranslationSegment[]> {
      const contextInstruction = request.context
        ? ` Nearby subtitle context is reference-only; do not return context cues. ` +
          `Keep repeated terms consistent with previous translations. Context: ${JSON.stringify(request.context)}`
        : ''
      const glossaryInstruction = request.glossary?.length
        ? ` Apply these fixed glossary translations when the source term appears: ${JSON.stringify(request.glossary)}`
        : ''
      const headers = new Headers(options.headers)
      headers.set('Authorization', `Bearer ${options.apiKey}`)
      headers.set('Content-Type', 'application/json')
      let endpoints = [options.baseUrl]
      try {
        const resolved = await options.getEndpointCandidates?.()
        if (resolved?.length) endpoints = [...new Set(resolved)]
      } catch {
        // Keep the configured endpoint as a safe fallback when probing fails.
      }

      let response: Response | null = null
      let lastNetworkError: SubtitleTranslationError | null = null
      for (const [endpointIndex, endpoint] of endpoints.entries()) {
        try {
          response = await fetchImpl(endpoint, {
            method: 'POST',
            headers,
            signal: request.signal,
            body: JSON.stringify({
              model: options.model,
              temperature: 0,
              messages: [
                {
                  role: 'system',
                  content:
                    `Translate subtitle cues from ${request.sourceLanguage} to ${request.targetLanguage}. ` +
                    'Preserve meaning, names, numbers, and line breaks where natural. ' +
                    'Return only a JSON array of objects with the same id values and translated text values.' +
                    contextInstruction +
                    glossaryInstruction
                },
                {
                  role: 'user',
                  content: JSON.stringify(request.segments)
                }
              ]
            })
          })
        } catch (error) {
          if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
            throw new SubtitleTranslationError('cancelled', '字幕翻译已取消。', { cause: error })
          }

          lastNetworkError = new SubtitleTranslationError('network-error', '翻译服务网络请求失败。', { cause: error })
          options.onEndpointFailure?.(endpoint)
          if (endpointIndex < endpoints.length - 1) continue
          throw lastNetworkError
        }

        if (response.ok || response.status < 500 || endpointIndex === endpoints.length - 1) break
        if (response.body) await response.body.cancel().catch(() => undefined)
        options.onEndpointFailure?.(endpoint)
        response = null
      }

      if (!response) {
        throw lastNetworkError ?? new SubtitleTranslationError('network-error', '翻译服务网络请求失败。')
      }

      if (!response.ok) {
        const statusText = response.statusText.trim()
        throw new SubtitleTranslationError(
          'http-error',
          `翻译服务请求失败：HTTP ${response.status}${statusText ? ` ${statusText}` : ''}。`,
          {
            status: response.status,
            statusText: response.statusText || undefined,
            responseBody: truncateDiagnosticBody(await response.text().catch(() => ''))
          }
        )
      }

      let payload: { choices?: Array<{ message?: { content?: unknown } }> }
      let responseBody = ''

      try {
        responseBody = await response.text()
        payload = JSON.parse(responseBody) as { choices?: Array<{ message?: { content?: unknown } }> }
      } catch (error) {
        throw new SubtitleTranslationError('invalid-json', '翻译服务返回的内容不是有效 JSON。', {
          cause: error,
          responseBody: truncateDiagnosticBody(responseBody ?? '')
        })
      }

      const content = payload.choices?.[0]?.message?.content

      if (typeof content !== 'string') {
        throw new SubtitleTranslationError('invalid-response', '翻译服务响应中没有文本内容。')
      }

      return parseProviderContent(content)
    }
  }
}
