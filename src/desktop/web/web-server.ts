import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { access, readFile, stat, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import { getContentTypeForFile } from '../media/media-protocol'
import { parseRangeHeader } from '../../core/media/byte-range'
import { createMediaProbeMetadata } from '../../core/media/media-metadata'
import type {
  WebBrowserSupport,
  WebShareLibraryResponse,
  WebShareMediaDetails,
  WebShareMediaItem,
  WebShareStartRequest,
  WebShareStatus
} from '../../shared/web-types'

type WebServerOptions = {
  resourcePath: string
  webRoot?: string
  bindHost?: string
  env?: NodeJS.ProcessEnv
}

type SharedMediaRecord = {
  id: string
  path: string
  name: string
  extension: string
  mimeType: string
  sizeBytes: number
  modifiedAt: number
  subtitlePath: string | null
}

const SESSION_COOKIE = 'aiv_web_session'
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60
const MAX_BODY_BYTES = 16 * 1024
const MEDIA_ID_PATTERN = /^[a-z0-9-]+$/u

const STATIC_MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
}

const LIKELY_BROWSER_EXTENSIONS = new Set(['.mp4', '.m4v', '.webm', '.ogv', '.ogg'])
const POSSIBLE_BROWSER_EXTENSIONS = new Set(['.mov', '.mkv', '.ts', '.m2ts', '.mpg', '.mpeg'])
const NEEDS_TRANSCODE_EXTENSIONS = new Set(['.avi', '.flv', '.wmv'])

function createMediaId(): string {
  return randomBytes(12).toString('hex')
}

function createSessionToken(): string {
  return randomBytes(32).toString('hex')
}

function getBrowserSupport(extension: string): WebBrowserSupport {
  if (LIKELY_BROWSER_EXTENSIONS.has(extension)) return 'likely'
  if (POSSIBLE_BROWSER_EXTENSIONS.has(extension)) return 'possible'
  if (NEEDS_TRANSCODE_EXTENSIONS.has(extension)) return 'needs-transcode'
  return 'unknown'
}

function getNetworkAddresses(): string[] {
  const addresses = new Set<string>()
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const address of interfaces ?? []) {
      if (address.family === 'IPv4' && !address.internal) addresses.add(address.address)
    }
  }
  return [...addresses].sort()
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(header.split(';').flatMap((part) => {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex <= 0) return []
    const key = part.slice(0, separatorIndex).trim()
    const value = part.slice(separatorIndex + 1).trim()
    return key && value ? [[key, value]] : []
  }))
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown, extraHeaders: Record<string, string> = {}): void {
  const body = JSON.stringify(payload)
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  })
  response.end(body)
}

function sendText(response: ServerResponse, statusCode: number, body: string, extraHeaders: Record<string, string> = {}): void {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  })
  response.end(body)
}

function setSessionCookie(response: ServerResponse, token: string): void {
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`)
}

function getRequestUrl(request: IncomingMessage): URL {
  return new URL(request.url ?? '/', `http://${request.headers.host ?? 'aivplayer.local'}`)
}

function isSafeStaticPath(webRoot: string, requestedPath: string): string | null {
  const decodedPath = decodeURIComponent(requestedPath)
  const relativePath = decodedPath.replace(/^\/+/, '') || 'index.html'
  const candidate = resolve(webRoot, relativePath)
  const root = resolve(webRoot)
  const candidateRelative = relative(root, candidate)
  if (candidateRelative === '..' || candidateRelative.startsWith(`..${sep}`) || candidateRelative.includes(`..${sep}`)) return null
  return candidate
}

function getStaticContentType(filePath: string): string {
  return STATIC_MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

function getSidecarSubtitlePath(filePath: string): string | null {
  const stem = filePath.slice(0, filePath.length - extname(filePath).length)
  const candidates = [`${stem}.vtt`, `${stem}.srt`]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function formatSubtitleTextAsVtt(content: string): string {
  if (/^\uFEFF?WEBVTT\b/u.test(content.trimStart())) return content
  const blocks = content.replace(/\r\n/g, '\n').split(/\n{2,}/u)
  const cues: string[] = []
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trimEnd())
    const timestampIndex = lines.findIndex((line) => /\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,.]\d{3}/u.test(line))
    if (timestampIndex < 0) continue
    const timestamp = lines[timestampIndex]!.replace(/,/gu, '.')
    const text = lines.slice(timestampIndex + 1).join('\n').trim()
    if (text) cues.push(`${timestamp}\n${text}`)
  }
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

function getContentDisposition(fileName: string): string {
  const safeName = fileName.replace(/[\r\n"]/gu, '_')
  return `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`
}

export class WebServer {
  private readonly options: WebServerOptions
  private readonly bindHost: string
  private server: Server | null = null
  private port: number | null = null
  private sessionToken: string | null = null
  private records = new Map<string, SharedMediaRecord>()

  constructor(options: WebServerOptions) {
    this.options = options
    this.bindHost = options.bindHost ?? '0.0.0.0'
  }

  getStatus(): WebShareStatus {
    const addresses = this.server && this.port ? this.bindHost === '0.0.0.0' ? getNetworkAddresses() : [this.bindHost] : []
    const hostAddresses = addresses.length > 0 ? addresses : ['127.0.0.1']
    const urls = this.sessionToken && this.port
      ? hostAddresses.map((address) => `http://${address}:${this.port}/?access=${this.sessionToken}`)
      : []
    return {
      running: Boolean(this.server && this.port && this.sessionToken),
      port: this.port,
      urls,
      sharedFileCount: this.records.size
    }
  }

  async start(request: WebShareStartRequest): Promise<WebShareStatus> {
    await this.stop()
    const records = await this.createRecords(request.filePaths)
    if (records.length === 0) throw new Error('没有可共享的媒体文件')

    this.records = new Map(records.map((record) => [record.id, record]))
    this.sessionToken = createSessionToken()
    this.server = createServer((incoming, response) => {
      void this.handleRequest(incoming, response).catch((error: unknown) => {
        if (!response.headersSent) sendText(response, 500, error instanceof Error ? error.message : 'Web 服务发生错误')
        else response.destroy()
      })
    })

    await new Promise<void>((resolvePromise, reject) => {
      const server = this.server!
      const onError = (error: Error): void => {
        server.off('listening', onListening)
        reject(error)
      }
      const onListening = (): void => {
        server.off('error', onError)
        resolvePromise()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(0, this.bindHost)
    })

    const address = this.server.address()
    if (!address || typeof address === 'string') {
      await this.stop()
      throw new Error('无法读取 Web 服务端口')
    }
    this.port = address.port
    return this.getStatus()
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    this.port = null
    this.sessionToken = null
    this.records.clear()
    if (!server) return
    server.closeAllConnections?.()
    await new Promise<void>((resolvePromise) => {
      server.close(() => resolvePromise())
    }).catch(() => undefined)
  }

  private async createRecords(filePaths: string[]): Promise<SharedMediaRecord[]> {
    const uniquePaths = [...new Set(filePaths.filter((filePath) => typeof filePath === 'string' && filePath.trim()).map((filePath) => resolve(filePath)))]
    const records: SharedMediaRecord[] = []
    for (const inputPath of uniquePaths) {
      try {
        const path = await realpath(inputPath)
        const fileStat = await stat(path)
        if (!fileStat.isFile()) continue
        records.push({
          id: createMediaId(),
          path,
          name: basename(path),
          extension: extname(path).toLowerCase(),
          mimeType: getContentTypeForFile(path),
          sizeBytes: fileStat.size,
          modifiedAt: fileStat.mtimeMs,
          subtitlePath: getSidecarSubtitlePath(path)
        })
      } catch {
        continue
      }
    }
    return records
  }

  private isAuthorized(request: IncomingMessage, url: URL): boolean {
    const token = this.sessionToken
    if (!token) return false
    const cookieToken = parseCookies(request.headers.cookie)[SESSION_COOKIE]
    return cookieToken === token || url.searchParams.get('access') === token
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = getRequestUrl(request)
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, POST',
        'Access-Control-Allow-Origin': 'null'
      })
      response.end()
      return
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      if (url.searchParams.get('access')) {
        if (!this.isAuthorized(request, url)) {
          sendText(response, 401, '访问令牌无效')
          return
        }
        setSessionCookie(response, this.sessionToken!)
        response.writeHead(302, { Location: '/' })
        response.end()
        return
      }
      await this.serveStaticFile(response, '/index.html')
      return
    }

    if (url.pathname.startsWith('/assets/')) {
      await this.serveStaticFile(response, url.pathname)
      return
    }

    if (url.pathname === '/api/v1/session' && request.method === 'GET') {
      sendJson(response, 200, { authenticated: this.isAuthorized(request, url) })
      return
    }

    if (url.pathname === '/api/v1/session' && request.method === 'POST') {
      const body = await this.readRequestBody(request)
      let input: { token?: unknown }
      try {
        input = JSON.parse(body) as { token?: unknown }
      } catch {
        sendJson(response, 400, { message: '请求格式无效' })
        return
      }
      if (input.token !== this.sessionToken) {
        sendJson(response, 401, { message: '访问令牌无效' })
        return
      }
      setSessionCookie(response, this.sessionToken!)
      sendJson(response, 200, { authenticated: true })
      return
    }

    if (!this.isAuthorized(request, url)) {
      sendJson(response, 401, { message: '需要局域网访问授权' })
      return
    }

    if (url.pathname === '/api/v1/library' && request.method === 'GET') {
      sendJson(response, 200, await this.createLibraryResponse())
      return
    }

    const mediaMatch = /^\/api\/v1\/media\/([^/]+)$/u.exec(url.pathname)
    if (mediaMatch && request.method === 'GET') {
      const details = await this.createMediaDetails(mediaMatch[1]!)
      if (!details) {
        sendJson(response, 404, { message: '媒体文件不存在' })
        return
      }
      sendJson(response, 200, details)
      return
    }

    const streamMatch = /^\/media\/([^/]+)$/u.exec(url.pathname)
    if (streamMatch && (request.method === 'GET' || request.method === 'HEAD')) {
      await this.streamMedia(streamMatch[1]!, request, response)
      return
    }

    const subtitleMatch = /^\/subtitle\/([^/]+)$/u.exec(url.pathname)
    if (subtitleMatch && request.method === 'GET') {
      await this.serveSubtitle(subtitleMatch[1]!, response)
      return
    }

    sendText(response, 404, 'Not found')
  }

  private async serveStaticFile(response: ServerResponse, requestedPath: string): Promise<void> {
    const configuredWebRoot = process.env.AIVPLAYER_WEB_DIR ? resolve(process.env.AIVPLAYER_WEB_DIR) : null
    const packagedWebRoot = typeof process.resourcesPath === 'string' ? join(process.resourcesPath, 'web') : null
    const webRoot = this.options.webRoot ?? configuredWebRoot ?? (packagedWebRoot && existsSync(packagedWebRoot) ? packagedWebRoot : resolve('out/web'))
    const filePath = isSafeStaticPath(webRoot, requestedPath)
    if (!filePath) {
      sendText(response, 400, 'Invalid path')
      return
    }
    try {
      await access(filePath, constants.R_OK)
      const body = await readFile(filePath)
      response.writeHead(200, {
        'Cache-Control': extname(filePath) === '.html' ? 'no-store' : 'public, max-age=3600',
        'Content-Type': getStaticContentType(filePath),
        'Content-Length': body.byteLength,
        'X-Content-Type-Options': 'nosniff'
      })
      response.end(body)
    } catch {
      sendText(response, 404, 'Web 页面资源不存在，请先构建 Web 客户端')
    }
  }

  private async createLibraryResponse(): Promise<WebShareLibraryResponse> {
    const items: WebShareMediaItem[] = []
    for (const record of this.records.values()) {
      try {
        const currentStat = await stat(record.path)
        if (!currentStat.isFile()) continue
        items.push(this.toMediaItem({ ...record, sizeBytes: currentStat.size, modifiedAt: currentStat.mtimeMs }))
      } catch {
        continue
      }
    }
    items.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
    return { items }
  }

  private toMediaItem(record: SharedMediaRecord, metadata: WebShareMediaDetails['metadata'] = null): WebShareMediaItem {
    return {
      id: record.id,
      name: record.name,
      extension: record.extension,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      modifiedAt: record.modifiedAt,
      streamUrl: `/media/${record.id}`,
      subtitleUrl: record.subtitlePath ? `/subtitle/${record.id}` : null,
      browserSupport: this.resolveBrowserSupport(record.extension, metadata),
      durationSeconds: metadata?.durationSeconds ?? null,
      videoCodec: metadata?.video?.codec ?? null,
      audioCodec: metadata?.audio?.codec ?? null
    }
  }

  private resolveBrowserSupport(extension: string, metadata: WebShareMediaDetails['metadata']): WebBrowserSupport {
    const videoCodec = metadata?.video?.codec?.toLowerCase() ?? null
    const audioCodec = metadata?.audio?.codec?.toLowerCase() ?? null
    if (videoCodec && ['hevc', 'h265', 'vp6', 'mpeg4', 'wmv3', 'vc1'].includes(videoCodec)) return 'needs-transcode'
    if (audioCodec && ['dts', 'truehd', 'mlp', 'eac3', 'ac3'].includes(audioCodec)) return 'needs-transcode'
    return getBrowserSupport(extension)
  }

  private async createMediaDetails(id: string): Promise<WebShareMediaDetails | null> {
    if (!MEDIA_ID_PATTERN.test(id)) return null
    const record = this.records.get(id)
    if (!record) return null
    try {
      const currentStat = await stat(record.path)
      const metadata = await createMediaProbeMetadata(record.path, { resourcePath: this.options.resourcePath, env: this.options.env })
      return {
        ...this.toMediaItem({ ...record, sizeBytes: currentStat.size, modifiedAt: currentStat.mtimeMs }, metadata),
        metadata
      }
    } catch {
      return null
    }
  }

  private async streamMedia(id: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!MEDIA_ID_PATTERN.test(id)) {
      sendText(response, 400, 'Invalid media id')
      return
    }
    const record = this.records.get(id)
    if (!record) {
      sendText(response, 404, 'Media file not found')
      return
    }

    let fileStat
    try {
      fileStat = await stat(record.path)
    } catch {
      sendText(response, 404, 'Media file not found')
      return
    }

    const rangeHeader = typeof request.headers.range === 'string' ? request.headers.range : null
    const range = parseRangeHeader(rangeHeader, fileStat.size)
    const commonHeaders = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': getContentDisposition(record.name),
      'Content-Type': record.mimeType,
      'Last-Modified': fileStat.mtime.toUTCString(),
      'X-Content-Type-Options': 'nosniff'
    }

    if (rangeHeader && !range) {
      response.writeHead(416, { ...commonHeaders, 'Content-Range': `bytes */${fileStat.size}` })
      response.end()
      return
    }

    const start = range?.start ?? 0
    const end = range?.end ?? Math.max(fileStat.size - 1, 0)
    const contentLength = range?.contentLength ?? fileStat.size
    response.writeHead(range ? 206 : 200, {
      ...commonHeaders,
      'Content-Length': contentLength,
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${fileStat.size}` } : {})
    })
    if (request.method === 'HEAD' || fileStat.size === 0) {
      response.end()
      return
    }

    const stream = createReadStream(record.path, { start, end })
    const closeStream = (): void => { stream.destroy() }
    response.once('close', closeStream)
    stream.once('error', (error) => {
      response.off('close', closeStream)
      if (!response.headersSent) response.writeHead(500)
      response.destroy(error instanceof Error ? error : undefined)
    })
    stream.once('close', () => response.off('close', closeStream))
    stream.pipe(response)
  }

  private async serveSubtitle(id: string, response: ServerResponse): Promise<void> {
    if (!MEDIA_ID_PATTERN.test(id)) {
      sendText(response, 400, 'Invalid media id')
      return
    }
    const record = this.records.get(id)
    if (!record?.subtitlePath) {
      sendText(response, 404, 'Subtitle not found')
      return
    }
    try {
      const content = await readFile(record.subtitlePath, 'utf8')
      const body = formatSubtitleTextAsVtt(content)
      response.writeHead(200, {
        'Cache-Control': 'private, max-age=60',
        'Content-Type': 'text/vtt; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'X-Content-Type-Options': 'nosniff'
      })
      response.end(body)
    } catch {
      sendText(response, 404, 'Subtitle not found')
    }
  }

  private readRequestBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      let total = 0
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        total += buffer.byteLength
        if (total > MAX_BODY_BYTES) {
          reject(new Error('请求体过大'))
          request.destroy()
          return
        }
        chunks.push(buffer)
      })
      request.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
      request.on('error', reject)
    })
  }
}
