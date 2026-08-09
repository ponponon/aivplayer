import { createHttpDramaMediaProvider, type HttpDramaMediaProviderOptions } from './drama-media-provider'
import type { DramaGenerationProvider } from './drama-generation-worker'

const DEFAULT_MODEL = 'gpt-image-1'

export type OpenAICompatibleImageProviderOptions = Omit<HttpDramaMediaProviderOptions, 'mediaType' | 'baseUrl'> & {
  baseUrl: string
  model?: string | null
}

/**
 * Adapts the OpenAI Images API request/response shape to the shared media
 * provider contract. The endpoint remains configurable so compatible
 * gateways can be used without changing the worker.
 */
export function createOpenAICompatibleImageProvider(options: OpenAICompatibleImageProviderOptions): DramaGenerationProvider {
  const endpoint = normalizeImagesEndpoint(options.baseUrl)
  const provider = createHttpDramaMediaProvider({
    ...options,
    mediaType: 'image',
    baseUrl: endpoint,
    model: options.model ?? DEFAULT_MODEL,
    fetchImpl: async (input, init) => {
      if (init?.method !== 'POST' || typeof init.body !== 'string') return options.fetchImpl?.(input, init) ?? fetch(input, init)
      const genericBody = parseRequestBody(init.body)
      const response = await (options.fetchImpl?.(input, {
        ...init,
        body: JSON.stringify(toOpenAIRequestBody(genericBody))
      }) ?? fetch(input, {
        ...init,
        body: JSON.stringify(toOpenAIRequestBody(genericBody))
      }))
      if (!response.ok) return response
      return normalizeOpenAIResponse(response, options.providerId)
    }
  })
  return provider
}

type GenericRequestBody = {
  prompt?: unknown
  model?: unknown
  parameters?: unknown
}

function parseRequestBody(value: string): GenericRequestBody {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' ? parsed as GenericRequestBody : {}
  } catch {
    return {}
  }
}

function toOpenAIRequestBody(body: GenericRequestBody): Record<string, unknown> {
  const parameters = body.parameters && typeof body.parameters === 'object' && !Array.isArray(body.parameters)
    ? body.parameters as Record<string, unknown>
    : {}
  const request: Record<string, unknown> = {
    model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL,
    prompt: typeof body.prompt === 'string' ? body.prompt : ''
  }
  const allowedFields = ['n', 'size', 'quality', 'background', 'output_format', 'moderation', 'response_format'] as const
  for (const field of allowedFields) {
    const value = parameters[field]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') request[field] = value
  }
  return request
}

async function normalizeOpenAIResponse(response: Response, providerId: string): Promise<Response> {
  try {
    const payload = await response.clone().json() as unknown
    const object = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const data = Array.isArray(object.data) ? object.data : []
    const first = data[0] && typeof data[0] === 'object' ? data[0] as Record<string, unknown> : {}
    const outputFormat = typeof first.output_format === 'string' ? first.output_format : undefined
    const normalized = {
      base64: typeof first.b64_json === 'string' ? first.b64_json : undefined,
      resultUrl: typeof first.url === 'string' ? first.url : undefined,
      mimeType: mimeTypeForOutputFormat(outputFormat),
      providerId,
      model: typeof object.model === 'string' ? object.model : undefined
    }
    return new Response(JSON.stringify(normalized), {
      status: response.status,
      headers: { 'content-type': 'application/json' }
    })
  } catch {
    return new Response(JSON.stringify({}), {
      status: response.status,
      headers: { 'content-type': 'application/json' }
    })
  }
}

function normalizeImagesEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  try {
    const url = new URL(trimmed)
    if (url.pathname.endsWith('/images/generations')) return url.toString()
    if (url.pathname.endsWith('/v1')) {
      url.pathname = `${url.pathname}/images/generations`
      return url.toString()
    }
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/v1/images/generations'
      return url.toString()
    }
  } catch {
    // The shared provider emits the canonical validation error.
  }
  return trimmed
}

function mimeTypeForOutputFormat(value: string | undefined): string | undefined {
  if (value === 'jpeg' || value === 'jpg') return 'image/jpeg'
  if (value === 'webp') return 'image/webp'
  if (value === 'png') return 'image/png'
  return undefined
}
