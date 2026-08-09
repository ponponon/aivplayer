import { createHttpDramaMediaProvider, type HttpDramaMediaProviderOptions } from './drama-media-provider'
import type { DramaGenerationParameters } from '../../shared/drama-types'
import type { DramaGenerationProvider } from './drama-generation-worker'

const DEFAULT_MODEL = 'doubao-seedance-2-0-260128'
const ARK_TASKS_PATH = '/contents/generations/tasks'
const FORWARDED_PARAMETERS = [
  'ratio',
  'duration',
  'frames',
  'resolution',
  'generate_audio',
  'generateAudio',
  'watermark',
  'seed',
  'service_tier',
  'serviceTier',
  'draft',
  'execution_expires_after',
  'executionExpiresAfter'
] as const

export type ArkVideoProviderOptions = Omit<HttpDramaMediaProviderOptions, 'mediaType' | 'baseUrl'> & {
  baseUrl: string
  model?: string | null
}

/** Adapts Ark/Seedance's asynchronous task API to the shared video Provider contract. */
export function createArkVideoProvider(options: ArkVideoProviderOptions): DramaGenerationProvider {
  const endpoint = normalizeArkTasksEndpoint(options.baseUrl)
  const provider = createHttpDramaMediaProvider({
    ...options,
    mediaType: 'video',
    baseUrl: endpoint,
    model: options.model ?? DEFAULT_MODEL,
    fetchImpl: async (input, init) => {
      const url = String(input)
      if (init?.method === 'POST' && typeof init.body === 'string') {
        const sharedBody = parseRequestBody(init.body)
        const response = await (options.fetchImpl?.(url, {
          ...init,
          body: JSON.stringify(toArkRequestBody(sharedBody))
        }) ?? fetch(url, {
          ...init,
          body: JSON.stringify(toArkRequestBody(sharedBody))
        }))
        return await normalizeArkResponse(response, endpoint)
      }
      if (init?.method === 'GET' && isArkTaskEndpoint(url, endpoint)) {
        const response = await (options.fetchImpl?.(url, init) ?? fetch(url, init))
        return await normalizeArkResponse(response, endpoint)
      }
      return options.fetchImpl?.(input, init) ?? fetch(input, init)
    }
  })
  return provider
}

type SharedRequestBody = {
  prompt?: unknown
  model?: unknown
  parameters?: unknown
}

function toArkRequestBody(sharedBody: SharedRequestBody): Record<string, unknown> {
  const parameters = normalizeParameters(sharedBody.parameters)
  const model = typeof sharedBody.model === 'string' && sharedBody.model.trim()
    ? sharedBody.model.trim()
    : DEFAULT_MODEL
  const prompt = typeof sharedBody.prompt === 'string' ? sharedBody.prompt : ''
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }]
  const firstFrameUrl = stringParameter(parameters, ['first_frame_url', 'firstFrameUrl'])
  const lastFrameUrl = stringParameter(parameters, ['last_frame_url', 'lastFrameUrl'])
  if (firstFrameUrl) content.push({ type: 'image_url', image_url: { url: firstFrameUrl }, role: 'first_frame' })
  if (lastFrameUrl) content.push({ type: 'image_url', image_url: { url: lastFrameUrl }, role: 'last_frame' })

  const body: Record<string, unknown> = { model, content }
  for (const key of FORWARDED_PARAMETERS) {
    const value = parameters[key]
    if (value !== undefined) body[toArkParameterName(key)] = value
  }
  return body
}

async function normalizeArkResponse(response: Response, endpoint: string): Promise<Response> {
  if (!response.ok) return response
  const text = await response.text()
  return new Response((() => {
    try {
      return JSON.stringify(toSharedResponse(JSON.parse(text) as unknown, endpoint))
    } catch {
      return text
    }
  })(), {
    status: response.status,
    statusText: response.statusText,
    headers: { 'content-type': 'application/json' }
  })
}

function toSharedResponse(value: unknown, endpoint: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const object = value as Record<string, unknown>
  const nested = object.data && typeof object.data === 'object' && !Array.isArray(object.data)
    ? object.data as Record<string, unknown>
    : undefined
  const id = firstString(object, ['id', 'task_id', 'taskId']) ?? firstString(nested, ['id', 'task_id', 'taskId'])
  const content = object.content && typeof object.content === 'object' && !Array.isArray(object.content)
    ? object.content as Record<string, unknown>
    : nested?.content && typeof nested.content === 'object' && !Array.isArray(nested.content)
      ? nested.content as Record<string, unknown>
      : undefined
  const videoUrl = firstString(content, ['video_url', 'videoUrl', 'url'])
  const rawStatus = firstString(object, ['status', 'state']) ?? firstString(nested, ['status', 'state'])
  const status = rawStatus?.toLowerCase() === 'expired' ? 'failed' : rawStatus
  const error = errorMessage(object.error ?? nested?.error) ?? firstString(object, ['message']) ?? firstString(nested, ['message'])
  const shared: Record<string, unknown> = {
    status,
    error,
    model: firstString(object, ['model']) ?? firstString(nested, ['model']),
    resultUrl: videoUrl,
    cost: normalizeCost(object.cost ?? nested?.cost),
    providerId: 'ark-video'
  }
  if (id) shared.statusUrl = `${endpoint}/${encodeURIComponent(id)}`
  return shared
}

function normalizeArkTasksEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  try {
    const url = new URL(trimmed)
    if (url.pathname.endsWith(ARK_TASKS_PATH)) return url.toString()
    url.pathname = `${url.pathname === '/' ? '' : url.pathname}${ARK_TASKS_PATH}`
    return url.toString()
  } catch {
    return trimmed
  }
}

function isArkTaskEndpoint(value: string, endpoint: string): boolean {
  try {
    const url = new URL(value)
    const base = new URL(endpoint)
    return url.origin === base.origin && url.pathname.startsWith(`${base.pathname}/`)
  } catch {
    return false
  }
}

function parseRequestBody(value: string): SharedRequestBody {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as SharedRequestBody : {}
  } catch {
    return {}
  }
}

function normalizeParameters(value: unknown): DramaGenerationParameters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const parameters: DramaGenerationParameters = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') parameters[key] = item
  }
  return parameters
}

function stringParameter(parameters: DramaGenerationParameters, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = parameters[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function toArkParameterName(key: string): string {
  return key === 'generateAudio' ? 'generate_audio'
    : key === 'serviceTier' ? 'service_tier'
      : key === 'executionExpiresAfter' ? 'execution_expires_after'
        : key
}

function firstString(value: Record<string, unknown> | undefined, keys: readonly string[]): string | undefined {
  if (!value) return undefined
  for (const key of keys) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim()
  }
  return undefined
}

function errorMessage(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const object = value as Record<string, unknown>
  return firstString(object, ['message', 'code', 'detail'])
}

function normalizeCost(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) return undefined
  return Math.round(value * 1_000_000) / 1_000_000
}
