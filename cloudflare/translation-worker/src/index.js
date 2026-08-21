const MODEL_ID = 'glm-4-flash-250414'
const UPSTREAM_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const DEFAULT_DAILY_REQUEST_LIMIT = 200
const DEFAULT_MAX_REQUEST_BYTES = 256 * 1024
const DEFAULT_MAX_INPUT_CHARS = 120_000
const DEFAULT_MAX_OUTPUT_TOKENS = 4096

const corsHeaders = {
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-AIVPlayer-Client, X-AIVPlayer-Device, X-AIVPlayer-Version',
  'Access-Control-Allow-Methods': 'GET, OPTIONS, POST',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store'
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, { upstreamFetch: fetch, waitUntil: ctx.waitUntil.bind(ctx) })
  }
}

export class DailyQuotaLimiter {
  constructor(ctx) {
    this.ctx = ctx
  }

  async fetch(request) {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405)
    }

    const body = await request.json().catch(() => null)
    const limit = positiveInteger(body?.limit, DEFAULT_DAILY_REQUEST_LIMIT)
    const today = new Date().toISOString().slice(0, 10)
    const current = (await this.ctx.storage.get('usage')) ?? { day: today, count: 0 }
    const usage = current.day === today ? current : { day: today, count: 0 }

    if (usage.count >= limit) {
      return jsonResponse({ allowed: false, retryAfter: secondsUntilUtcDayChange() }, 200)
    }

    await this.ctx.storage.put('usage', { day: today, count: usage.count + 1 })
    return jsonResponse({ allowed: true, remaining: limit - usage.count - 1 }, 200)
  }
}

export async function handleRequest(request, env, dependencies = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/health') {
    return jsonResponse({ status: 'ok', model: MODEL_ID })
  }

  if (request.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
    return jsonResponse({ error: 'not_found' }, 404)
  }

  if (!env.BIGMODEL_API_KEY) {
    return jsonResponse({ error: 'service_not_configured' }, 503)
  }

  if (!isPublicAuthorization(request.headers.get('authorization'))) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  const rawBody = await request.text()
  const maxRequestBytes = positiveInteger(env.MAX_REQUEST_BYTES, DEFAULT_MAX_REQUEST_BYTES)
  if (byteLength(rawBody) > maxRequestBytes) {
    return jsonResponse({ error: 'request_too_large' }, 413)
  }

  const body = parseJsonObject(rawBody)
  if (!body) return jsonResponse({ error: 'invalid_json' }, 400)

  const inputChars = countMessageCharacters(body.messages)
  const maxInputChars = positiveInteger(env.MAX_INPUT_CHARS, DEFAULT_MAX_INPUT_CHARS)
  if (!Array.isArray(body.messages) || body.messages.length === 0 || inputChars > maxInputChars) {
    return jsonResponse({ error: 'invalid_messages' }, 400)
  }

  const identities = await getIdentityKeys(request)
  if (env.BURST_LIMITER) {
    for (const identity of identities) {
      const burstResult = await env.BURST_LIMITER.limit({ key: identity })
      if (!burstResult.success) {
        return jsonResponse({ error: 'rate_limited', retry_after: 60 }, 429, { 'Retry-After': '60' })
      }
    }
  }

  const dailyLimit = positiveInteger(env.DAILY_REQUEST_LIMIT, DEFAULT_DAILY_REQUEST_LIMIT)
  for (const identity of identities) {
    const dailyResult = await consumeDailyQuota(env, identity, dailyLimit)
    if (!dailyResult.allowed) {
      const retryAfter = String(dailyResult.retryAfter ?? secondsUntilUtcDayChange())
      return jsonResponse({ error: 'daily_quota_exceeded', retry_after: Number(retryAfter) }, 429, {
        'Retry-After': retryAfter
      })
    }
  }

  const maxOutputTokens = positiveInteger(env.MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS)
  const upstreamBody = {
    ...body,
    model: MODEL_ID,
    max_tokens: Math.min(positiveInteger(body.max_tokens, maxOutputTokens), maxOutputTokens)
  }
  const upstreamFetch = dependencies.upstreamFetch ?? fetch
  const upstreamResponse = await upstreamFetch(UPSTREAM_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.BIGMODEL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(upstreamBody),
    signal: request.signal
  }).catch(() => null)

  if (!upstreamResponse) {
    return jsonResponse({ error: 'upstream_unavailable' }, 502)
  }

  const responseHeaders = new Headers(corsHeaders)
  const contentType = upstreamResponse.headers.get('content-type')
  if (contentType) responseHeaders.set('Content-Type', contentType)
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders
  })
}

async function consumeDailyQuota(env, identity, limit) {
  if (!env.DAILY_QUOTA) return { allowed: true }

  const id = env.DAILY_QUOTA.idFromName(identity)
  const limiter = env.DAILY_QUOTA.get(id)
  const response = await limiter.fetch('https://aivplayer.invalid/quota', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit })
  })
  return response.json()
}

function isPublicAuthorization(value) {
  return value === 'Bearer public'
}

async function getIdentityKeys(request) {
  const device = request.headers.get('X-AIVPlayer-Device')?.trim()
  const ip = request.headers.get('CF-Connecting-IP')?.trim()
  const identities = []

  if (ip) identities.push(`ip:${await digest(ip)}`)
  if (device && device.length <= 256) identities.push(`device:${await digest(device)}`)

  return identities.length > 0 ? identities : ['anonymous']
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value)
  const buffer = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(buffer)].map((item) => item.toString(16).padStart(2, '0')).join('')
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function countMessageCharacters(messages) {
  if (!Array.isArray(messages)) return 0
  return messages.reduce((total, message) => total + JSON.stringify(message ?? '').length, 0)
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength
}

function secondsUntilUtcDayChange() {
  const now = new Date()
  const next = new Date(now)
  next.setUTCHours(24, 0, 0, 0)
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000))
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: new Headers({
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...headers
    })
  })
}
