import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { access, readFile, readdir, stat, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { tmpdir } from 'node:os'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import { getContentTypeForFile } from '../../core/media/media-mime'
import { parseRangeHeader } from '../../core/media/byte-range'
import { isVideoFilePath } from '../../core/media/file-opening'
import { createMediaProbeMetadata } from '../../core/media/media-metadata'
import { WebTranscodeManager, type WebTranscodeInput, type WebTranscodeJobStatus } from '../../core/media/web-transcode'
import type {
  WebBrowserSupport,
  WebShareLibraryResponse,
  WebShareMediaDetails,
  WebShareMediaItem,
  WebShareStartRequest,
  WebShareStatus,
  WebTranscodeStatus
} from '../../shared/web-types'

type WebServerOptions = {
  resourcePath: string
  webRoot?: string
  bindHost?: string
  env?: NodeJS.ProcessEnv
  cacheRoot?: string
  getFfmpegPath?: () => Promise<string | null>
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

type SharedRecordCollection = {
  records: SharedMediaRecord[]
  directoryPaths: string[]
}

const SESSION_COOKIE = 'aiv_web_session'
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60
const MAX_BODY_BYTES = 16 * 1024
const MAX_SHARED_FILES = 10_000
const MEDIA_ID_PATTERN = /^[a-z0-9-]+$/u

const STATIC_MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
}

const LIKELY_BROWSER_EXTENSIONS = new Set(['.mp4', '.m4v', '.webm', '.ogv'])
const POSSIBLE_BROWSER_EXTENSIONS = new Set(['.mov', '.mkv', '.ts', '.m2ts', '.mts', '.mpg', '.mpeg'])
const NEEDS_TRANSCODE_EXTENSIONS = new Set([
  '.avi', '.flv', '.wmv', '.3gp', '.3g2', '.3gpp', '.3gpp2', '.vob', '.asf', '.mxf', '.divx', '.rm', '.rmvb',
  '.mpe', '.m1v', '.m2v', '.m2p', '.m2t', '.mpegts', '.mpv', '.f4v', '.cavs', '.drc', '.fli', '.flc', '.gxf',
  '.h261', '.h263', '.m4s', '.mlv', '.r3d', '.roq', '.rpl', '.smk', '.swf', '.wtv', '.ogm', '.ismv', '.nut', '.dv', '.dif',
  '.mjpeg', '.mjpg', '.bik', '.svi', '.tod', '.mod', '.y4m', '.h264', '.264', '.h265', '.265', '.hevc', '.avc',
  '.vc1', '.ivf', '.amv'
])

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
  private directFilePaths: string[] = []
  private sharedDirectoryPaths: string[] = []
  private readonly transcodeManager: WebTranscodeManager

  constructor(options: WebServerOptions) {
    this.options = options
    this.bindHost = options.bindHost ?? '0.0.0.0'
    this.transcodeManager = new WebTranscodeManager({
      cacheRoot: options.cacheRoot ?? join(tmpdir(), 'aivplayer-web-transcode'),
      getFfmpegPath: options.getFfmpegPath ?? (async () => null)
    })
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
      sharedFileCount: this.records.size,
      sharedDirectoryCount: this.sharedDirectoryPaths.length,
      sharedDirectoryPaths: [...this.sharedDirectoryPaths]
    }
  }

  async start(request: WebShareStartRequest): Promise<WebShareStatus> {
    await this.stop()
    const collection = await this.createRecords(request.filePaths, request.directoryPaths ?? [])
    if (collection.records.length === 0) throw new Error('没有可共享的媒体文件')

    this.records = new Map(collection.records.map((record) => [record.id, record]))
    this.directFilePaths = [...request.filePaths]
    this.sharedDirectoryPaths = collection.directoryPaths
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
    this.directFilePaths = []
    this.sharedDirectoryPaths = []
    await this.transcodeManager.stop()
    if (!server) return
    server.closeAllConnections?.()
    await new Promise<void>((resolvePromise) => {
      server.close(() => resolvePromise())
    }).catch(() => undefined)
  }

  async refresh(request: WebShareStartRequest = { filePaths: this.directFilePaths, directoryPaths: this.sharedDirectoryPaths }): Promise<WebShareStatus> {
    if (!this.server) throw new Error('Web 服务尚未启动')
    const collection = await this.createRecords(request.filePaths, request.directoryPaths ?? [])
    const previousRecordsByPath = new Map([...this.records.values()].map((record) => [record.path, record]))
    const records = collection.records.map((record) => {
      const previous = previousRecordsByPath.get(record.path)
      return previous ? { ...record, id: previous.id } : record
    })
    this.records = new Map(records.map((record) => [record.id, record]))
    this.directFilePaths = [...request.filePaths]
    this.sharedDirectoryPaths = collection.directoryPaths
    return this.getStatus()
  }

  private async createRecords(filePaths: string[], directoryPaths: string[]): Promise<SharedRecordCollection> {
    const directPaths = filePaths
      .filter((filePath) => typeof filePath === 'string' && filePath.trim())
      .map((filePath) => resolve(filePath))
    const uniqueDirectPaths = [...new Set(directPaths)]
    const sharedPaths = [...uniqueDirectPaths]
    const validDirectoryPaths: string[] = []
    const seenDirectoryPaths = new Set<string>()
    for (const inputDirectoryPath of [...new Set(directoryPaths.filter((directoryPath) => typeof directoryPath === 'string' && directoryPath.trim()))]) {
      const scan = await this.scanDirectory(inputDirectoryPath)
      if (!scan || seenDirectoryPaths.has(scan.rootPath)) continue
      seenDirectoryPaths.add(scan.rootPath)
      validDirectoryPaths.push(scan.rootPath)
      sharedPaths.push(...scan.filePaths)
      if (sharedPaths.length >= MAX_SHARED_FILES) break
    }

    const uniquePaths = [...new Set(sharedPaths)].slice(0, MAX_SHARED_FILES)
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
    return { records, directoryPaths: validDirectoryPaths }
  }

  private async scanDirectory(inputPath: string): Promise<{ rootPath: string; filePaths: string[] } | null> {
    let rootPath: string
    try {
      rootPath = await realpath(resolve(inputPath))
      if (!(await stat(rootPath)).isDirectory()) return null
    } catch {
      return null
    }

    const filePaths: string[] = []
    const visit = async (directoryPath: string): Promise<void> => {
      if (filePaths.length >= MAX_SHARED_FILES) return
      let entries
      try {
        entries = await readdir(directoryPath, { withFileTypes: true })
      } catch {
        return
      }
      entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
      for (const entry of entries) {
        if (filePaths.length >= MAX_SHARED_FILES) return
        const entryPath = join(directoryPath, entry.name)
        if (entry.isDirectory()) {
          await visit(entryPath)
        } else if (entry.isFile() && isVideoFilePath(entryPath)) {
          filePaths.push(entryPath)
        }
      }
    }

    await visit(rootPath)
    return { rootPath, filePaths }
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

    if (url.pathname === '/api/v1/library/refresh' && request.method === 'POST') {
      await this.refresh()
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

    const transcodeStartMatch = /^\/api\/v1\/media\/([^/]+)\/transcode$/u.exec(url.pathname)
    if (transcodeStartMatch && request.method === 'POST') {
      const status = await this.startTranscode(transcodeStartMatch[1]!)
      if (!status) {
        sendJson(response, 404, { message: '媒体文件不存在' })
        return
      }
      sendJson(response, 200, status)
      return
    }

    const transcodeStatusMatch = /^\/api\/v1\/transcode\/([^/]+)$/u.exec(url.pathname)
    if (transcodeStatusMatch && request.method === 'GET') {
      const status = await this.getTranscodeStatus(transcodeStatusMatch[1]!)
      if (!status) {
        sendJson(response, 404, { message: '媒体文件不存在' })
        return
      }
      sendJson(response, 200, status)
      return
    }

    const streamMatch = /^\/media\/([^/]+)$/u.exec(url.pathname)
    if (streamMatch && (request.method === 'GET' || request.method === 'HEAD')) {
      await this.streamMedia(streamMatch[1]!, request, response)
      return
    }

    const transcodedStreamMatch = /^\/transcoded\/([^/]+)$/u.exec(url.pathname)
    if (transcodedStreamMatch && (request.method === 'GET' || request.method === 'HEAD')) {
      await this.streamTranscodedMedia(transcodedStreamMatch[1]!, request, response)
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
      transcodeUrl: `/api/v1/media/${record.id}/transcode`,
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

  private async getTranscodeInput(id: string, durationSeconds: number | null = null): Promise<WebTranscodeInput | null> {
    if (!MEDIA_ID_PATTERN.test(id)) return null
    const record = this.records.get(id)
    if (!record) return null
    try {
      const fileStat = await stat(record.path)
      if (!fileStat.isFile()) return null
    } catch {
      return null
    }
    return { id, sourcePath: record.path, durationSeconds }
  }

  private async startTranscode(id: string): Promise<WebTranscodeStatus | null> {
    const record = this.records.get(id)
    if (!record) return null
    const details = await this.createMediaDetails(id)
    const input = await this.getTranscodeInput(id, details?.metadata?.durationSeconds ?? null)
    if (!input) return null
    return this.toWebTranscodeStatus(await this.transcodeManager.start(input), id)
  }

  private async getTranscodeStatus(id: string): Promise<WebTranscodeStatus | null> {
    const input = await this.getTranscodeInput(id)
    if (!input) return null
    return this.toWebTranscodeStatus(await this.transcodeManager.getStatus(input), id)
  }

  private toWebTranscodeStatus(status: WebTranscodeJobStatus, id: string): WebTranscodeStatus {
    return {
      state: status.state,
      progress: status.progress,
      outputBytes: status.outputBytes,
      message: status.message,
      streamUrl: status.state === 'ready' ? `/transcoded/${id}` : null
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

    await this.streamFile(record.path, record.name, record.mimeType, request, response)
  }

  private async streamTranscodedMedia(id: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!MEDIA_ID_PATTERN.test(id)) {
      sendText(response, 400, 'Invalid media id')
      return
    }
    const record = this.records.get(id)
    const input = await this.getTranscodeInput(id)
    if (!record || !input) {
      sendText(response, 404, 'Media file not found')
      return
    }
    const outputPath = await this.transcodeManager.getReadyOutputPath(input)
    if (!outputPath) {
      sendText(response, 409, '转码尚未完成')
      return
    }
    await this.streamFile(outputPath, `${record.name}.mp4`, 'video/mp4', request, response)
  }

  private async streamFile(filePath: string, fileName: string, mimeType: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
    let fileStat
    try {
      fileStat = await stat(filePath)
    } catch {
      sendText(response, 404, 'Media file not found')
      return
    }

    const rangeHeader = typeof request.headers.range === 'string' ? request.headers.range : null
    const range = parseRangeHeader(rangeHeader, fileStat.size)
    const commonHeaders = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': getContentDisposition(fileName),
      'Content-Type': mimeType,
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

    const stream = createReadStream(filePath, { start, end })
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
