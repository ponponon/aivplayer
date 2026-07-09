import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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

export type SubtitleTranslationBatchRequest = {
  sourceLanguage: string
  targetLanguage: SubtitleTargetLanguageId
  segments: SubtitleTranslationSegment[]
}

export type SubtitleTranslationProvider = {
  id: SubtitleTranslationProviderId
  model: string
  translateBatch: (request: SubtitleTranslationBatchRequest) => Promise<SubtitleTranslationSegment[]>
}

export type RunSubtitleTranslationJobOptions = {
  sourceSubtitlePath: string
  cacheDirectory: string
  sourceLanguage?: string
  targetLanguage: SubtitleTargetLanguageId
  provider: SubtitleTranslationProvider
}

export type RunSubtitleTranslationJobResult = {
  subtitlePath: string
  subtitleSrtPath: string
}

export type OpenAiCompatibleTranslationProviderOptions = {
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
}

const translationBatchSize = 30

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
  provider: SubtitleTranslationProvider
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
        options.provider.model
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
  provider: SubtitleTranslationProvider
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

function chunkTranslationSegments(segments: SubtitleTranslationSegment[]): SubtitleTranslationSegment[][] {
  const chunks: SubtitleTranslationSegment[][] = []

  for (let index = 0; index < segments.length; index += translationBatchSize) {
    chunks.push(segments.slice(index, index + translationBatchSize))
  }

  return chunks
}

function assertProviderTranslations(
  inputSegments: SubtitleTranslationSegment[],
  translatedSegments: SubtitleTranslationSegment[]
): Map<string, string> {
  const translatedById = new Map<string, string>()

  for (const segment of translatedSegments) {
    if (!segment.id || typeof segment.text !== 'string') {
      throw new Error('翻译服务返回了无效的字幕片段。')
    }

    translatedById.set(segment.id, segment.text)
  }

  for (const segment of inputSegments) {
    if (!translatedById.has(segment.id)) {
      throw new Error(`翻译服务缺少字幕片段：${segment.id}`)
    }
  }

  return translatedById
}

async function translateSegments(options: {
  segments: TranscriptSegment[]
  sourceLanguage: string
  targetLanguage: SubtitleTargetLanguageId
  provider: SubtitleTranslationProvider
}): Promise<TranscriptSegment[]> {
  const inputSegments = options.segments.map((segment, index) => ({
    id: `cue-${index + 1}`,
    text: segment.text
  }))
  const translatedById = new Map<string, string>()

  for (const chunk of chunkTranslationSegments(inputSegments)) {
    const translatedChunk = await options.provider.translateBatch({
      sourceLanguage: options.sourceLanguage,
      targetLanguage: options.targetLanguage,
      segments: chunk
    })
    const chunkTranslations = assertProviderTranslations(chunk, translatedChunk)

    for (const [id, text] of chunkTranslations) {
      translatedById.set(id, text)
    }
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
  const parsed = JSON.parse(extractJsonArrayText(content)) as unknown

  if (!Array.isArray(parsed)) {
    throw new Error('翻译服务没有返回 JSON 数组。')
  }

  return parsed.map((item) => {
    const value = item as Partial<SubtitleTranslationSegment>

    if (typeof value.id !== 'string' || typeof value.text !== 'string') {
      throw new Error('翻译服务返回了无效的 JSON 结构。')
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

  const sourceSegments = parseVtt(sourceSubtitleText)

  if (sourceSegments.length === 0) {
    throw new Error('当前字幕没有可翻译的内容。')
  }

  const translatedSegments = await translateSegments({
    segments: sourceSegments,
    sourceLanguage,
    targetLanguage: options.targetLanguage,
    provider: options.provider
  })

  await mkdir(join(options.cacheDirectory, 'translated-subtitles'), { recursive: true })
  await writeFile(outputPaths.subtitlePath, writeVtt(translatedSegments), 'utf8')
  await writeFile(outputPaths.subtitleSrtPath, writeSrt(translatedSegments), 'utf8')

  return outputPaths
}

export function createOpenAiCompatibleTranslationProvider(
  options: OpenAiCompatibleTranslationProviderOptions
): SubtitleTranslationProvider {
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    id: 'openai-compatible',
    model: options.model,
    async translateBatch(request): Promise<SubtitleTranslationSegment[]> {
      const headers = new Headers({
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json'
      })
      const response = await fetchImpl(options.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                `Translate subtitle cues from ${request.sourceLanguage} to ${request.targetLanguage}. ` +
                'Preserve meaning, names, numbers, and line breaks where natural. ' +
                'Return only a JSON array of objects with the same id values and translated text values.'
            },
            {
              role: 'user',
              content: JSON.stringify(request.segments)
            }
          ]
        })
      })

      if (!response.ok) {
        throw new Error(`翻译服务请求失败：HTTP ${response.status}`)
      }

      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: unknown } }>
      }
      const content = payload.choices?.[0]?.message?.content

      if (typeof content !== 'string') {
        throw new Error('翻译服务响应中没有文本内容。')
      }

      return parseProviderContent(content)
    }
  }
}
