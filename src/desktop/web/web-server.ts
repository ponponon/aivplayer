import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { createReadStream, existsSync, realpathSync } from 'node:fs'
import { access, mkdir, readFile, readdir, rename, stat, realpath, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { tmpdir } from 'node:os'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { promisify } from 'node:util'
import { getContentTypeForFile } from '../../core/media/media-mime'
import { parseRangeHeader } from '../../core/media/byte-range'
import { isVideoFilePath } from '../../core/media/file-opening'
import { createMediaProbeMetadata } from '../../core/media/media-metadata'
import { WebTranscodeManager, type WebTranscodeInput, type WebTranscodeJobStatus } from '../../core/media/web-transcode'
import type {
  WebBrowserSupport,
  WebMediaSourceKind,
  WebShareLibraryResponse,
  WebShareMediaDetails,
  WebShareMediaItem,
  WebShareMediaLinks,
  WebShareStartRequest,
  WebShareStatus,
  WebSubtitleTrack,
  WebAudioTrack,
  WebDesktopState,
  WebDesktopStateUpdate,
  WebRemoteCommand,
  WebRemoteCommandForDesktop,
  WebTranscodeStatus
} from '../../shared/web-types'

const execFileAsync = promisify(execFile)

type WebServerOptions = {
  resourcePath: string
  webRoot?: string
  bindHost?: string
  env?: NodeJS.ProcessEnv
  cacheRoot?: string
  getFfmpegPath?: () => Promise<string | null>
  onRemoteCommand?: (command: WebRemoteCommandForDesktop) => void
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
  sourceKind: WebMediaSourceKind
  sourceGroupId: string
  sourceGroupLabel: string
  relativePath: string
}

type SharedMediaCandidate = {
  path: string
  sourceKind: WebMediaSourceKind
  sourceGroupId: string
  sourceGroupLabel: string
  relativePath: string
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
const THUMBNAIL_MAX_BUFFER_BYTES = 4 * 1024 * 1024
const EMBEDDED_SUBTITLE_MAX_BUFFER_BYTES = 8 * 1024 * 1024
const AUDIO_REMAP_MAX_BUFFER_BYTES = 2 * 1024 * 1024
const MAX_BATCH_DOWNLOAD_FILES = 50
const MAX_BATCH_DOWNLOAD_BYTES = 4 * 1024 ** 3
const ZIP_DATA_DESCRIPTOR_SIGNATURE = 0x08074b50
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

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

function createMediaId(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex').slice(0, 24)
}

function createGroupId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`
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

function getContentDisposition(fileName: string, disposition: 'inline' | 'attachment' = 'inline'): string {
  const safeName = fileName.replace(/[\r\n"]/gu, '_')
  return `${disposition}; filename*=UTF-8''${encodeURIComponent(safeName)}`
}

function updateCrc32(crc: number, chunk: Buffer): number {
  let value = (crc ^ 0xffffffff) >>> 0
  for (const byte of chunk) value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function sanitizeZipPath(value: string): string {
  const parts = value.replaceAll('\\', '/').split('/').filter((part) => part && part !== '.' && part !== '..' && !part.includes('\u0000'))
  return parts.join('/') || 'media'
}

function getZipEntryName(record: SharedMediaRecord, usedNames: Set<string>): string {
  const baseName = sanitizeZipPath(`${record.sourceGroupLabel}/${record.relativePath || record.name}`)
  let candidate = baseName
  let suffix = 2
  while (usedNames.has(candidate)) {
    const extension = extname(baseName)
    const stem = extension ? baseName.slice(0, -extension.length) : baseName
    candidate = `${stem} (${suffix})${extension}`
    suffix += 1
  }
  usedNames.add(candidate)
  return candidate
}

function createZipLocalFileHeader(name: Buffer): Buffer {
  const header = Buffer.alloc(30 + name.byteLength)
  header.writeUInt32LE(ZIP_LOCAL_FILE_SIGNATURE, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0x808, 6)
  header.writeUInt16LE(0, 8)
  header.writeUInt16LE(0, 10)
  header.writeUInt16LE(0, 12)
  header.writeUInt32LE(0, 14)
  header.writeUInt32LE(0, 18)
  header.writeUInt32LE(0, 22)
  header.writeUInt16LE(name.byteLength, 26)
  header.writeUInt16LE(0, 28)
  name.copy(header, 30)
  return header
}

function createZipDataDescriptor(crc: number, size: number): Buffer {
  const descriptor = Buffer.alloc(16)
  descriptor.writeUInt32LE(ZIP_DATA_DESCRIPTOR_SIGNATURE, 0)
  descriptor.writeUInt32LE(crc >>> 0, 4)
  descriptor.writeUInt32LE(size, 8)
  descriptor.writeUInt32LE(size, 12)
  return descriptor
}

function createZipCentralDirectoryHeader(name: Buffer, crc: number, size: number, localOffset: number): Buffer {
  const header = Buffer.alloc(46 + name.byteLength)
  header.writeUInt32LE(ZIP_CENTRAL_DIRECTORY_SIGNATURE, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(20, 6)
  header.writeUInt16LE(0x808, 8)
  header.writeUInt16LE(0, 10)
  header.writeUInt16LE(0, 12)
  header.writeUInt16LE(0, 14)
  header.writeUInt32LE(crc >>> 0, 16)
  header.writeUInt32LE(size, 20)
  header.writeUInt32LE(size, 24)
  header.writeUInt16LE(name.byteLength, 28)
  header.writeUInt16LE(0, 30)
  header.writeUInt16LE(0, 32)
  header.writeUInt16LE(0, 34)
  header.writeUInt16LE(0, 36)
  header.writeUInt32LE(0, 38)
  header.writeUInt32LE(localOffset, 42)
  name.copy(header, 46)
  return header
}

function createZipEndOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Buffer {
  const end = Buffer.alloc(22)
  end.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entryCount, 8)
  end.writeUInt16LE(entryCount, 10)
  end.writeUInt32LE(centralDirectorySize, 12)
  end.writeUInt32LE(centralDirectoryOffset, 16)
  end.writeUInt16LE(0, 20)
  return end
}

async function writeResponseChunk(response: ServerResponse, chunk: Buffer): Promise<void> {
  if (response.write(chunk)) return
  await once(response, 'drain')
}

function getStreamText(stream: Record<string, unknown>, key: string): string | null {
  const value = stream[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getStreamNumber(stream: Record<string, unknown>, key: string): number | null {
  const value = stream[key]
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function getStreamDefault(stream: Record<string, unknown>): boolean {
  return getStreamNumber(stream.disposition as Record<string, unknown> | undefined ?? {}, 'default') === 1
}

function parseRemoteCommand(value: unknown): WebRemoteCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const type = input.type
  if (type === 'play' || type === 'pause' || type === 'toggle' || type === 'next' || type === 'previous') return { type }
  if (type === 'seek' && typeof input.position === 'number' && Number.isFinite(input.position)) return { type, position: input.position }
  if (type === 'select' && typeof input.mediaId === 'string' && MEDIA_ID_PATTERN.test(input.mediaId)) return { type, mediaId: input.mediaId }
  if (type === 'volume' && typeof input.volume === 'number' && Number.isFinite(input.volume)) return { type, volume: input.volume, muted: input.muted === true }
  return null
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
  private readonly thumbnailRoot: string
  private readonly thumbnailPromises = new Map<string, Promise<Buffer | null>>()
  private readonly subtitlePromises = new Map<string, Promise<string | null>>()
  private readonly audioPromises = new Map<string, Promise<string | null>>()
  private desktopState: WebDesktopState | null = null
  private allowRemoteControl = false

  constructor(options: WebServerOptions) {
    this.options = options
    this.bindHost = options.bindHost ?? '0.0.0.0'
    this.transcodeManager = new WebTranscodeManager({
      cacheRoot: options.cacheRoot ?? join(tmpdir(), 'aivplayer-web-transcode'),
      getFfmpegPath: options.getFfmpegPath ?? (async () => null)
    })
    this.thumbnailRoot = join(options.cacheRoot ?? join(tmpdir(), 'aivplayer-web-transcode'), 'thumbnails')
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
      sharedDirectoryPaths: [...this.sharedDirectoryPaths],
      allowRemoteControl: this.allowRemoteControl
    }
  }

  async start(request: WebShareStartRequest): Promise<WebShareStatus> {
    await this.stop()
    const collection = await this.createRecords(request.filePaths, request.directoryPaths ?? [])
    if (collection.records.length === 0) throw new Error('没有可共享的媒体文件')

    this.records = new Map(collection.records.map((record) => [record.id, record]))
    this.directFilePaths = [...request.filePaths]
    this.sharedDirectoryPaths = collection.directoryPaths
    this.allowRemoteControl = request.allowRemoteControl ?? this.allowRemoteControl
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
    this.desktopState = null
    this.allowRemoteControl = false
    this.thumbnailPromises.clear()
    this.subtitlePromises.clear()
    this.audioPromises.clear()
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
    this.allowRemoteControl = request.allowRemoteControl ?? this.allowRemoteControl
    return this.getStatus()
  }

  updateDesktopState(update: WebDesktopStateUpdate): void {
    const currentRecord = update.currentFilePath ? this.findRecordByPath(update.currentFilePath) : null
    const playlistMediaIds = update.playlistFilePaths.map((filePath) => this.findRecordByPath(filePath)?.id).filter((id): id is string => Boolean(id))
    this.desktopState = {
      updatedAt: Date.now(),
      currentMediaId: currentRecord?.id ?? null,
      currentMediaName: currentRecord?.name ?? null,
      currentTime: Number.isFinite(update.currentTime) ? Math.max(0, update.currentTime) : 0,
      duration: Number.isFinite(update.duration) ? Math.max(0, update.duration) : 0,
      isPlaying: update.isPlaying === true,
      volume: Number.isFinite(update.volume) ? Math.min(1, Math.max(0, update.volume)) : 1,
      muted: update.muted === true,
      playbackRate: Number.isFinite(update.playbackRate) ? Math.max(0.1, update.playbackRate) : 1,
      playlistMediaIds
    }
  }

  getDesktopState(): WebDesktopState | null {
    return this.desktopState
  }

  private findRecordByPath(filePath: string): SharedMediaRecord | null {
    let resolvedPath = resolve(filePath)
    try { resolvedPath = realpathSync(filePath) } catch { /* The record lookup below will fail closed. */ }
    return [...this.records.values()].find((record) => record.path === filePath || record.path === resolvedPath) ?? null
  }

  private async createRecords(filePaths: string[], directoryPaths: string[]): Promise<SharedRecordCollection> {
    const directPaths = filePaths
      .filter((filePath) => typeof filePath === 'string' && filePath.trim())
      .map((filePath) => resolve(filePath))
    const uniqueDirectPaths = [...new Set(directPaths)]
    const candidates: SharedMediaCandidate[] = uniqueDirectPaths.map((path) => ({
      path,
      sourceKind: 'playlist',
      sourceGroupId: 'playlist',
      sourceGroupLabel: '当前播放列表',
      relativePath: basename(path)
    }))
    const validDirectoryPaths: string[] = []
    const seenDirectoryPaths = new Set<string>()
    for (const inputDirectoryPath of [...new Set(directoryPaths.filter((directoryPath) => typeof directoryPath === 'string' && directoryPath.trim()))]) {
      const scan = await this.scanDirectory(inputDirectoryPath)
      if (!scan || seenDirectoryPaths.has(scan.rootPath)) continue
      seenDirectoryPaths.add(scan.rootPath)
      validDirectoryPaths.push(scan.rootPath)
      candidates.push(...scan.filePaths.map((file) => ({
        path: file.path,
        sourceKind: 'directory' as const,
        sourceGroupId: createGroupId('directory', scan.rootPath),
        sourceGroupLabel: basename(scan.rootPath) || scan.rootPath,
        relativePath: file.relativePath
      })))
      if (candidates.length >= MAX_SHARED_FILES) break
    }

    const uniqueCandidates: SharedMediaCandidate[] = []
    const seenPaths = new Set<string>()
    for (const candidate of candidates) {
      if (seenPaths.has(candidate.path)) continue
      seenPaths.add(candidate.path)
      uniqueCandidates.push(candidate)
      if (uniqueCandidates.length >= MAX_SHARED_FILES) break
    }
    const records: SharedMediaRecord[] = []
    for (const candidate of uniqueCandidates) {
      try {
        const path = await realpath(candidate.path)
        const fileStat = await stat(path)
        if (!fileStat.isFile()) continue
        records.push({
          id: createMediaId(path),
          path,
          name: basename(path),
          extension: extname(path).toLowerCase(),
          mimeType: getContentTypeForFile(path),
          sizeBytes: fileStat.size,
          modifiedAt: fileStat.mtimeMs,
          subtitlePath: getSidecarSubtitlePath(path),
          sourceKind: candidate.sourceKind,
          sourceGroupId: candidate.sourceGroupId,
          sourceGroupLabel: candidate.sourceGroupLabel,
          relativePath: candidate.relativePath
        })
      } catch {
        continue
      }
    }
    return { records, directoryPaths: validDirectoryPaths }
  }

  private async scanDirectory(inputPath: string): Promise<{ rootPath: string; filePaths: Array<{ path: string; relativePath: string }> } | null> {
    let rootPath: string
    try {
      rootPath = await realpath(resolve(inputPath))
      if (!(await stat(rootPath)).isDirectory()) return null
    } catch {
      return null
    }

    const filePaths: Array<{ path: string; relativePath: string }> = []
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
          filePaths.push({ path: entryPath, relativePath: relative(rootPath, entryPath).split(sep).join('/') })
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

    if (url.pathname === '/manifest.webmanifest' || url.pathname === '/icon.svg') {
      await this.serveStaticFile(response, url.pathname)
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

    if (url.pathname === '/api/v1/desktop/state' && request.method === 'GET') {
      sendJson(response, 200, { state: this.desktopState, allowRemoteControl: this.allowRemoteControl })
      return
    }

    if (url.pathname === '/api/v1/desktop/command' && request.method === 'POST') {
      if (!this.allowRemoteControl) {
        sendJson(response, 403, { message: '桌面端未允许远程控制' })
        return
      }
      let command: WebRemoteCommand | null = null
      try { command = parseRemoteCommand(JSON.parse(await this.readRequestBody(request))) } catch { command = null }
      if (!command) {
        sendJson(response, 400, { message: '远程控制命令无效' })
        return
      }
      const mediaPath = command.type === 'select' ? this.records.get(command.mediaId)?.path : undefined
      if (command.type === 'select' && !mediaPath) {
        sendJson(response, 404, { message: '媒体文件不在当前共享列表中' })
        return
      }
      this.options.onRemoteCommand?.({ ...command, ...(mediaPath ? { mediaPath } : {}) })
      sendJson(response, 202, { accepted: true })
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

    const mediaLinksMatch = /^\/api\/v1\/media\/([^/]+)\/link$/u.exec(url.pathname)
    if (mediaLinksMatch && request.method === 'GET') {
      const record = this.records.get(mediaLinksMatch[1]!)
      if (!record) {
        sendJson(response, 404, { message: '媒体文件不存在' })
        return
      }
      const origin = `${url.protocol}//${url.host}`
      const access = `access=${encodeURIComponent(this.sessionToken!)}`
      const links: WebShareMediaLinks = {
        url: `${origin}/media/${record.id}?${access}`,
        downloadUrl: `${origin}/download/${record.id}?${access}`
      }
      sendJson(response, 200, links)
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

    if (url.pathname === '/download/package' && request.method === 'GET') {
      await this.streamBatchDownload(url.searchParams.getAll('id'), response)
      return
    }

    const downloadMatch = /^\/download\/([^/]+)$/u.exec(url.pathname)
    if (downloadMatch && (request.method === 'GET' || request.method === 'HEAD')) {
      await this.streamMedia(downloadMatch[1]!, request, response, 'attachment')
      return
    }

    const transcodedStreamMatch = /^\/transcoded\/([^/]+)$/u.exec(url.pathname)
    if (transcodedStreamMatch && (request.method === 'GET' || request.method === 'HEAD')) {
      await this.streamTranscodedMedia(transcodedStreamMatch[1]!, request, response)
      return
    }

    const subtitleMatch = /^\/subtitle\/([^/]+)(?:\/(\d+))?$/u.exec(url.pathname)
    if (subtitleMatch && request.method === 'GET') {
      await this.serveSubtitle(subtitleMatch[1]!, subtitleMatch[2] ? Number(subtitleMatch[2]) : null, response)
      return
    }

    const audioMatch = /^\/audio\/([^/]+)\/(\d+)$/u.exec(url.pathname)
    if (audioMatch && (request.method === 'GET' || request.method === 'HEAD')) {
      await this.streamSelectedAudio(audioMatch[1]!, Number(audioMatch[2]), request, response)
      return
    }

    const thumbnailMatch = /^\/thumbnail\/([^/]+)$/u.exec(url.pathname)
    if (thumbnailMatch && (request.method === 'GET' || request.method === 'HEAD')) {
      await this.serveThumbnail(thumbnailMatch[1]!, request, response)
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
      audioCodec: metadata?.audio?.codec ?? null,
      sourceKind: record.sourceKind,
      sourceGroupId: record.sourceGroupId,
      sourceGroupLabel: record.sourceGroupLabel,
      relativePath: record.relativePath,
      thumbnailUrl: `/thumbnail/${record.id}`
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
        metadata,
        subtitleTracks: this.createSubtitleTracks(record, metadata),
        audioTracks: this.createAudioTracks(record, metadata)
      }
    } catch {
      return null
    }
  }

  private createSubtitleTracks(record: SharedMediaRecord, metadata: WebShareMediaDetails['metadata']): WebSubtitleTrack[] {
    const tracks: WebSubtitleTrack[] = record.subtitlePath ? [{
      id: 'sidecar',
      label: '外挂字幕',
      language: null,
      codec: 'webvtt',
      streamIndex: null,
      default: true,
      url: `/subtitle/${record.id}`
    }] : []
    for (const stream of metadata?.details?.streams ?? []) {
      if (stream.codec_type !== 'subtitle') continue
      const streamIndex = getStreamNumber(stream, 'index')
      if (streamIndex == null) continue
      const tags = stream.tags && typeof stream.tags === 'object' && !Array.isArray(stream.tags) ? stream.tags as Record<string, unknown> : null
      const tagLanguage = tags && typeof tags.language === 'string' ? tags.language : null
      const title = tags && typeof tags.title === 'string' ? tags.title : null
      tracks.push({
        id: `subtitle-${streamIndex}`,
        label: title ?? tagLanguage ?? `内嵌字幕 ${tracks.length + 1}`,
        language: tagLanguage,
        codec: getStreamText(stream, 'codec_name'),
        streamIndex,
        default: tracks.length === 0 && getStreamDefault(stream),
        url: `/subtitle/${record.id}/${streamIndex}`
      })
    }
    return tracks
  }

  private createAudioTracks(record: SharedMediaRecord, metadata: WebShareMediaDetails['metadata']): WebAudioTrack[] {
    const tracks: WebAudioTrack[] = []
    for (const stream of metadata?.details?.streams ?? []) {
      if (stream.codec_type !== 'audio') continue
      const streamIndex = getStreamNumber(stream, 'index')
      if (streamIndex == null) continue
      const tags = stream.tags && typeof stream.tags === 'object' && !Array.isArray(stream.tags) ? stream.tags as Record<string, unknown> : null
      const language = tags && typeof tags.language === 'string' ? tags.language : null
      const title = tags && typeof tags.title === 'string' ? tags.title : null
      tracks.push({
        id: `audio-${streamIndex}`,
        label: title ?? language ?? `音轨 ${tracks.length + 1}`,
        language,
        codec: getStreamText(stream, 'codec_name'),
        streamIndex,
        default: tracks.length === 0 || getStreamDefault(stream),
        streamUrl: `/audio/${record.id}/${streamIndex}`
      })
    }
    return tracks
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

  private async streamMedia(id: string, request: IncomingMessage, response: ServerResponse, disposition: 'inline' | 'attachment' = 'inline'): Promise<void> {
    if (!MEDIA_ID_PATTERN.test(id)) {
      sendText(response, 400, 'Invalid media id')
      return
    }
    const record = this.records.get(id)
    if (!record) {
      sendText(response, 404, 'Media file not found')
      return
    }

    await this.streamFile(record.path, record.name, record.mimeType, request, response, disposition)
  }

  private async streamBatchDownload(ids: string[], response: ServerResponse): Promise<void> {
    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length === 0 || uniqueIds.length > MAX_BATCH_DOWNLOAD_FILES || uniqueIds.some((id) => !MEDIA_ID_PATTERN.test(id))) {
      sendText(response, 400, `批量下载最多支持 ${MAX_BATCH_DOWNLOAD_FILES} 个有效媒体文件`)
      return
    }
    const records = uniqueIds.map((id) => this.records.get(id) ?? null)
    if (records.some((record) => !record)) {
      sendText(response, 404, '批量下载中包含不存在的媒体文件')
      return
    }
    const resolvedRecords = records.filter((record): record is SharedMediaRecord => Boolean(record))
    let estimatedBytes = 0
    for (const record of resolvedRecords) {
      try {
        const fileStat = await stat(record.path)
        if (!fileStat.isFile() || fileStat.size > 0xffffffff) {
          sendText(response, 413, '批量下载中的文件超过 ZIP 格式限制')
          return
        }
        estimatedBytes += fileStat.size
        if (estimatedBytes > MAX_BATCH_DOWNLOAD_BYTES) {
          sendText(response, 413, '批量下载总大小超过 4 GB 限制')
          return
        }
      } catch {
        sendText(response, 404, '批量下载中的媒体文件已不存在')
        return
      }
    }

    const usedNames = new Set<string>()
    const centralEntries: Array<{ name: Buffer; crc: number; size: number; localOffset: number }> = []
    let offset = 0
    response.writeHead(200, {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': getContentDisposition('aivplayer-media.zip', 'attachment'),
      'Content-Type': 'application/zip',
      'X-Content-Type-Options': 'nosniff'
    })
    try {
      for (const record of resolvedRecords) {
        const name = Buffer.from(getZipEntryName(record, usedNames), 'utf8')
        const localOffset = offset
        const localHeader = createZipLocalFileHeader(name)
        await writeResponseChunk(response, localHeader)
        offset += localHeader.byteLength

        let crc = 0
        let size = 0
        const stream = createReadStream(record.path)
        for await (const chunk of stream) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          crc = updateCrc32(crc, buffer)
          size += buffer.byteLength
          await writeResponseChunk(response, buffer)
        }
        const descriptor = createZipDataDescriptor(crc, size)
        await writeResponseChunk(response, descriptor)
        offset += size + descriptor.byteLength
        centralEntries.push({ name, crc, size, localOffset })
      }

      const centralDirectoryOffset = offset
      let centralDirectorySize = 0
      for (const entry of centralEntries) {
        const header = createZipCentralDirectoryHeader(entry.name, entry.crc, entry.size, entry.localOffset)
        await writeResponseChunk(response, header)
        centralDirectorySize += header.byteLength
      }
      response.end(createZipEndOfCentralDirectory(centralEntries.length, centralDirectorySize, centralDirectoryOffset))
    } catch (error) {
      response.destroy(error instanceof Error ? error : undefined)
    }
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

  private async streamFile(filePath: string, fileName: string, mimeType: string, request: IncomingMessage, response: ServerResponse, disposition: 'inline' | 'attachment' = 'inline'): Promise<void> {
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
      'Content-Disposition': getContentDisposition(fileName, disposition),
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

  private async serveSubtitle(id: string, streamIndex: number | null, response: ServerResponse): Promise<void> {
    if (!MEDIA_ID_PATTERN.test(id)) {
      sendText(response, 400, 'Invalid media id')
      return
    }
    const record = this.records.get(id)
    if (!record) {
      sendText(response, 404, 'Subtitle not found')
      return
    }
    try {
      const body = streamIndex == null
        ? record.subtitlePath ? formatSubtitleTextAsVtt(await readFile(record.subtitlePath, 'utf8')) : null
        : await this.getEmbeddedSubtitle(record, streamIndex)
      if (!body) {
        sendText(response, 404, 'Subtitle not found')
        return
      }
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

  private async getEmbeddedSubtitle(record: SharedMediaRecord, streamIndex: number): Promise<string | null> {
    if (!Number.isInteger(streamIndex) || streamIndex < 0) return null
    const key = `${record.id}:${streamIndex}`
    const existing = this.subtitlePromises.get(key)
    if (existing) return existing
    const promise = (async (): Promise<string | null> => {
      const ffmpegPath = await (this.options.getFfmpegPath ?? (async () => null))()
      if (!ffmpegPath) return null
      try {
        const result = await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', record.path, '-map', `0:${streamIndex}`, '-f', 'webvtt', 'pipe:1'], {
          encoding: 'utf8', maxBuffer: EMBEDDED_SUBTITLE_MAX_BUFFER_BYTES, timeout: 30_000
        }) as unknown as { stdout: string }
        const body = result.stdout.trim()
        return body.startsWith('WEBVTT') ? `${body}\n` : null
      } catch {
        return null
      }
    })()
    this.subtitlePromises.set(key, promise)
    try { return await promise } finally { this.subtitlePromises.delete(key) }
  }

  private async streamSelectedAudio(id: string, streamIndex: number, request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!MEDIA_ID_PATTERN.test(id) || !Number.isInteger(streamIndex) || streamIndex < 0) {
      sendText(response, 400, 'Invalid audio track')
      return
    }
    const record = this.records.get(id)
    if (!record) {
      sendText(response, 404, 'Media file not found')
      return
    }
    const outputPath = await this.getSelectedAudioOutput(record, streamIndex)
    if (!outputPath) {
      sendText(response, 409, '音轨准备失败')
      return
    }
    await this.streamFile(outputPath, `${record.name}.audio-${streamIndex}.mp4`, 'video/mp4', request, response)
  }

  private async getSelectedAudioOutput(record: SharedMediaRecord, streamIndex: number): Promise<string | null> {
    const key = `${record.id}:${streamIndex}`
    const cachePath = join(this.thumbnailRoot, '..', 'audio', `${record.id}-${streamIndex}.mp4`)
    try {
      const cachedStat = await stat(cachePath)
      if (cachedStat.size > 0) return cachePath
    } catch {
      // Cache miss; remux below.
    }
    const existing = this.audioPromises.get(key)
    if (existing) return existing
    const promise = this.remuxSelectedAudio(record.path, streamIndex, cachePath)
    this.audioPromises.set(key, promise)
    try { return await promise } finally { this.audioPromises.delete(key) }
  }

  private async remuxSelectedAudio(sourcePath: string, streamIndex: number, outputPath: string): Promise<string | null> {
    const ffmpegPath = await (this.options.getFfmpegPath ?? (async () => null))()
    if (!ffmpegPath) return null
    await mkdir(join(outputPath, '..'), { recursive: true })
    const partialPath = `${outputPath}.partial`
    const run = async (audioCodec: readonly string[]): Promise<boolean> => {
      try {
        await execFileAsync(ffmpegPath, [
          '-hide_banner', '-loglevel', 'error', '-i', sourcePath, '-map', '0:v:0?', '-map', `0:${streamIndex}?`,
          '-dn', '-sn', '-c:v', 'copy', ...audioCodec, '-movflags', '+faststart', '-y', partialPath
        ], { encoding: 'utf8', maxBuffer: AUDIO_REMAP_MAX_BUFFER_BYTES, timeout: 20 * 60_000 })
        const outputStat = await stat(partialPath)
        if (outputStat.size <= 0) return false
        await rename(partialPath, outputPath)
        return true
      } catch {
        return false
      }
    }
    if (await run(['-c:a', 'copy'])) return outputPath
    if (await run(['-c:a', 'aac', '-b:a', '192k'])) return outputPath
    return null
  }

  private async serveThumbnail(id: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!MEDIA_ID_PATTERN.test(id)) {
      sendText(response, 400, 'Invalid media id')
      return
    }
    const record = this.records.get(id)
    if (!record) {
      sendText(response, 404, 'Thumbnail not found')
      return
    }
    const thumbnail = await this.getThumbnail(record)
    if (!thumbnail) {
      sendText(response, 404, 'Thumbnail unavailable')
      return
    }
    response.writeHead(200, {
      'Cache-Control': 'private, max-age=86400',
      'Content-Length': thumbnail.byteLength,
      'Content-Type': 'image/jpeg',
      'X-Content-Type-Options': 'nosniff'
    })
    if (request.method !== 'HEAD') response.end(thumbnail)
    else response.end()
  }

  private async getThumbnail(record: SharedMediaRecord): Promise<Buffer | null> {
    let fileStat
    try {
      fileStat = await stat(record.path)
    } catch {
      return null
    }
    const cachePath = join(this.thumbnailRoot, `${record.id}-${Math.round(fileStat.mtimeMs)}.jpg`)
    try {
      return await readFile(cachePath)
    } catch {
      // Cache miss; generate it below.
    }
    const existing = this.thumbnailPromises.get(record.id)
    if (existing) return existing
    const promise = this.generateThumbnail(record.path, cachePath)
    this.thumbnailPromises.set(record.id, promise)
    try {
      return await promise
    } finally {
      this.thumbnailPromises.delete(record.id)
    }
  }

  private async generateThumbnail(sourcePath: string, cachePath: string): Promise<Buffer | null> {
    const ffmpegPath = await (this.options.getFfmpegPath ?? (async () => null))()
    if (!ffmpegPath) return null
    try {
      const result = await execFileAsync(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-ss', '1', '-i', sourcePath,
        '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '6', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'
      ], { encoding: 'buffer', maxBuffer: THUMBNAIL_MAX_BUFFER_BYTES, timeout: 15_000 }) as unknown as { stdout: Buffer | string }
      const thumbnail = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout)
      if (thumbnail.byteLength === 0) return null
      await mkdir(this.thumbnailRoot, { recursive: true })
      const partialPath = `${cachePath}.partial`
      await writeFile(partialPath, thumbnail)
      await rename(partialPath, cachePath)
      return thumbnail
    } catch {
      return null
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
