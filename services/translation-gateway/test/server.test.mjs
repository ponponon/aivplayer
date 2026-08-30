import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGatewayHandler } from '../server.mjs'

function request(body, headers = {}) {
  return new Request('https://translate.example.test/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer public',
      'Content-Type': 'application/json',
      'X-Real-IP': '203.0.113.10',
      'X-AIVPlayer-Device': 'test-device',
      ...headers
    },
    body: JSON.stringify(body)
  })
}

function env(overrides = {}) {
  return {
    BIGMODEL_API_KEY: 'test-secret',
    DAILY_REQUEST_LIMIT: '2',
    BURST_REQUEST_LIMIT: '2',
    ...overrides
  }
}

test('health reports readiness without exposing the upstream key', async () => {
  const handleRequest = createGatewayHandler({ env: env() })
  const response = await handleRequest(new Request('https://translate.example.test/health'))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok', model: 'glm-4-flash-250414' })
})

test('forwards a fixed model and only the server-side key', async () => {
  let forwarded
  const handleRequest = createGatewayHandler({
    env: env(),
    upstreamFetch: async (url, options) => {
      forwarded = { url, options, body: JSON.parse(options.body) }
      return new Response(JSON.stringify({ choices: [{ message: { content: '你好' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  })

  const response = await handleRequest(request({
    model: 'paid-model-from-client',
    max_tokens: 99999,
    messages: [{ role: 'user', content: 'hello' }]
  }))

  assert.equal(response.status, 200)
  assert.equal(forwarded.url, 'https://open.bigmodel.cn/api/paas/v4/chat/completions')
  assert.equal(forwarded.options.headers.Authorization, 'Bearer test-secret')
  assert.equal(forwarded.body.model, 'glm-4-flash-250414')
  assert.equal(forwarded.body.max_tokens, 4096)
  assert.equal(await response.json().then((value) => value.choices[0].message.content), '你好')
})

test('rejects user keys and malformed requests before forwarding', async () => {
  let forwarded = false
  const handleRequest = createGatewayHandler({
    env: env(),
    upstreamFetch: async () => {
      forwarded = true
      return new Response('{}')
    }
  })

  const unauthorized = await handleRequest(request({ messages: [{ role: 'user', content: 'hello' }] }, { Authorization: 'Bearer user-key' }))
  const invalid = await handleRequest(request({ messages: [] }))
  assert.equal(unauthorized.status, 401)
  assert.equal(invalid.status, 400)
  assert.equal(forwarded, false)
})

test('applies burst and daily limits to both IP and device identities', async () => {
  const handleRequest = createGatewayHandler({
    env: env({ DAILY_REQUEST_LIMIT: '10', BURST_REQUEST_LIMIT: '1' }),
    upstreamFetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
  })
  const first = await handleRequest(request({ messages: [{ role: 'user', content: 'hello' }] }))
  const second = await handleRequest(request({ messages: [{ role: 'user', content: 'hello again' }] }))
  assert.equal(first.status, 200)
  assert.equal(second.status, 429)
  assert.equal(second.headers.get('Retry-After'), '60')
})

test('returns upstream failure without leaking the upstream error', async () => {
  const handleRequest = createGatewayHandler({
    env: env(),
    upstreamFetch: async () => { throw new Error('network failed') }
  })
  const response = await handleRequest(request({ messages: [{ role: 'user', content: 'hello' }] }))
  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { error: 'upstream_unavailable' })
})
