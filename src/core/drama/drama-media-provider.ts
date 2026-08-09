import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { extname, join, resolve, sep } from 'node:path'
import type { DramaGenerationMediaType, DramaGenerationParameters, DramaGenerationTask } from '../../shared/drama-types'
import { DramaGenerationProviderError, type DramaGenerationProvider, type DramaGenerationProviderRequest, type DramaGenerationProviderResult } from './drama-generation-worker'

const DEFAULT_POLL_INTERVAL_MS = 1_500
const DEFAULT_MAX_POLLS = 120

export type HttpDramaMediaProviderOptions = {
  providerId: string
  mediaType: DramaGenerationMediaType
  baseUrl: string
  apiKey?: string | null
  model?: string | null
  costPerRequest?: number | null
  outputDirectory: string
  fetchImpl?: typeof fetch
  pollIntervalMs?: number
  maxPolls?: number
}

type MediaProviderResponse = {
  resultPath?: string
  resultUrl?: string
  base64?: string
  mimeType?: string
  statusUrl?: string
  status?: string
  progress?: number
  message?: string
  error?: string
  providerId?: string
  model?: string
  parameters?: DramaGenerationParameters
  cost?: number
}

export function createHttpDramaMediaProvider(options: HttpDramaMediaProviderOptions): DramaGenerationProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = validateBaseUrl(options.baseUrl)
  const pollIntervalMs = normalizeBoundedInteger(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS, 0, 60_000)
  const maxPolls = normalizeBoundedInteger(options.maxPolls, DEFAULT_MAX_POLLS, 1, 600)

  return {
    id: options.providerId,
    async generate(request): Promise<DramaGenerationProviderResult> {
      request.onProgress?.(0.02, '提交媒体生成请求')
      const initial = await requestJson(fetchImpl, baseUrl, {
        method: 'POST',
        headers: buildHeaders(options.apiKey),
        body: JSON.stringify({
          mediaType: options.mediaType,
          prompt: request.task.prompt,
          model: request.task.model ?? options.model ?? undefined,
          parameters: request.task.parameters,
          targetId: request.task.targetId
        }),
        signal: request.signal
      })
      const response = await resolveAsyncResponse(fetchImpl, options, request, initial, pollIntervalMs, maxPolls)
      request.onProgress?.(0.82, '准备生成结果文件')
      const resultPath = await materializeResult(fetchImpl, options, request.task, response, request.signal)
      request.onProgress?.(1, '结果文件已保存')
      return {
        resultPath,
        providerId: response.providerId ?? options.providerId,
        model: response.model ?? request.task.model ?? options.model ?? undefined,
        parameters: response.parameters ?? request.task.parameters,
        cost: response.cost ?? options.costPerRequest ?? undefined
      }
    }
  }
}

async function resolveAsyncResponse(
  fetchImpl: typeof fetch,
  options: HttpDramaMediaProviderOptions,
  request: DramaGenerationProviderRequest,
  initial: MediaProviderResponse,
  pollIntervalMs: number,
  maxPolls: number
): Promise<MediaProviderResponse> {
  if (!initial.statusUrl) return initial
  let current = initial
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (hasResult(current)) return current
    if (isFailedStatus(current.status)) throw new DramaGenerationProviderError(current.error || current.message || '媒体生成服务返回失败状态', false)
    const progress = normalizeProgress(current.progress)
    request.onProgress?.(progress == null ? Math.min(0.8, 0.1 + attempt / maxPolls * 0.7) : Math.min(0.8, progress), current.message || '等待媒体生成服务完成')
    await delay(pollIntervalMs, request.signal)
    if (!current.statusUrl) throw new DramaGenerationProviderError('媒体生成服务没有返回轮询地址', false)
    const pollUrl = current.statusUrl
    const next = await requestJson(fetchImpl, validateBaseUrl(pollUrl), {
      method: 'GET',
      headers: buildHeaders(options.apiKey),
      signal: request.signal
    })
    current = { ...next, statusUrl: next.statusUrl ?? pollUrl }
  }
  throw new DramaGenerationProviderError('媒体生成服务在限定时间内没有返回结果', true)
}

async function materializeResult(
  fetchImpl: typeof fetch,
  options: HttpDramaMediaProviderOptions,
  task: DramaGenerationTask,
  response: MediaProviderResponse,
  signal: AbortSignal
): Promise<string> {
  const localPath = response.resultPath?.trim()
  const outputDirectory = resolve(options.outputDirectory)
  if (localPath) {
    const absolutePath = resolve(localPath)
    if (absolutePath !== outputDirectory && !absolutePath.startsWith(`${outputDirectory}${sep}`)) {
      throw new DramaGenerationProviderError('媒体 Provider 返回的本地结果文件必须位于结果目录内', false)
    }
    await ensureNonEmptyFile(absolutePath)
    return absolutePath
  }

  await mkdir(outputDirectory, { recursive: true })
  let bytes: Uint8Array
  let extension: string | null = null
  if (response.base64?.trim()) {
    bytes = decodeBase64(response.base64)
    extension = extensionForMimeType(response.mimeType)
  } else if (response.resultUrl?.trim()) {
    const downloaded = await downloadResult(fetchImpl, response.resultUrl, options.apiKey, signal)
    bytes = downloaded.bytes
    extension = extensionForMimeType(response.mimeType ?? downloaded.mimeType) ?? extensionForUrl(response.resultUrl)
  } else {
    throw new DramaGenerationProviderError('媒体生成服务没有返回本地路径、结果 URL 或 Base64 内容', false)
  }
  if (bytes.byteLength === 0) throw new DramaGenerationProviderError('媒体生成服务返回了空文件', false)
  const finalPath = join(outputDirectory, `${options.mediaType}-${task.id}${extension ?? defaultExtension(options.mediaType)}`)
  const temporaryPath = `${finalPath}.part-${randomUUID()}`
  try {
    await writeFile(temporaryPath, bytes)
    await rename(temporaryPath, finalPath)
    return finalPath
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw new DramaGenerationProviderError(`保存媒体生成结果失败：${error instanceof Error ? error.message : String(error)}`, true)
  }
}

async function requestJson(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<MediaProviderResponse> {
  let response: Response
  try {
    response = await fetchImpl(url, init)
  } catch (error) {
    if (init.signal?.aborted || isAbortError(error)) throw error
    throw new DramaGenerationProviderError('媒体生成服务网络请求失败', true)
  }
  if (!response.ok) {
    const message = `媒体生成服务请求失败：HTTP ${response.status}`
    throw new DramaGenerationProviderError(message, response.status === 408 || response.status === 429 || response.status >= 500)
  }
  try {
    const payload = await response.json() as unknown
    return normalizeMediaProviderResponse(payload)
  } catch {
    throw new DramaGenerationProviderError('媒体生成服务返回的内容不是有效 JSON', false)
  }
}

async function downloadResult(fetchImpl: typeof fetch, url: string, apiKey: string | null | undefined, signal: AbortSignal): Promise<{ bytes: Uint8Array; mimeType: string | null }> {
  const normalizedUrl = validateBaseUrl(url)
  let response: Response
  try {
    response = await fetchImpl(normalizedUrl, { method: 'GET', headers: buildHeaders(apiKey), signal })
  } catch (error) {
    if (signal.aborted || isAbortError(error)) throw error
    throw new DramaGenerationProviderError('下载媒体生成结果失败', true)
  }
  if (!response.ok) throw new DramaGenerationProviderError(`下载媒体生成结果失败：HTTP ${response.status}`, response.status >= 500 || response.status === 408 || response.status === 429)
  return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType: response.headers.get('content-type') }
}

function normalizeMediaProviderResponse(value: unknown): MediaProviderResponse {
  if (!value || typeof value !== 'object') throw new DramaGenerationProviderError('媒体生成服务返回的数据结构无效', false)
  const object = value as Record<string, unknown>
  const nested = object.data && typeof object.data === 'object' ? object.data as Record<string, unknown> : undefined
  const outputs = Array.isArray(object.outputs) ? object.outputs : nested && Array.isArray(nested.outputs) ? nested.outputs : []
  const firstOutput = outputs[0] && typeof outputs[0] === 'object' ? outputs[0] as Record<string, unknown> : undefined
  const resultPath = firstString(object, ['resultPath', 'result_path']) ?? firstString(nested, ['resultPath', 'result_path'])
  const resultUrl = firstString(object, ['resultUrl', 'result_url', 'url', 'outputUrl', 'output_url'])
    ?? firstString(nested, ['resultUrl', 'result_url', 'url', 'outputUrl', 'output_url'])
    ?? firstString(firstOutput, ['url', 'resultUrl', 'result_url', 'outputUrl', 'output_url'])
  const base64 = firstString(object, ['base64', 'content']) ?? firstString(nested, ['base64', 'content'])
  const statusUrl = firstString(object, ['statusUrl', 'status_url', 'pollUrl', 'poll_url']) ?? firstString(nested, ['statusUrl', 'status_url', 'pollUrl', 'poll_url'])
  const progress = normalizeProgress(object.progress ?? nested?.progress)
  const parameters = normalizeParameters(object.parameters ?? nested?.parameters)
  const cost = normalizeCost(object.cost ?? object.actualCost ?? object.actual_cost ?? nested?.cost ?? nested?.actualCost ?? nested?.actual_cost)
  return {
    resultPath,
    resultUrl,
    base64,
    mimeType: firstString(object, ['mimeType', 'mime_type', 'contentType', 'content_type']) ?? firstString(nested, ['mimeType', 'mime_type', 'contentType', 'content_type']),
    statusUrl,
    status: firstString(object, ['status', 'state']) ?? firstString(nested, ['status', 'state']),
    progress,
    message: firstString(object, ['message']) ?? firstString(nested, ['message']),
    error: firstString(object, ['error']) ?? firstString(nested, ['error']),
    providerId: firstString(object, ['providerId', 'provider_id']) ?? firstString(nested, ['providerId', 'provider_id']),
    model: firstString(object, ['model']) ?? firstString(nested, ['model']),
    parameters,
    cost
  }
}

function normalizeParameters(value: unknown): DramaGenerationParameters | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const parameters: DramaGenerationParameters = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') parameters[key] = item
  }
  return parameters
}

function firstString(value: Record<string, unknown> | undefined, keys: readonly string[]): string | undefined {
  if (!value) return undefined
  for (const key of keys) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim()
  }
  return undefined
}

function normalizeCost(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) return undefined
  return Math.round(value * 1_000_000) / 1_000_000
}

function hasResult(response: MediaProviderResponse): boolean {
  return Boolean(response.resultPath?.trim() || response.resultUrl?.trim() || response.base64?.trim())
}

function isFailedStatus(value: string | undefined): boolean {
  return value != null && ['failed', 'error', 'cancelled', 'canceled'].includes(value.toLowerCase())
}

function validateBaseUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) throw new Error('invalid')
    return url.toString()
  } catch {
    throw new DramaGenerationProviderError('媒体 Provider 地址必须是不含账号密码的 HTTP(S) 地址', false)
  }
}

function buildHeaders(apiKey: string | null | undefined): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(apiKey?.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {})
  }
}

function decodeBase64(value: string): Uint8Array {
  try {
    const normalized = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value
    return Uint8Array.from(Buffer.from(normalized, 'base64'))
  } catch {
    throw new DramaGenerationProviderError('媒体生成服务返回的 Base64 内容无效', false)
  }
}

function extensionForMimeType(value: string | null | undefined): string | null {
  const mime = value?.split(';', 1)[0]?.trim().toLowerCase()
  if (!mime) return null
  const extensions: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/ogg': '.ogg'
  }
  return extensions[mime] ?? null
}

function extensionForUrl(value: string): string | null {
  try {
    const extension = extname(new URL(value).pathname).toLowerCase()
    return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : null
  } catch {
    return null
  }
}

function defaultExtension(mediaType: DramaGenerationMediaType): string {
  return mediaType === 'image' ? '.png' : mediaType === 'video' ? '.mp4' : '.wav'
}

async function ensureNonEmptyFile(filePath: string): Promise<void> {
  try {
    const file = await stat(filePath)
    if (!file.isFile() || file.size === 0) throw new Error('empty')
  } catch {
    throw new DramaGenerationProviderError('媒体 Provider 返回的本地结果文件不存在或为空', false)
  }
}

function normalizeProgress(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const normalized = value > 1 ? value / 100 : value
  return Math.min(1, Math.max(0, normalized))
}

function normalizeBoundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.floor(value))) : fallback
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve()
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(resolvePromise, milliseconds)
    const abort = (): void => {
      clearTimeout(timer)
      const error = new Error('媒体 Provider 请求已取消')
      error.name = 'AbortError'
      reject(error)
    }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}
