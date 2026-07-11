import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { SubtitleTargetLanguageId } from '../../shared/app-settings.ts'
import type { TranscriptSegment } from '../../shared/media-types.ts'
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

  constructor(
    code: SubtitleTranslationErrorCode,
    message: string,
    options?: { cause?: unknown; status?: number; statusText?: string }
  ) {
    super(message)
    this.name = 'SubtitleTranslationError'
    this.code = code
    this.status = options?.status
    this.statusText = options?.statusText
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

export type RunSubtitleTranslationJobResult = {
  subtitlePath: string
  subtitleSrtPath: string
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
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
}

const translationBatchSize = 30
const translationContextWindowSize = 2
const defaultTranslationRetryDelaysMs = [250, 1000] as const

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
  const safeStem = sanitizeFileStem(options.sourceSubtitlePath)
  const safeProvider = sanitizePathPart(options.provider.id)
  const safeModel = sanitizePathPart(options.provider.model)
  const cacheKey = createTranslationCacheKey(options)

  return join(
    options.cacheDirectory,
    'translated-subtitles',
    `${safeStem}-${options.targetLanguage}-${safeProvider}-${safeModel}-${cacheKey}`
  )
}

function getTranslatedSubtitleOutputPaths(outputBase: string): RunSubtitleTranslationJobResult {
  return {
    subtitlePath: `${outputBase}.vtt`,
    subtitleSrtPath: `${outputBase}.srt`
  }
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

function chunkTranslationSegments(segments: SubtitleTranslationSegment[]): SubtitleTranslationSegment[][] {
  const chunks: SubtitleTranslationSegment[][] = []

  for (let index = 0; index < segments.length; index += translationBatchSize) {
    chunks.push(segments.slice(index, index + translationBatchSize))
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

  if ((await pathExists(outputPaths.subtitlePath)) && (await pathExists(outputPaths.subtitleSrtPath))) {
    return outputPaths
  }

  throwIfTranslationAborted(options.signal)

  const sourceSegments = parseVtt(sourceSubtitleText)

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

  await mkdir(join(options.cacheDirectory, 'translated-subtitles'), { recursive: true })
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

  return outputPaths
}

export async function findSubtitleTranslationCache(
  query: SubtitleTranslationCacheQuery
): Promise<RunSubtitleTranslationJobResult | null> {
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

    if ((await pathExists(outputPaths.subtitlePath)) && (await pathExists(outputPaths.subtitleSrtPath))) {
      return outputPaths
    }

    return null
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
      const headers = new Headers({
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json'
      })
      let response: Response

      try {
        response = await fetchImpl(options.baseUrl, {
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

        throw new SubtitleTranslationError('network-error', '翻译服务网络请求失败。', {
          cause: error
        })
      }

      if (!response.ok) {
        const statusText = response.statusText.trim()
        throw new SubtitleTranslationError(
          'http-error',
          `翻译服务请求失败：HTTP ${response.status}${statusText ? ` ${statusText}` : ''}。`,
          {
            status: response.status,
            statusText: response.statusText || undefined
          }
        )
      }

      let payload: { choices?: Array<{ message?: { content?: unknown } }> }

      try {
        payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> }
      } catch (error) {
        throw new SubtitleTranslationError('invalid-json', '翻译服务返回的内容不是有效 JSON。', {
          cause: error
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
