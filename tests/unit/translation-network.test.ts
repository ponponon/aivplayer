import { describe, expect, it, vi } from 'vitest'
import { createAutomaticTranslationFetch, createManagedTranslationServiceRouter, parseQuickQListenPorts, shouldBypassProxyUrl } from '../../src/desktop/translation-network'
import { MANAGED_TRANSLATION_SERVICE_DOMESTIC_ENDPOINT, MANAGED_TRANSLATION_SERVICE_ENDPOINT } from '../../src/shared/translation-service'

function response(status = 200): Response {
  return new Response('', { status })
}

describe('translation network routing', () => {
  it('parses dynamically assigned QuickQ listening ports', () => {
    expect(parseQuickQListenPorts('p1\ncQuickQ\nf1\nn127.0.0.1:10021\nf2\nn127.0.0.1:10901\ncOther\nn127.0.0.1:7897')).toEqual([10021, 10901])
  })

  it('respects loopback and no_proxy bypass rules', () => {
    expect(shouldBypassProxyUrl('http://127.0.0.1:3000', {})).toBe(true)
    expect(shouldBypassProxyUrl('https://api.example.com/v1', { NO_PROXY: 'example.com' })).toBe(true)
    expect(shouldBypassProxyUrl('https://api.other.test/v1', { NO_PROXY: 'example.com' })).toBe(false)
  })

  it('uses a discovered proxy and rechecks it after the refresh interval', async () => {
    let clock = 0
    let proxyEnabled = true
    const direct = vi.fn(async () => response())
    const proxy = vi.fn(async () => response())
    const probe = vi.fn(async () => proxyEnabled)
    const fetch = createAutomaticTranslationFetch({
      fetchDirect: direct,
      fetchProxy: proxy,
      discoverProxyUrls: async () => (proxyEnabled ? ['http://127.0.0.1:10021'] : []),
      isProxyUsable: probe,
      refreshSystemProxy: async () => undefined,
      now: () => clock,
      refreshIntervalMs: 3000
    })

    await fetch('https://translation.example.test/v1')
    expect(proxy).toHaveBeenCalledWith('http://127.0.0.1:10021', 'https://translation.example.test/v1', undefined)
    expect(direct).not.toHaveBeenCalled()

    proxyEnabled = false
    clock = 4000
    await fetch('https://translation.example.test/v1')
    expect(direct).toHaveBeenCalledOnce()
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('falls back to the system route when the proxy connection fails', async () => {
    const direct = vi.fn(async () => response())
    const proxy = vi.fn(async () => { throw new Error('proxy unavailable') })
    const fetch = createAutomaticTranslationFetch({
      fetchDirect: direct,
      fetchProxy: proxy,
      discoverProxyUrls: async () => ['http://127.0.0.1:10021'],
      isProxyUsable: async () => true,
      refreshSystemProxy: async () => undefined
    })

    await fetch('https://translation.example.test/v1', { method: 'POST' })
    expect(proxy).toHaveBeenLastCalledWith('http://127.0.0.1:10021', 'https://translation.example.test/v1', { method: 'POST' })
    expect(direct).toHaveBeenCalledOnce()
  })

  it('refreshes and retries through a proxy when the direct route fails', async () => {
    let discoveryCount = 0
    const direct = vi.fn(async () => {
      throw new Error('direct route unavailable')
    })
    const proxy = vi.fn(async () => response())
    const fetch = createAutomaticTranslationFetch({
      fetchDirect: direct,
      fetchProxy: proxy,
      discoverProxyUrls: async () => {
        discoveryCount += 1
        return discoveryCount > 1 ? ['http://127.0.0.1:10021'] : []
      },
      isProxyUsable: async () => true,
      refreshSystemProxy: async () => undefined
    })

    await fetch('https://translation.example.test/v1')
    expect(proxy).toHaveBeenCalledOnce()
  })

  it('prefers the global endpoint when both routes are reachable and refreshes after a route change', async () => {
    let clock = 0
    let globalAvailable = true
    const probeFetch = vi.fn(async (url: string) => {
      if (url.includes('workers.dev')) return response(globalAvailable ? 200 : 503)
      return response(200)
    })
    const router = createManagedTranslationServiceRouter({
      fetchImpl: probeFetch,
      now: () => clock,
      refreshIntervalMs: 30_000
    })

    await expect(router.getEndpointCandidates()).resolves.toEqual([
      MANAGED_TRANSLATION_SERVICE_ENDPOINT,
      MANAGED_TRANSLATION_SERVICE_DOMESTIC_ENDPOINT
    ])

    globalAvailable = false
    clock = 30_001
    await expect(router.getEndpointCandidates()).resolves.toEqual([MANAGED_TRANSLATION_SERVICE_DOMESTIC_ENDPOINT])
    expect(probeFetch).toHaveBeenCalledWith(expect.stringContaining('/health'), expect.objectContaining({ method: 'GET' }))
  })

  it('does not send subtitle text while detecting the managed route', async () => {
    const probeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('GET')
      expect(init?.body).toBeUndefined()
      return response(200)
    })
    const router = createManagedTranslationServiceRouter({ fetchImpl: probeFetch })

    await router.getEndpointCandidates()
    expect(probeFetch).toHaveBeenCalledTimes(2)
  })
})
