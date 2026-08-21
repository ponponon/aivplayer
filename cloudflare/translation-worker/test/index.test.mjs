import assert from 'node:assert/strict'
import { test } from 'node:test'

const { DailyQuotaLimiter, handleRequest } = await import('../src/index.js')

function env(overrides = {}) {
  return {
    BIGMODEL_API_KEY: 'test-secret',
    DAILY_REQUEST_LIMIT: '2',
    BURST_LIMITER: { limit: async () => ({ success: true }) },
    DAILY_QUOTA: {
      idFromName: () => 'test-id',
      get: () => ({ fetch: async () => new Response(JSON.stringify({ allowed: true }), { status: 200 }) })
    },
    ...overrides
  }
}

function request(body, headers = {}) {
  return new Request('https://example.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer public',
      'Content-Type': 'application/json',
      'X-AIVPlayer-Device': 'test-device',
      ...headers
    },
    body: JSON.stringify(body)
  })
}

test('health endpoint does not require the upstream key', async () => {
  const response = await handleRequest(new Request('https://example.com/health'), {})
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok', model: 'glm-4.7-flash' })
})

test('rejects non-public authorization before forwarding', async () => {
  const response = await handleRequest(
    request({ messages: [{ role: 'user', content: 'hello' }] }, { Authorization: 'Bearer leaked-or-user-key' }),
    env()
  )
  assert.equal(response.status, 401)
})

test('forwards a fixed model and only the Worker secret upstream', async () => {
  let forwarded
  const response = await handleRequest(
    request({ model: 'arbitrary-paid-model', messages: [{ role: 'user', content: 'hello' }] }),
    env(),
    {
      upstreamFetch: async (_url, options) => {
        forwarded = { url: _url, options, body: JSON.parse(options.body) }
        return new Response(JSON.stringify({ choices: [{ message: { content: '你好' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }
  )

  assert.equal(response.status, 200)
  assert.equal(forwarded.url, 'https://open.bigmodel.cn/api/paas/v4/chat/completions')
  assert.equal(forwarded.options.headers.Authorization, 'Bearer test-secret')
  assert.equal(forwarded.body.model, 'glm-4.7-flash')
  assert.equal(forwarded.body.max_tokens, 4096)
  assert.equal(await response.json().then((value) => value.choices[0].message.content), '你好')
})

test('returns 429 when the daily quota refuses the request', async () => {
  const response = await handleRequest(
    request({ messages: [{ role: 'user', content: 'hello' }] }),
    env({
      DAILY_QUOTA: {
        idFromName: () => 'test-id',
        get: () => ({
          fetch: async () =>
            new Response(JSON.stringify({ allowed: false, retryAfter: 120 }), { status: 200 })
        })
      }
    })
  )
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('Retry-After'), '120')
})

test('DailyQuotaLimiter counts independently per UTC day', async () => {
  const data = new Map()
  const limiter = new DailyQuotaLimiter({
    storage: {
      get: async (key) => data.get(key),
      put: async (key, value) => data.set(key, value)
    }
  })

  const first = await limiter.fetch(new Request('https://quota.invalid', {
    method: 'POST',
    body: JSON.stringify({ limit: 1 })
  }))
  const second = await limiter.fetch(new Request('https://quota.invalid', {
    method: 'POST',
    body: JSON.stringify({ limit: 1 })
  }))

  assert.equal((await first.json()).allowed, true)
  assert.equal((await second.json()).allowed, false)
})

test('applies burst protection to both IP and device identities', async () => {
  const keys = []
  const response = await handleRequest(
    request({ messages: [{ role: 'user', content: 'hello' }] }, { 'CF-Connecting-IP': '203.0.113.10' }),
    env({
      BURST_LIMITER: {
        limit: async ({ key }) => {
          keys.push(key)
          return { success: true }
        }
      }
    }),
    {
      upstreamFetch: async () => new Response('{"ok":true}', { status: 200 })
    }
  )

  assert.equal(response.status, 200)
  assert.equal(keys.length, 2)
  assert.ok(keys.some((key) => key.startsWith('ip:')))
  assert.ok(keys.some((key) => key.startsWith('device:')))
})
