import { describe, expect, it } from 'vitest'
import { createDramaProviderFromEnvironment, createMockDramaProvider, createOpenAiCompatibleDramaProvider, DramaProviderError } from '../../src/core/drama/drama-provider'

describe('drama provider', () => {
  it('calls an OpenAI-compatible endpoint and extracts message content', async () => {
    const requests: RequestInit[] = []
    const provider = createOpenAiCompatibleDramaProvider({
      baseUrl: 'https://example.test/v1/chat/completions',
      apiKey: 'secret',
      model: 'model-a',
      fetchImpl: async (_input, init) => {
        requests.push(init ?? {})
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 })
      }
    })

    await expect(provider.generate({ stage: 'events', system: 'system', user: 'user' })).resolves.toBe('{"ok":true}')
    expect(requests[0]?.headers).toMatchObject({ Authorization: 'Bearer secret' })
    expect(String(requests[0]?.body)).toContain('model-a')
  })

  it('reports missing environment configuration without persisting secrets', () => {
    expect(() => createDramaProviderFromEnvironment({})).toThrowError(DramaProviderError)
    expect(() => createDramaProviderFromEnvironment({})).toThrow('AIVPLAYER_DRAMA_API_BASE_URL')
  })

  it('maps HTTP failures to a stable provider error', async () => {
    const provider = createOpenAiCompatibleDramaProvider({
      baseUrl: 'https://example.test',
      apiKey: 'secret',
      model: 'model-a',
      fetchImpl: async () => new Response('no', { status: 503 })
    })
    await expect(provider.generate({ stage: 'script', system: 'system', user: 'user' })).rejects.toMatchObject({ code: 'http-error', status: 503 })
  })

  it('provides deterministic asset and storyboard responses in mock mode', async () => {
    const provider = createMockDramaProvider()
    await expect(provider.generate({ stage: 'assets', system: 'system', user: 'user' })).resolves.toContain('"assets"')
    await expect(provider.generate({ stage: 'storyboard', system: 'system', user: 'user' })).resolves.toContain('"scenes"')
  })
})
