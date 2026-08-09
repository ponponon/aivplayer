import { mkdir, rm, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { DramaGenerationProviderError, type DramaGenerationProvider, type DramaGenerationProviderRequest, type DramaGenerationProviderResult } from './drama-generation-worker'

const DEFAULT_MODEL = 'gpt-4o-mini-tts'
const DEFAULT_VOICE = 'alloy'
const AUDIO_FORMATS = new Set(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'])

export type OpenAICompatibleAudioProviderOptions = {
  providerId: string
  baseUrl: string
  apiKey?: string | null
  model?: string | null
  costPerRequest?: number | null
  outputDirectory: string
  fetchImpl?: typeof fetch
}

/** Adapts the synchronous OpenAI-compatible /audio/speech binary response. */
export function createOpenAICompatibleAudioProvider(options: OpenAICompatibleAudioProviderOptions): DramaGenerationProvider {
  const endpoint = normalizeSpeechEndpoint(options.baseUrl)
  const fetchImpl = options.fetchImpl ?? fetch
  return {
    id: options.providerId,
    async generate(request): Promise<DramaGenerationProviderResult> {
      request.onProgress?.(0.02, '提交语音生成请求')
      const body = buildSpeechRequestBody(request, options.model)
      let response: Response
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'audio/*',
            'Content-Type': 'application/json',
            ...(options.apiKey?.trim() ? { Authorization: `Bearer ${options.apiKey.trim()}` } : {})
          },
          body: JSON.stringify(body),
          signal: request.signal
        })
      } catch (error) {
        if (request.signal.aborted || isAbortError(error)) throw error
        throw new DramaGenerationProviderError('语音生成服务网络请求失败', true)
      }
      if (!response.ok) {
        throw new DramaGenerationProviderError(`语音生成服务请求失败：HTTP ${response.status}`, response.status === 408 || response.status === 429 || response.status >= 500)
      }
      request.onProgress?.(0.82, '保存语音生成结果')
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength === 0) throw new DramaGenerationProviderError('语音生成服务返回了空文件', false)
      const format = body.response_format as string
      const extension = AUDIO_FORMATS.has(format) ? format : extensionForContentType(response.headers.get('content-type')) ?? 'mp3'
      await mkdir(options.outputDirectory, { recursive: true })
      const resultPath = join(options.outputDirectory, `audio-${request.task.id}.${extension}`)
      const temporaryPath = `${resultPath}.part-${randomUUID()}`
      try {
        await writeFile(temporaryPath, bytes)
        await rename(temporaryPath, resultPath)
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => undefined)
        throw new DramaGenerationProviderError(`保存语音生成结果失败：${error instanceof Error ? error.message : String(error)}`, true)
      }
      request.onProgress?.(1, '语音结果已保存')
      return {
        resultPath,
        providerId: options.providerId,
        model: body.model as string,
        parameters: request.task.parameters,
        cost: options.costPerRequest ?? undefined
      }
    }
  }
}

function buildSpeechRequestBody(request: DramaGenerationProviderRequest, configuredModel?: string | null): Record<string, string | number> {
  if (request.task.prompt.length > 4096) throw new DramaGenerationProviderError('语音生成文本不能超过 4096 个字符', false)
  const parameters = request.task.parameters
  const model = typeof request.task.model === 'string' && request.task.model.trim() ? request.task.model.trim() : configuredModel?.trim() || DEFAULT_MODEL
  const voice = typeof parameters.voice === 'string' && parameters.voice.trim() ? parameters.voice.trim() : DEFAULT_VOICE
  const formatValue = parameters.response_format ?? parameters.responseFormat
  const responseFormat = typeof formatValue === 'string' && AUDIO_FORMATS.has(formatValue) ? formatValue : 'mp3'
  if (parameters.stream_format === 'sse' || parameters.streamFormat === 'sse') throw new DramaGenerationProviderError('语音 Provider 只支持二进制音频响应，不支持 SSE 流式格式', false)
  const body: Record<string, string | number> = { model, input: request.task.prompt, voice, response_format: responseFormat }
  if (typeof parameters.instructions === 'string' && parameters.instructions.trim()) body.instructions = parameters.instructions.trim()
  const speed = parameters.speed
  if (typeof speed === 'number') {
    if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) throw new DramaGenerationProviderError('语音速度必须在 0.25 到 4 之间', false)
    body.speed = speed
  }
  return body
}

function normalizeSpeechEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  try {
    const url = new URL(trimmed)
    if (url.pathname.endsWith('/audio/speech')) return url.toString()
    if (url.pathname.endsWith('/v1')) {
      url.pathname = `${url.pathname}/audio/speech`
      return url.toString()
    }
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/v1/audio/speech'
      return url.toString()
    }
  } catch {
    // The eventual fetch error remains the provider-level failure for malformed URLs.
  }
  return trimmed
}

function extensionForContentType(value: string | null): string | undefined {
  const mime = value?.split(';', 1)[0]?.trim().toLowerCase()
  return mime === 'audio/mpeg' ? 'mp3'
    : mime === 'audio/ogg' ? 'opus'
      : mime === 'audio/aac' ? 'aac'
        : mime === 'audio/flac' ? 'flac'
          : mime === 'audio/wav' || mime === 'audio/x-wav' ? 'wav'
            : undefined
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
