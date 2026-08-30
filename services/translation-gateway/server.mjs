import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const MODEL_ID = 'glm-4-flash-250414'
const UPSTREAM_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const DEFAULT_PORT = 8787
const DEFAULT_BURST_LIMIT = 20
const DEFAULT_BURST_WINDOW_MS = 60_000
const DEFAULT_DAILY_REQUEST_LIMIT = 200
const DEFAULT_MAX_REQUEST_BYTES = 256 * 1024
const DEFAULT_MAX_INPUT_CHARS = 120_000
const DEFAULT_MAX_OUTPUT_TOKENS = 4096
const DEFAULT_MAX_CONCURRENT_REQUESTS = 4
const DEFAULT_UPSTREAM_TIMEOUT_MS = 60_000

const corsHeaders = {
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-AIVPlayer-Client, X-AIVPlayer-Device, X-AIVPlayer-Version',
  'Access-Control-Allow-Methods': 'GET, OPTIONS, POST',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store'
}

export function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength
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

function getUtcDay(now) {
  return new Date(now()).toISOString().slice(0, 10)
}

function secondsUntilUtcDayChange(now) {
  const current = new Date(now())
  const next = new Date(current)
  next.setUTCHours(24, 0, 0, 0)
  return Math.max(1, Math.ceil((next.getTime() - current.getTime()) / 1000))
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

function consumeWindow(bucketMap, key, limit, windowMs, timestamp) {
  const current = bucketMap.get(key)
  if (!current || timestamp - current.startedAt >= windowMs) {
    bucketMap.set(key, { startedAt: timestamp, count: 1 })
    return true
  }
  if (current.count >= limit) return false
  current.count += 1
  return true
}

function consumeDaily(bucketMap, key, limit, day) {
  const current = bucketMap.get(key)
  if (!current || current.day !== day) {
    bucketMap.set(key, { day, count: 1 })
    return true
  }
  if (current.count >= limit) return false
  current.count += 1
  return true
}

function pruneBuckets(bucketMap, predicate) {
  for (const [key, value] of bucketMap) {
    if (predicate(value)) bucketMap.delete(key)
  }
}

async function digestIdentity(value, salt) {
  return createHash('sha256').update(`${salt}\0${value}`).digest('hex')
}

async function getIdentityKeys(request, salt) {
  const device = request.headers.get('X-AIVPlayer-Device')?.trim()
  const realIp = request.headers.get('X-Real-IP')?.trim()
  const forwardedIp = request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
  const adapterIp = request.headers.get('X-Remote-Address')?.trim()
  const ip = realIp || forwardedIp || adapterIp
  const identities = []

  if (ip) identities.push(`ip:${await digestIdentity(ip, salt)}`)
  if (device && device.length <= 256) identities.push(`device:${await digestIdentity(device, salt)}`)
  return identities.length > 0 ? identities : ['anonymous']
}

function isPublicAuthorization(value) {
  return value === 'Bearer public'
}

function requestBodyTooLargeResponse() {
  return jsonResponse({ error: 'request_too_large' }, 413)
}

function resolveUpstreamApiKey(env) {
  if (env.BIGMODEL_API_KEY?.trim()) return env.BIGMODEL_API_KEY.trim()
  if (!env.BIGMODEL_API_KEY_FILE) return ''
  try {
    return readFileSync(env.BIGMODEL_API_KEY_FILE, 'utf8').trim()
  } catch {
    return ''
  }
}

export function createGatewayHandler(options = {}) {
  const env = options.env ?? process.env
  const now = options.now ?? Date.now
  const upstreamFetch = options.upstreamFetch ?? fetch
  const logger = options.logger ?? (() => undefined)
  const upstreamApiKey = options.upstreamApiKey?.trim() || resolveUpstreamApiKey(env)
  const burstLimit = positiveInteger(env.BURST_REQUEST_LIMIT, DEFAULT_BURST_LIMIT)
  const burstWindowMs = positiveInteger(env.BURST_WINDOW_MS, DEFAULT_BURST_WINDOW_MS)
  const dailyLimit = positiveInteger(env.DAILY_REQUEST_LIMIT, DEFAULT_DAILY_REQUEST_LIMIT)
  const maxRequestBytes = positiveInteger(env.MAX_REQUEST_BYTES, DEFAULT_MAX_REQUEST_BYTES)
  const maxInputChars = positiveInteger(env.MAX_INPUT_CHARS, DEFAULT_MAX_INPUT_CHARS)
  const maxOutputTokens = positiveInteger(env.MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS)
  const maxConcurrentRequests = positiveInteger(env.MAX_CONCURRENT_REQUESTS, DEFAULT_MAX_CONCURRENT_REQUESTS)
  const upstreamTimeoutMs = positiveInteger(env.UPSTREAM_TIMEOUT_MS, DEFAULT_UPSTREAM_TIMEOUT_MS)
  const identitySalt = env.IDENTITY_HASH_SALT || 'aivplayer-domestic-translation'
  const burstBuckets = new Map()
  const dailyBuckets = new Map()
  let inFlight = 0

  const record = (event, details = {}) => {
    logger({ event, ...details })
  }

  return async function handleRequest(request) {
    const requestId = randomUUID()
    const startedAt = now()
    const finish = (response, details = {}) => {
      record('request_finished', {
        requestId,
        status: response.status,
        durationMs: Math.max(0, now() - startedAt),
        ...details
      })
      return response
    }

    if (request.method === 'OPTIONS') return finish(new Response(null, { status: 204, headers: corsHeaders }))

    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      if (!upstreamApiKey) return finish(jsonResponse({ status: 'not_ready' }, 503), { reason: 'missing_upstream_key' })
      return finish(jsonResponse({ status: 'ok', model: MODEL_ID }))
    }

    if (request.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
      return finish(jsonResponse({ error: 'not_found' }, 404))
    }
    if (!upstreamApiKey) return finish(jsonResponse({ error: 'service_not_configured' }, 503), { reason: 'missing_upstream_key' })
    if (!isPublicAuthorization(request.headers.get('authorization'))) {
      return finish(jsonResponse({ error: 'unauthorized' }, 401))
    }

    const contentLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
      return finish(requestBodyTooLargeResponse(), { reason: 'request_too_large' })
    }

    const rawBody = await request.text()
    if (byteLength(rawBody) > maxRequestBytes) {
      return finish(requestBodyTooLargeResponse(), { reason: 'request_too_large' })
    }

    const body = parseJsonObject(rawBody)
    if (!body) return finish(jsonResponse({ error: 'invalid_json' }, 400))

    const inputChars = countMessageCharacters(body.messages)
    if (!Array.isArray(body.messages) || body.messages.length === 0 || inputChars > maxInputChars) {
      return finish(jsonResponse({ error: 'invalid_messages' }, 400))
    }

    const timestamp = now()
    const identities = await getIdentityKeys(request, identitySalt)
    pruneBuckets(burstBuckets, (value) => timestamp - value.startedAt >= burstWindowMs)
    pruneBuckets(dailyBuckets, (value) => value.day !== getUtcDay(now))

    for (const identity of identities) {
      if (!consumeWindow(burstBuckets, identity, burstLimit, burstWindowMs, timestamp)) {
        return finish(jsonResponse({ error: 'rate_limited', retry_after: Math.ceil(burstWindowMs / 1000) }, 429, { 'Retry-After': String(Math.ceil(burstWindowMs / 1000)) }), { reason: 'burst_limit' })
      }
    }
    for (const identity of identities) {
      if (!consumeDaily(dailyBuckets, identity, dailyLimit, getUtcDay(now))) {
        const retryAfter = secondsUntilUtcDayChange(now)
        return finish(jsonResponse({ error: 'daily_quota_exceeded', retry_after: retryAfter }, 429, { 'Retry-After': String(retryAfter) }), { reason: 'daily_limit' })
      }
    }

    if (inFlight >= maxConcurrentRequests) {
      return finish(jsonResponse({ error: 'temporarily_overloaded' }, 503, { 'Retry-After': '5' }), { reason: 'concurrency_limit' })
    }

    inFlight += 1
    try {
      const upstreamBody = {
        ...body,
        model: MODEL_ID,
        max_tokens: Math.min(positiveInteger(body.max_tokens, maxOutputTokens), maxOutputTokens)
      }
      const controller = new AbortController()
      const abortUpstream = () => controller.abort()
      if (request.signal.aborted) controller.abort()
      request.signal.addEventListener('abort', abortUpstream, { once: true })
      const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs)
      let upstreamResponse
      try {
        upstreamResponse = await upstreamFetch(UPSTREAM_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${upstreamApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(upstreamBody),
          signal: controller.signal
        })
      } catch (error) {
        record('upstream_failed', { requestId, reason: error instanceof Error ? error.name : 'unknown' })
        return finish(jsonResponse({ error: 'upstream_unavailable' }, 502), { reason: 'upstream_unavailable' })
      } finally {
        clearTimeout(timeout)
        request.signal.removeEventListener('abort', abortUpstream)
      }

      const responseHeaders = new Headers(corsHeaders)
      const contentType = upstreamResponse.headers.get('content-type')
      if (contentType) responseHeaders.set('Content-Type', contentType)
      responseHeaders.set('X-Request-Id', requestId)
      return finish(new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders
      }), { upstreamStatus: upstreamResponse.status })
    } finally {
      inFlight -= 1
    }
  }
}

class RequestBodyTooLargeError extends Error {}

function readNodeRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        request.pause()
        reject(new RequestBodyTooLargeError())
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

async function toWebRequest(request, body) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(name, value)
  }
  headers.set('X-Remote-Address', request.socket.remoteAddress ?? '')
  const host = request.headers.host || '127.0.0.1'
  const url = new URL(request.url || '/', `http://${host}`)
  return new Request(url, {
    method: request.method,
    headers,
    body: request.method === 'POST' ? body : undefined
  })
}

async function writeWebResponse(response, nodeResponse) {
  nodeResponse.statusCode = response.status
  for (const [name, value] of response.headers) nodeResponse.setHeader(name, value)
  if (!response.body) {
    nodeResponse.end()
    return
  }
  Readable.fromWeb(response.body).pipe(nodeResponse)
}

export function createHttpServer(options = {}) {
  const env = options.env ?? process.env
  const maxRequestBytes = positiveInteger(env.MAX_REQUEST_BYTES, DEFAULT_MAX_REQUEST_BYTES)
  const handleRequest = createGatewayHandler(options)
  const server = createServer(async (request, response) => {
    try {
      const body = request.method === 'POST' ? await readNodeRequestBody(request, maxRequestBytes) : undefined
      const webRequest = await toWebRequest(request, body)
      await writeWebResponse(await handleRequest(webRequest), response)
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        await writeWebResponse(requestBodyTooLargeResponse(), response)
        return
      }
      await writeWebResponse(jsonResponse({ error: 'internal_error' }, 500), response)
    }
  })
  server.requestTimeout = positiveInteger(env.UPSTREAM_TIMEOUT_MS, DEFAULT_UPSTREAM_TIMEOUT_MS) + 10_000
  server.headersTimeout = server.requestTimeout + 5_000
  server.keepAliveTimeout = 10_000
  return server
}

export function startServer(env = process.env) {
  const port = positiveInteger(env.PORT, DEFAULT_PORT)
  const host = env.HOST || '0.0.0.0'
  const server = createHttpServer({ env, logger: (entry) => console.info(JSON.stringify(entry)) })
  let shuttingDown = false
  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 25_000).unref()
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
  server.listen(port, host, () => console.info(JSON.stringify({ event: 'server_started', host, port, model: MODEL_ID })))
  return server
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) startServer()
