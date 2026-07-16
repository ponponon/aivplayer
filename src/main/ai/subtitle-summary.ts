import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { SubtitleTargetLanguageId } from '../../shared/app-settings.ts'
import type { AsrSubtitleSummary, AsrSubtitleSummaryCharacter, AsrSubtitleSummaryStats, TranscriptSegment } from '../../shared/media-types.ts'
import { parseVtt } from './subtitle-writer.ts'
import { pathExists } from './model-manager.ts'

export type SubtitleSummaryProviderRef = { id: 'openai-compatible'; model: string }
export type SubtitleSummaryProgress = { completedSteps: number; totalSteps: number; percent: number }
export type SubtitleSummaryProvider = {
  id: 'openai-compatible'
  model: string
  complete: (request: { system: string; user: string; signal?: AbortSignal }) => Promise<string>
}
export type SubtitleSummaryJobOptions = {
  sourceSubtitlePath: string
  cacheDirectory: string
  sourceLanguage?: string
  targetLanguage: SubtitleTargetLanguageId
  force?: boolean
  provider: SubtitleSummaryProvider
  signal?: AbortSignal
  onProgress?: (progress: SubtitleSummaryProgress) => void
}
export type SubtitleSummaryCacheQuery = Omit<SubtitleSummaryJobOptions, 'signal' | 'onProgress' | 'provider'> & {
  provider: SubtitleSummaryProviderRef
}
export type SubtitleSummaryJobResult = {
  summary: AsrSubtitleSummary
  summaryStats: AsrSubtitleSummaryStats
}
export type OpenAiCompatibleSummaryProviderOptions = {
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
}

export type SubtitleSummaryErrorCode = 'cancelled' | 'network-error' | 'http-error' | 'invalid-json' | 'invalid-response'

export class SubtitleSummaryError extends Error {
  readonly code: SubtitleSummaryErrorCode
  readonly status?: number
  readonly statusText?: string
  readonly responseBody?: string

  constructor(code: SubtitleSummaryErrorCode, message: string, options?: { cause?: unknown; status?: number; statusText?: string; responseBody?: string }) {
    super(message)
    this.name = 'SubtitleSummaryError'
    this.code = code
    this.status = options?.status
    this.statusText = options?.statusText
    this.responseBody = options?.responseBody
    if (options?.cause !== undefined) (this as Error & { cause?: unknown }).cause = options.cause
  }
}

const summaryPromptVersion = 'summary-v1'
const summaryChunkMaxCharacters = 10_000
const summaryNoteMaxCharacters = 1_800
const summaryNotesMaxCharacters = 32_000

function truncateResponseBody(value: string): string {
  const normalized = value.trim()
  return normalized.length <= 12_000 ? normalized : `${normalized.slice(0, 12_000)}\n… [truncated]`
}

function sanitizeFileStem(filePath: string): string {
  const stem = basename(filePath, extname(filePath)).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return stem || 'subtitle'
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'default'
}

function throwIfSummaryAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new SubtitleSummaryError('cancelled', 'AI 内容总结已取消。')
}

function createSummaryCacheKey(options: { sourceSubtitlePath: string; sourceSubtitleText: string; sourceLanguage: string; targetLanguage: SubtitleTargetLanguageId; provider: SubtitleSummaryProviderRef }): string {
  const sourceTextHash = createHash('sha1').update(options.sourceSubtitleText).digest('hex')
  return createHash('sha1').update([summaryPromptVersion, options.sourceSubtitlePath, sourceTextHash, options.sourceLanguage, options.targetLanguage, options.provider.id, options.provider.model].join('\n')).digest('hex').slice(0, 12)
}

function getSummaryOutputPath(options: { cacheDirectory: string; sourceSubtitlePath: string; sourceSubtitleText: string; sourceLanguage: string; targetLanguage: SubtitleTargetLanguageId; provider: SubtitleSummaryProviderRef }): string {
  const stem = sanitizeFileStem(options.sourceSubtitlePath)
  const model = sanitizePathPart(options.provider.model)
  const key = createSummaryCacheKey(options)
  return join(options.cacheDirectory, 'summaries', `${stem}-summary-${options.targetLanguage}-${model}-${key}.json`)
}

function formatTranscriptTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainder = safeSeconds % 60
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function createTranscriptChunks(segments: TranscriptSegment[]): string[] {
  const chunks: string[] = []
  let current = ''

  for (const segment of segments) {
    const text = segment.text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const line = `[${formatTranscriptTime(segment.startSeconds)}] ${text}`
    if (current && current.length + line.length + 1 > summaryChunkMaxCharacters) {
      chunks.push(current)
      current = ''
    }
    if (line.length > summaryChunkMaxCharacters) {
      for (let index = 0; index < line.length; index += summaryChunkMaxCharacters) chunks.push(line.slice(index, index + summaryChunkMaxCharacters))
    } else {
      current = current ? `${current}\n${line}` : line
    }
  }

  if (current) chunks.push(current)
  return chunks
}

function extractJsonObjectText(content: string): string {
  const trimmed = content.trim()
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fencedMatch?.[1]) return fencedMatch[1].trim()
  const startIndex = trimmed.indexOf('{')
  const endIndex = trimmed.lastIndexOf('}')
  return startIndex >= 0 && endIndex > startIndex ? trimmed.slice(startIndex, endIndex + 1) : trimmed
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()).slice(0, 8)
}

function characterArrayValue(value: unknown): AsrSubtitleSummaryCharacter[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const name = stringValue(record.name)
    const role = stringValue(record.role)
    return name ? [{ name, role }] : []
  }).slice(0, 8)
}

function parseSummaryContent(content: string): AsrSubtitleSummary {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonObjectText(content)) as unknown
  } catch (error) {
    throw new SubtitleSummaryError('invalid-json', '总结服务返回的内容不是有效 JSON。', { cause: error })
  }
  if (!parsed || typeof parsed !== 'object') throw new SubtitleSummaryError('invalid-response', '总结服务没有返回有效的对象。')
  const value = parsed as Record<string, unknown>
  const summary: AsrSubtitleSummary = {
    title: stringValue(value.title, '未命名内容'),
    overview: stringValue(value.overview),
    synopsis: stringValue(value.synopsis),
    keyPoints: stringArrayValue(value.keyPoints),
    characters: characterArrayValue(value.characters),
    themes: stringArrayValue(value.themes),
    ending: stringValue(value.ending)
  }
  if (!summary.overview && !summary.synopsis && summary.keyPoints.length === 0) throw new SubtitleSummaryError('invalid-response', '总结服务返回的内容为空。')
  return summary
}

function readCachedSummary(value: string): AsrSubtitleSummary | null {
  try {
    const parsed = JSON.parse(value) as { summary?: unknown }
    return parsed.summary ? parseSummaryContent(JSON.stringify(parsed.summary)) : null
  } catch {
    return null
  }
}

async function hasFile(filePath: string): Promise<boolean> {
  return pathExists(filePath)
}

export function createOpenAiCompatibleSummaryProvider(options: OpenAiCompatibleSummaryProviderOptions): SubtitleSummaryProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  return {
    id: 'openai-compatible',
    model: options.model,
    async complete(request): Promise<string> {
      throwIfSummaryAborted(request.signal)
      const headers = new Headers({ Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' })
      let response: Response
      try {
        response = await fetchImpl(options.baseUrl, {
          method: 'POST',
          headers,
          signal: request.signal,
          body: JSON.stringify({ model: options.model, temperature: 0.2, messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.user }] })
        })
      } catch (error) {
        if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw new SubtitleSummaryError('cancelled', 'AI 内容总结已取消。', { cause: error })
        throw new SubtitleSummaryError('network-error', '总结服务网络请求失败。', { cause: error })
      }
      if (!response.ok) throw new SubtitleSummaryError('http-error', `总结服务请求失败：HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}。`, { status: response.status, statusText: response.statusText || undefined, responseBody: truncateResponseBody(await response.text().catch(() => '')) })
      let payload: { choices?: Array<{ message?: { content?: unknown } }> }
      let responseBody = ''
      try {
        responseBody = await response.text()
        payload = JSON.parse(responseBody) as { choices?: Array<{ message?: { content?: unknown } }> }
      } catch (error) {
        throw new SubtitleSummaryError('invalid-json', '总结服务返回的内容不是有效 JSON。', { cause: error, responseBody: truncateResponseBody(responseBody) })
      }
      const content = payload.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) throw new SubtitleSummaryError('invalid-response', '总结服务响应中没有文本内容。')
      return content
    }
  }
}

export function createSubtitleSummaryProviderRef(model: string | null | undefined): SubtitleSummaryProviderRef | null {
  const trimmedModel = model?.trim()
  return trimmedModel ? { id: 'openai-compatible', model: trimmedModel } : null
}

export async function runSubtitleSummaryJob(options: SubtitleSummaryJobOptions): Promise<SubtitleSummaryJobResult> {
  const startedAt = performance.now()
  const sourceLanguage = options.sourceLanguage ?? 'auto'
  const sourceSubtitleText = await readFile(options.sourceSubtitlePath, 'utf8')
  const segments = parseVtt(sourceSubtitleText)
  if (segments.length === 0) throw new Error('当前字幕没有可总结的内容。')
  const chunks = createTranscriptChunks(segments)
  const providerRef: SubtitleSummaryProviderRef = { id: options.provider.id, model: options.provider.model }
  const outputPath = getSummaryOutputPath({ cacheDirectory: options.cacheDirectory, sourceSubtitlePath: options.sourceSubtitlePath, sourceSubtitleText, sourceLanguage, targetLanguage: options.targetLanguage, provider: providerRef })
  const createStats = (cacheHit: boolean): AsrSubtitleSummaryStats => ({ elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)), subtitleCueCount: segments.length, chunkCount: chunks.length, cacheHit, inputCharacterCount: sourceSubtitleText.length })

  if (!options.force && await hasFile(outputPath)) {
    const cached = readCachedSummary(await readFile(outputPath, 'utf8'))
    if (cached) return { summary: cached, summaryStats: createStats(true) }
  }

  const totalSteps = chunks.length + 1
  const notes: string[] = []
  for (const [index, chunk] of chunks.entries()) {
    throwIfSummaryAborted(options.signal)
    const note = await options.provider.complete({
      signal: options.signal,
      system: `你是电影和长视频的内容分析助手。请使用${options.targetLanguage}输出阶段性剧情笔记。只依据字幕，不要臆测；忽略广告、重复台词和明显的 ASR 错误。保留人物关系、事件因果、重要转折、时间和地点。输出纯文本分点，不要写开场客套。原始语言可能是${sourceLanguage}。`,
      user: `这是第 ${index + 1} 段字幕：\n${chunk}`
    })
    notes.push(note.trim().slice(0, summaryNoteMaxCharacters))
    options.onProgress?.({ completedSteps: index + 1, totalSteps, percent: (index + 1) / totalSteps })
  }

  throwIfSummaryAborted(options.signal)
  const notesText = notes.map((note, index) => `阶段 ${index + 1}\n${note}`).join('\n\n').slice(0, summaryNotesMaxCharacters)
  const summary = parseSummaryContent(await options.provider.complete({
    signal: options.signal,
    system: `你是专业的电影解说编辑。请使用${options.targetLanguage}，根据阶段性剧情笔记生成一份准确、易读、允许剧透的内容总结。不要补写笔记中没有证据的细节。必须只返回 JSON 对象，不要 Markdown 代码块，字段必须是：title（标题）、overview（一句话概览）、synopsis（按时间顺序的剧情梗概，2-5 段）、keyPoints（3-8 条关键事件或看点）、characters（最多 8 个重要人物，每项包含 name 和 role）、themes（1-5 个主题）、ending（结局和后续，若字幕不足以判断则写“字幕信息不足，无法确认”）。`,
    user: `以下是整部内容的阶段性剧情笔记：\n${notesText}`
  }))

  await mkdir(dirname(outputPath), { recursive: true })
  const temporaryPath = `${outputPath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify({ summary }, null, 2)}\n`, 'utf8')
  throwIfSummaryAborted(options.signal)
  await rename(temporaryPath, outputPath)
  options.onProgress?.({ completedSteps: totalSteps, totalSteps, percent: 1 })
  return { summary, summaryStats: createStats(false) }
}

export async function findSubtitleSummaryCache(query: SubtitleSummaryCacheQuery): Promise<AsrSubtitleSummary | null> {
  try {
    const sourceSubtitleText = await readFile(query.sourceSubtitlePath, 'utf8')
    const outputPath = getSummaryOutputPath({ cacheDirectory: query.cacheDirectory, sourceSubtitlePath: query.sourceSubtitlePath, sourceSubtitleText, sourceLanguage: query.sourceLanguage ?? 'auto', targetLanguage: query.targetLanguage, provider: query.provider })
    if (!(await hasFile(outputPath))) return null
    return readCachedSummary(await readFile(outputPath, 'utf8'))
  } catch {
    return null
  }
}
