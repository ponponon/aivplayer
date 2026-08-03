import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { WebServer } from '../src/desktop/web/web-server.ts'

const execFileAsync = promisify(execFile)

function getArgument(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('-') ? value : null
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function execFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    maxBuffer: 2 * 1024 * 1024,
    timeout: 120_000
  })
}

async function getSessionCookie(accessUrl: URL): Promise<string> {
  const response = await fetch(accessUrl, { redirect: 'manual' })
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  assertCondition(response.status === 302 && cookie, `Web session bootstrap failed: HTTP ${response.status}`)
  return cookie
}

async function fetchJson<T>(url: URL, cookie: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, headers: { Cookie: cookie, ...(init.headers ?? {}) } })
  const body = await response.json() as T & { message?: string }
  assertCondition(response.ok, `${init.method ?? 'GET'} ${url.pathname} failed: HTTP ${response.status} ${body.message ?? ''}`)
  return body
}

async function assertRange(url: URL, cookie: string): Promise<void> {
  const response = await fetch(url, { headers: { Cookie: cookie, Range: 'bytes=0-15' } })
  assertCondition(response.status === 206, `${url.pathname} did not return HTTP 206`)
  assertCondition((await response.arrayBuffer()).byteLength === 16, `${url.pathname} returned an unexpected range length`)
  assertCondition(response.headers.get('accept-ranges') === 'bytes', `${url.pathname} omitted Accept-Ranges`)
  assertCondition(response.headers.get('content-type')?.startsWith('video/mp4'), `${url.pathname} returned an unexpected content type`)
}

async function waitForReady(baseUrl: URL, ids: string[], cookie: string): Promise<{ statuses: Map<string, { state: string; streamUrl: string | null }>; maxRunning: number }> {
  const finalStatuses = new Map<string, { state: string; streamUrl: string | null }>()
  let maxRunning = 0
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const statuses = await Promise.all(ids.map(async (id) => [
      id,
      await fetchJson<{ state: string; streamUrl: string | null }>(new URL(`/api/v1/transcode/${id}`, baseUrl), cookie)
    ] as const))
    const current = new Map(statuses)
    const runningCount = [...current.values()].filter((status) => status.state === 'running').length
    maxRunning = Math.max(maxRunning, runningCount)
    for (const [id, status] of current) finalStatuses.set(id, status)
    const failed = [...current.entries()].find(([, status]) => status.state === 'error')
    if (failed) throw new Error(`Transcode failed for ${failed[0]}: ${JSON.stringify(failed[1])}`)
    if ([...current.values()].every((status) => status.state === 'ready')) return { statuses: current, maxRunning }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50))
  }
  throw new Error(`Transcode timed out: ${JSON.stringify([...finalStatuses])}`)
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

async function main(): Promise<void> {
  const ffmpegPath = getArgument('--ffmpeg') ?? process.env.AIVPLAYER_SMOKE_FFMPEG_PATH ?? 'ffmpeg'
  const directory = await mkdtemp(join(tmpdir(), 'aivplayer-web-concurrency-'))
  const wrapperPath = join(directory, 'ffmpeg-wrapper')
  const invocationLogPath = join(directory, 'transcode-invocations.log')
  const firstPath = join(directory, 'first.avi')
  const secondPath = join(directory, 'second.avi')
  const originalFfmpegEnv = process.env.AIVPLAYER_SMOKE_REAL_FFMPEG
  const originalLogEnv = process.env.AIVPLAYER_SMOKE_TRANSCODE_LOG
  const server = new WebServer({
    resourcePath: directory,
    webRoot: resolve('out/web'),
    bindHost: '127.0.0.1',
    getFfmpegPath: async () => wrapperPath,
    cacheRoot: join(directory, 'transcode-cache')
  })

  try {
    await writeFile(wrapperPath, [
      '#!/bin/sh',
      'out=""',
      'for arg in "$@"; do out="$arg"; done',
      'printf "%s\\n" "$out" >> "$AIVPLAYER_SMOKE_TRANSCODE_LOG"',
      'sleep 0.4',
      'exec "$AIVPLAYER_SMOKE_REAL_FFMPEG" "$@"'
    ].join('\n') + '\n')
    await chmod(wrapperPath, 0o755)
    process.env.AIVPLAYER_SMOKE_REAL_FFMPEG = ffmpegPath
    process.env.AIVPLAYER_SMOKE_TRANSCODE_LOG = invocationLogPath

    await execFfmpeg(ffmpegPath, [
      '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000',
      '-t', '6', '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'libmp3lame', '-q:a', '4', '-shortest', firstPath
    ])
    await execFfmpeg(ffmpegPath, [
      '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000',
      '-t', '6', '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'libmp3lame', '-q:a', '4', '-shortest', secondPath
    ])

    const status = await server.start({ filePaths: [firstPath, secondPath] })
    const accessUrl = new URL(status.urls[0]!)
    const [firstCookie, secondCookie, thirdCookie] = await Promise.all([
      getSessionCookie(accessUrl),
      getSessionCookie(accessUrl),
      getSessionCookie(accessUrl)
    ])
    const library = await fetchJson<{ items: Array<{ id: string; name: string; extension: string; transcodeUrl: string }> }>(new URL('/api/v1/library', accessUrl), firstCookie)
    const firstItem = library.items.find((item) => item.name === 'first.avi')
    const secondItem = library.items.find((item) => item.name === 'second.avi')
    assertCondition(firstItem && secondItem, `Expected both AVI fixtures, found ${library.items.map((item) => item.name).join(', ')}`)
    assertCondition(extname(firstItem.name) === '.avi' && extname(secondItem.name) === '.avi', 'Concurrency fixtures were not discovered as AVI')

    const startResponses = await Promise.all([
      fetchJson<{ state: string }>(new URL(firstItem.transcodeUrl, accessUrl), firstCookie, { method: 'POST' }),
      fetchJson<{ state: string }>(new URL(firstItem.transcodeUrl, accessUrl), secondCookie, { method: 'POST' }),
      fetchJson<{ state: string }>(new URL(secondItem.transcodeUrl, accessUrl), thirdCookie, { method: 'POST' })
    ])
    assertCondition(startResponses.every((response) => ['queued', 'running', 'ready'].includes(response.state)), `Unexpected start states: ${JSON.stringify(startResponses)}`)

    const { statuses, maxRunning } = await waitForReady(accessUrl, [firstItem.id, secondItem.id], firstCookie)
    assertCondition(maxRunning <= 1, `More than one transcode was running at once: ${maxRunning}`)
    const firstReady = statuses.get(firstItem.id)!
    const secondReady = statuses.get(secondItem.id)!
    assertCondition(firstReady.streamUrl && secondReady.streamUrl, 'Ready transcodes did not expose stream URLs')

    await Promise.all([
      assertRange(new URL(firstReady.streamUrl, accessUrl), firstCookie),
      assertRange(new URL(firstReady.streamUrl, accessUrl), secondCookie),
      assertRange(new URL(secondReady.streamUrl, accessUrl), firstCookie),
      assertRange(new URL(secondReady.streamUrl, accessUrl), thirdCookie)
    ])

    const invocations = (await readFile(invocationLogPath, 'utf8')).trim().split('\n').filter(Boolean)
    assertCondition(invocations.length === 2 && new Set(invocations).size === 2, `Expected one FFmpeg invocation per unique source, got ${JSON.stringify(invocations)}`)
    console.log(JSON.stringify({
      status: 'WEB_CONCURRENCY_OK',
      clients: 3,
      uniqueSources: 2,
      ffmpegInvocations: invocations.length,
      maxConcurrentTranscodes: maxRunning,
      rangeRequests: 4
    }))
  } finally {
    await server.stop().catch(() => undefined)
    restoreEnvironment('AIVPLAYER_SMOKE_REAL_FFMPEG', originalFfmpegEnv)
    restoreEnvironment('AIVPLAYER_SMOKE_TRANSCODE_LOG', originalLogEnv)
    await rm(directory, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
