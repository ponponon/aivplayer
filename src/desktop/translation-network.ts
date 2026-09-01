import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { net, session } from 'electron'
import {
  MANAGED_TRANSLATION_SERVICE_DOMESTIC_ENDPOINT,
  MANAGED_TRANSLATION_SERVICE_ENDPOINT
} from '../shared/translation-service'

export type TranslationFetch = (url: string, init?: RequestInit) => Promise<Response>

type ProxyFetch = (proxyUrl: string, url: string, init?: RequestInit) => Promise<Response>
type ProxyDiscovery = (url: string) => Promise<string[]>

export type TranslationNetworkOptions = {
  fetchDirect?: TranslationFetch
  fetchProxy?: ProxyFetch
  discoverProxyUrls?: ProxyDiscovery
  isProxyUsable?: (proxyUrl: string, url: string) => Promise<boolean>
  refreshSystemProxy?: () => Promise<void>
  now?: () => number
  env?: NodeJS.ProcessEnv
  refreshIntervalMs?: number
}

const execFileAsync = promisify(execFile)
const PROXY_REFRESH_INTERVAL_MS = 3000
const PROXY_PROBE_TIMEOUT_MS = 1500

function isHttpUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function getEnvValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return env[name] ?? env[name.toUpperCase()]
}

function normalizeProxyUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || /^direct$/i.test(trimmed)) return null

  const withScheme = trimmed.replace(/^socks5h:/i, 'socks5:').includes('://')
    ? trimmed.replace(/^socks5h:/i, 'socks5:')
    : `http://${trimmed}`

  try {
    const parsed = new URL(withScheme)
    if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(parsed.protocol)) return null
    if (!parsed.hostname) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function splitNoProxyToken(token: string): { host: string; port: string | null } {
  const normalized = token.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0] ?? ''
  if (normalized.startsWith('[')) {
    const closingBracket = normalized.indexOf(']')
    if (closingBracket >= 0) {
      return {
        host: normalized.slice(1, closingBracket),
        port: normalized.slice(closingBracket + 1).replace(/^:/, '') || null
      }
    }
  }

  const portSeparator = normalized.lastIndexOf(':')
  if (portSeparator > 0 && /^\d+$/.test(normalized.slice(portSeparator + 1))) {
    return { host: normalized.slice(0, portSeparator), port: normalized.slice(portSeparator + 1) }
  }
  return { host: normalized, port: null }
}

export function shouldBypassProxyUrl(url: string, env: NodeJS.ProcessEnv = process.env): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return true
  }
  if (!isHttpUrl(url) || isLoopbackHost(parsed.hostname)) return true

  const noProxy = getEnvValue(env, 'no_proxy')
  if (!noProxy) return false

  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return noProxy.split(/[\s,]+/).some((rawToken) => {
    const token = rawToken.trim()
    if (!token) return false
    if (token === '*') return true

    const { host: tokenHost, port: tokenPort } = splitNoProxyToken(token)
    const normalizedTokenHost = tokenHost.replace(/^\*\./, '').replace(/^\./, '')
    if (!normalizedTokenHost || (tokenPort && tokenPort !== port)) return false
    return hostname === normalizedTokenHost || hostname.endsWith(`.${normalizedTokenHost}`)
  })
}

function proxyEnvironmentValues(url: string, env: NodeJS.ProcessEnv): string[] {
  let protocol: string
  try {
    protocol = new URL(url).protocol
  } catch {
    return []
  }

  const names = protocol === 'https:'
    ? ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY']
    : ['http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY', 'https_proxy', 'HTTPS_PROXY']
  return names
    .map((name) => env[name])
    .filter((value): value is string => Boolean(value))
}

export function parseQuickQListenPorts(output: string): number[] {
  const ports = new Set<number>()
  let command = ''
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('c')) {
      command = line.slice(1)
      continue
    }
    if (!line.startsWith('n') || !/quickq/i.test(command)) continue
    const match = line.match(/:(\d+)$/)
    if (!match) continue
    const port = Number(match[1])
    if (port >= 1 && port <= 65535) ports.add(port)
  }
  return [...ports].sort((left, right) => left - right)
}

async function discoverQuickQListenPorts(): Promise<number[]> {
  if (process.platform !== 'darwin') return []
  try {
    const result = await execFileAsync('lsof', ['-nP', '-a', '-c', 'QuickQ', '-iTCP', '-sTCP:LISTEN', '-Fpcn'], {
      timeout: 1000,
      maxBuffer: 64 * 1024
    })
    return parseQuickQListenPorts(result.stdout)
  } catch {
    return []
  }
}

async function discoverKnownLocalProxyPorts(): Promise<number[]> {
  if (process.platform !== 'darwin') return []
  try {
    const result = await execFileAsync('lsof', ['-nP', '-iTCP:7897', '-sTCP:LISTEN', '-Fpn'], {
      timeout: 1000,
      maxBuffer: 16 * 1024
    })
    return parseListenPorts(result.stdout)
  } catch {
    return []
  }
}

function parseListenPorts(output: string): number[] {
  const ports = new Set<number>()
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith('n')) continue
    const match = line.match(/:(\d+)$/)
    if (!match) continue
    const port = Number(match[1])
    if (port >= 1 && port <= 65535) ports.add(port)
  }
  return [...ports].sort((left, right) => left - right)
}

export async function discoverExplicitProxyUrls(url: string, env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const environmentCandidates = proxyEnvironmentValues(url, env)
    .map(normalizeProxyUrl)
    .filter((value): value is string => value !== null)

  const quickQPorts = await discoverQuickQListenPorts()
  const knownLocalProxyPorts = await discoverKnownLocalProxyPorts()
  const localCandidates: string[] = []
  for (const port of [...quickQPorts, ...knownLocalProxyPorts]) {
    localCandidates.push(`http://127.0.0.1:${port}`, `socks5://127.0.0.1:${port}`)
  }

  return [...new Set([...localCandidates, ...environmentCandidates])]
}

async function fetchDirectThroughElectron(url: string, init?: RequestInit): Promise<Response> {
  return (await net.fetch(url, init)) as unknown as Response
}

const proxySessions = new Map<string, Promise<Electron.Session>>()

function proxyPartitionName(proxyUrl: string): string {
  const hash = createHash('sha256').update(proxyUrl).digest('hex').slice(0, 24)
  return `temp:aivplayer-translation-proxy-${hash}`
}

async function getProxySession(proxyUrl: string): Promise<Electron.Session> {
  const existing = proxySessions.get(proxyUrl)
  if (existing) return existing

  const pending = (async () => {
    const proxySession = session.fromPartition(proxyPartitionName(proxyUrl))
    await proxySession.setProxy({
      mode: 'fixed_servers',
      proxyRules: proxyUrl,
      proxyBypassRules: 'localhost,127.0.0.1,::1'
    })
    return proxySession
  })()
  proxySessions.set(proxyUrl, pending)
  try {
    return await pending
  } catch (error) {
    proxySessions.delete(proxyUrl)
    throw error
  }
}

async function fetchThroughElectronProxy(proxyUrl: string, url: string, init?: RequestInit): Promise<Response> {
  const proxySession = await getProxySession(proxyUrl)
  return (await proxySession.fetch(url, init)) as unknown as Response
}

async function probeProxy(proxyFetch: ProxyFetch, proxyUrl: string, url: string): Promise<boolean> {
  try {
    const response = await proxyFetch(proxyUrl, url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(PROXY_PROBE_TIMEOUT_MS)
    })
    if (response.body) void response.body.cancel().catch(() => undefined)
    return response.status !== 407
  } catch {
    return false
  }
}

function isAbortRequested(init?: RequestInit): boolean {
  return init?.signal?.aborted === true
}

export function createAutomaticTranslationFetch(options: TranslationNetworkOptions = {}): TranslationFetch {
  const fetchDirect = options.fetchDirect ?? fetchDirectThroughElectron
  const fetchProxy = options.fetchProxy ?? fetchThroughElectronProxy
  const discoverProxyUrls = options.discoverProxyUrls ?? ((url: string) => discoverExplicitProxyUrls(url, options.env ?? process.env))
  const isProxyUsable = options.isProxyUsable ?? ((proxyUrl: string, url: string) => probeProxy(fetchProxy, proxyUrl, url))
  const refreshSystemProxy = options.refreshSystemProxy ?? (async () => {
    await session.defaultSession.forceReloadProxyConfig()
  })
  const now = options.now ?? Date.now
  const env = options.env ?? process.env
  const refreshIntervalMs = options.refreshIntervalMs ?? PROXY_REFRESH_INTERVAL_MS

  let cachedProxy: { url: string | null; checkedAt: number } | null = null
  let refreshInFlight: Promise<string | null> | null = null

  const refreshRoute = async (url: string, force = false): Promise<string | null> => {
    const currentTime = now()
    if (!force && cachedProxy && currentTime - cachedProxy.checkedAt < refreshIntervalMs) return cachedProxy.url
    if (refreshInFlight) return refreshInFlight

    const pending = (async () => {
      try {
        await refreshSystemProxy()
      } catch {
        // System proxy refresh is best effort. Explicit proxy discovery still works.
      }

      if (shouldBypassProxyUrl(url, env)) {
        cachedProxy = { url: null, checkedAt: now() }
        return null
      }

      let candidates: string[] = []
      try {
        candidates = [...new Set(await discoverProxyUrls(url))]
      } catch {
        candidates = []
      }

      const usable = await Promise.all(candidates.map(async (candidate) => {
        return (await isProxyUsable(candidate, url)) ? candidate : null
      }))
      const selected = usable.find((candidate): candidate is string => candidate !== null) ?? null
      cachedProxy = { url: selected, checkedAt: now() }
      return selected
    })()
    refreshInFlight = pending
    try {
      return await pending
    } finally {
      if (refreshInFlight === pending) refreshInFlight = null
    }
  }

  const fetchDirectWithRefresh = async (url: string, init?: RequestInit): Promise<Response> => {
    try {
      return await fetchDirect(url, init)
    } catch (directError) {
      if (isAbortRequested(init)) throw directError
      const refreshedProxy = await refreshRoute(url, true)
      if (!refreshedProxy) throw directError
      try {
        return await fetchProxy(refreshedProxy, url, init)
      } catch {
        throw directError
      }
    }
  }

  return async (url: string, init?: RequestInit): Promise<Response> => {
    if (!isHttpUrl(url) || shouldBypassProxyUrl(url, env)) return fetchDirectWithRefresh(url, init)

    const proxyUrl = await refreshRoute(url)
    if (!proxyUrl) return fetchDirectWithRefresh(url, init)

    try {
      return await fetchProxy(proxyUrl, url, init)
    } catch (proxyError) {
      if (isAbortRequested(init)) throw proxyError
      cachedProxy = null
      return fetchDirectWithRefresh(url, init)
    }
  }
}

export type ManagedTranslationServiceRouter = {
  getEndpointCandidates: () => Promise<string[]>
  invalidate: (endpoint?: string) => void
}

export type ManagedTranslationServiceRouterOptions = {
  fetchImpl?: TranslationFetch
  now?: () => number
  refreshIntervalMs?: number
  probeTimeoutMs?: number
}

const MANAGED_ROUTE_REFRESH_INTERVAL_MS = 15_000
const MANAGED_ROUTE_PROBE_TIMEOUT_MS = 2_500
const MANAGED_ROUTE_LATENCY_TIE_MS = 150
const MANAGED_ROUTE_SWITCH_CONFIRMATIONS = 2
const MANAGED_ROUTE_FAILURE_COOLDOWN_MS = 15_000
const MANAGED_ROUTE_LATENCY_SAMPLE_COUNT = 5

function getManagedHealthEndpoint(endpoint: string): string {
  const parsed = new URL(endpoint)
  parsed.pathname = '/health'
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

// A desktop client cannot reliably infer a user's country from an IP address:
// VPN exits, carrier NAT, travel, and stale GeoIP data all make that signal
// unsuitable for routing. The live network path to each managed endpoint is
// the source of truth instead.

type ManagedEndpointProbe = {
  available: boolean
  latencyMs: number | null
}

type ManagedEndpointState = {
  healthy: boolean
  failureUntil: number
  latencySamples: number[]
}

function isDomesticManagedEndpoint(endpoint: string): boolean {
  return endpoint === MANAGED_TRANSLATION_SERVICE_DOMESTIC_ENDPOINT
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] ?? null : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function endpointLatency(state: ManagedEndpointState): number {
  return median(state.latencySamples) ?? Number.POSITIVE_INFINITY
}

function compareManagedEndpoints(
  left: string,
  right: string,
  states: Map<string, ManagedEndpointState>
): number {
  const leftLatency = endpointLatency(states.get(left) as ManagedEndpointState)
  const rightLatency = endpointLatency(states.get(right) as ManagedEndpointState)
  if (leftLatency === rightLatency) {
    if (isDomesticManagedEndpoint(left)) return -1
    if (isDomesticManagedEndpoint(right)) return 1
    return 0
  }

  const difference = leftLatency - rightLatency
  if (Math.abs(difference) <= MANAGED_ROUTE_LATENCY_TIE_MS) {
    if (isDomesticManagedEndpoint(left)) return -1
    if (isDomesticManagedEndpoint(right)) return 1
  }
  return difference
}

function shouldSwitchManagedEndpoint(
  next: string,
  current: string,
  states: Map<string, ManagedEndpointState>
): boolean {
  const nextLatency = endpointLatency(states.get(next) as ManagedEndpointState)
  const currentLatency = endpointLatency(states.get(current) as ManagedEndpointState)
  if (!Number.isFinite(nextLatency)) return false
  if (!Number.isFinite(currentLatency)) return true

  if (isDomesticManagedEndpoint(next) && !isDomesticManagedEndpoint(current)) {
    return nextLatency <= currentLatency + MANAGED_ROUTE_LATENCY_TIE_MS
  }
  return nextLatency + MANAGED_ROUTE_LATENCY_TIE_MS < currentLatency
}

export function createManagedTranslationServiceRouter(
  options: ManagedTranslationServiceRouterOptions = {}
): ManagedTranslationServiceRouter {
  const fetchImpl = options.fetchImpl ?? createAutomaticTranslationFetch()
  const now = options.now ?? (() => performance.now())
  const refreshIntervalMs = options.refreshIntervalMs ?? MANAGED_ROUTE_REFRESH_INTERVAL_MS
  const probeTimeoutMs = options.probeTimeoutMs ?? MANAGED_ROUTE_PROBE_TIMEOUT_MS
  const endpoints = [MANAGED_TRANSLATION_SERVICE_ENDPOINT, MANAGED_TRANSLATION_SERVICE_DOMESTIC_ENDPOINT]
  const states = new Map<string, ManagedEndpointState>(endpoints.map((endpoint) => [endpoint, {
    healthy: false,
    failureUntil: 0,
    latencySamples: []
  }]))
  let cached: { candidates: string[]; checkedAt: number } | null = null
  let refreshInFlight: Promise<string[]> | null = null
  let preferredEndpoint: string | null = null
  let pendingSwitch: { endpoint: string; confirmations: number } | null = null

  const probe = async (endpoint: string): Promise<ManagedEndpointProbe> => {
    const startedAt = now()
    try {
      const response = await fetchImpl(getManagedHealthEndpoint(endpoint), {
        method: 'GET',
        signal: AbortSignal.timeout(probeTimeoutMs)
      })
      if (response.body) void response.body.cancel().catch(() => undefined)
      return { available: response.ok, latencyMs: Math.max(0, now() - startedAt) }
    } catch {
      return { available: false, latencyMs: null }
    }
  }

  const rankEndpoints = (currentTime: number): string[] => {
    const available = endpoints
      .filter((endpoint) => {
        const state = states.get(endpoint) as ManagedEndpointState
        return state.healthy && state.failureUntil <= currentTime
      })
      .sort((left, right) => compareManagedEndpoints(left, right, states))
    const unavailable = endpoints
      .filter((endpoint) => !available.includes(endpoint))
      .sort((left, right) => {
        const leftState = states.get(left) as ManagedEndpointState
        const rightState = states.get(right) as ManagedEndpointState
        if (leftState.failureUntil !== rightState.failureUntil) return leftState.failureUntil - rightState.failureUntil
        return compareManagedEndpoints(left, right, states)
      })
    return [...available, ...unavailable]
  }

  const refresh = async (): Promise<string[]> => {
    const currentTime = now()
    if (cached && currentTime - cached.checkedAt < refreshIntervalMs) return cached.candidates
    if (refreshInFlight) return refreshInFlight

    const pending = (async () => {
      const hasProbeableEndpoint = endpoints.some((endpoint) => {
        const state = states.get(endpoint) as ManagedEndpointState
        return state.failureUntil <= currentTime
      })
      const results = await Promise.all(endpoints.map(async (endpoint) => {
        const state = states.get(endpoint) as ManagedEndpointState
        if (hasProbeableEndpoint && state.failureUntil > currentTime) {
          return { endpoint, result: { available: false, latencyMs: null } satisfies ManagedEndpointProbe }
        }
        return { endpoint, result: await probe(endpoint) }
      }))
      const refreshedAt = now()
      for (const { endpoint, result } of results) {
        const state = states.get(endpoint) as ManagedEndpointState
        state.healthy = result.available
        if (result.available && result.latencyMs !== null) {
          state.latencySamples.push(result.latencyMs)
          if (state.latencySamples.length > MANAGED_ROUTE_LATENCY_SAMPLE_COUNT) state.latencySamples.shift()
          if (state.failureUntil <= refreshedAt) state.failureUntil = 0
        } else {
          state.failureUntil = Math.max(state.failureUntil, refreshedAt + MANAGED_ROUTE_FAILURE_COOLDOWN_MS)
        }
      }

      const available = endpoints.filter((endpoint) => {
        const state = states.get(endpoint) as ManagedEndpointState
        return state.healthy && state.failureUntil <= refreshedAt
      })
      const ranked = rankEndpoints(refreshedAt)
      const bestEndpoint = available.slice().sort((left, right) => compareManagedEndpoints(left, right, states))[0] ?? null

      if (!bestEndpoint) {
        preferredEndpoint ??= MANAGED_TRANSLATION_SERVICE_DOMESTIC_ENDPOINT
        pendingSwitch = null
      } else if (!preferredEndpoint || !available.includes(preferredEndpoint)) {
        preferredEndpoint = bestEndpoint
        pendingSwitch = null
      } else if (bestEndpoint === preferredEndpoint) {
        pendingSwitch = null
      } else if (shouldSwitchManagedEndpoint(bestEndpoint, preferredEndpoint, states)) {
        if (pendingSwitch?.endpoint === bestEndpoint) {
          pendingSwitch.confirmations += 1
        } else {
          pendingSwitch = { endpoint: bestEndpoint, confirmations: 1 }
        }
        if ((pendingSwitch?.confirmations ?? 0) >= MANAGED_ROUTE_SWITCH_CONFIRMATIONS) {
          preferredEndpoint = bestEndpoint
          pendingSwitch = null
        }
      } else {
        pendingSwitch = null
      }

      const candidates = preferredEndpoint
        ? [preferredEndpoint, ...ranked.filter((endpoint) => endpoint !== preferredEndpoint)]
        : ranked
      cached = { candidates, checkedAt: refreshedAt }
      return candidates
    })()
    refreshInFlight = pending
    try {
      return await pending
    } finally {
      if (refreshInFlight === pending) refreshInFlight = null
    }
  }

  return {
    getEndpointCandidates: () => refresh(),
    invalidate: (endpoint?: string) => {
      if (endpoint && states.has(endpoint)) {
        const state = states.get(endpoint) as ManagedEndpointState
        state.healthy = false
        state.failureUntil = now() + MANAGED_ROUTE_FAILURE_COOLDOWN_MS
        if (preferredEndpoint === endpoint) {
          preferredEndpoint = endpoints.find((candidate) => candidate !== endpoint) ?? null
          pendingSwitch = null
        }
      }
      cached = null
    }
  }
}
