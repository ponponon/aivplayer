import { createHash, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createServer, createConnection, type Server, type Socket } from 'node:net'
import { dirname, join } from 'node:path'
import { EDITING_AGENT_BRIDGE_PROTOCOL, type EditingAgentBridgeManifest, type EditingAgentBridgeResponse, type EditingAgentProposalDecision, type EditingAgentProposalEnvelope, type EditingAgentProposalRequest } from '../../shared/editing-agent'

const MAX_MESSAGE_BYTES = 1024 * 1024
const DEFAULT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const MANIFEST_FILE_NAME = 'editing-agent-bridge.json'
const SOCKET_FILE_NAME = 'editing-agent-bridge.sock'

export type EditingAgentBridgePaths = {
  manifestPath: string
  socketPath: string
}

export type EditingAgentBridgeServerOptions = {
  userDataPath: string
  onProposal: (request: EditingAgentProposalRequest) => Promise<EditingAgentProposalDecision>
  requestTimeoutMs?: number
}

export function getEditingAgentBridgePaths(userDataPath: string): EditingAgentBridgePaths {
  const manifestPath = join(userDataPath, MANIFEST_FILE_NAME)
  if (process.platform === 'win32') {
    const suffix = createHash('sha256').update(userDataPath).digest('hex').slice(0, 20)
    return { manifestPath, socketPath: `\\\\.\\pipe\\aivplayer-editing-agent-${suffix}` }
  }
  return { manifestPath, socketPath: join(userDataPath, SOCKET_FILE_NAME) }
}

export class EditingAgentBridgeServer {
  private server: Server | null = null
  private readonly sockets = new Set<Socket>()
  private manifest: EditingAgentBridgeManifest | null = null
  private readonly options: EditingAgentBridgeServerOptions
  private readonly requestTimeoutMs: number

  constructor(options: EditingAgentBridgeServerOptions) {
    this.options = options
    this.requestTimeoutMs = normalizeTimeout(options.requestTimeoutMs)
  }

  get manifestPath(): string {
    return getEditingAgentBridgePaths(this.options.userDataPath).manifestPath
  }

  get socketPath(): string {
    return getEditingAgentBridgePaths(this.options.userDataPath).socketPath
  }

  async start(): Promise<EditingAgentBridgeManifest> {
    if (this.server && this.manifest) return this.manifest
    await mkdir(this.options.userDataPath, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') await rm(this.socketPath, { force: true })
    const server = createServer((socket) => this.handleConnection(socket))
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.removeListener('listening', onListening)
        reject(error)
      }
      const onListening = (): void => {
        server.removeListener('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(this.socketPath)
    })
    if (process.platform !== 'win32') await chmod(this.socketPath, 0o600)
    this.server = server
    this.manifest = {
      protocol: EDITING_AGENT_BRIDGE_PROTOCOL,
      socketPath: this.socketPath,
      token: randomBytes(32).toString('hex'),
      pid: process.pid,
      createdAt: Date.now()
    }
    await writeJsonAtomically(this.manifestPath, this.manifest)
    return this.manifest
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    const server = this.server
    this.server = null
    this.manifest = null
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    if (process.platform !== 'win32') await rm(this.socketPath, { force: true })
    await rm(this.manifestPath, { force: true })
  }

  private handleConnection(socket: Socket): void {
    this.sockets.add(socket)
    socket.setEncoding('utf8')
    let buffer = ''
    let handled = false
    const finish = (): void => {
      this.sockets.delete(socket)
      if (!socket.destroyed && !socket.writableEnded) socket.destroy()
    }
    socket.on('close', () => this.sockets.delete(socket))
    socket.on('error', () => this.sockets.delete(socket))
    socket.on('data', (chunk: string | Buffer) => {
      if (handled) return
      buffer += String(chunk)
      if (Buffer.byteLength(buffer, 'utf8') > MAX_MESSAGE_BYTES) {
        handled = true
        void writeBridgeResponse(socket, { ok: false, error: 'Agent bridge 请求超过 1 MiB 限制' }).finally(finish)
        return
      }
      const lineEnd = buffer.indexOf('\n')
      if (lineEnd < 0) return
      handled = true
      const line = buffer.slice(0, lineEnd).trim()
      void this.handleMessage(line).then((response) => writeBridgeResponse(socket, response)).catch((error) => writeBridgeResponse(socket, { ok: false, error: error instanceof Error ? error.message : String(error) })).finally(finish)
    })
  }

  private async handleMessage(line: string): Promise<EditingAgentBridgeResponse> {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      return { ok: false, error: 'Agent bridge 请求不是合法 JSON' }
    }
    if (!isEnvelope(value) || !this.manifest || value.token !== this.manifest.token) return { ok: false, error: 'Agent bridge 身份验证失败' }
    const decision = await withTimeout(this.options.onProposal(value), this.requestTimeoutMs, {
      outcome: 'expired',
      message: '桌面端确认等待超时'
    })
    return { ok: true, requestId: value.requestId, decision }
  }
}

export async function submitEditingAgentProposal(
  manifestPath: string,
  request: EditingAgentProposalRequest,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<EditingAgentProposalDecision> {
  const manifest = await readEditingAgentBridgeManifest(manifestPath)
  return new Promise<EditingAgentProposalDecision>((resolve, reject) => {
    const socket = createConnection(manifest.socketPath)
    socket.setEncoding('utf8')
    let buffer = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(new Error('无法在限定时间内获得桌面端 Proposal 确认'))
    }, normalizeTimeout(timeoutMs))
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      callback()
    }
    socket.once('connect', () => {
      const envelope: EditingAgentProposalEnvelope = { ...request, protocol: EDITING_AGENT_BRIDGE_PROTOCOL, token: manifest.token }
      socket.write(`${JSON.stringify(envelope)}\n`)
    })
    socket.on('data', (chunk: string | Buffer) => {
      buffer += String(chunk)
      if (Buffer.byteLength(buffer, 'utf8') > MAX_MESSAGE_BYTES) {
        finish(() => reject(new Error('桌面端返回超过 1 MiB 限制')))
        return
      }
      const lineEnd = buffer.indexOf('\n')
      if (lineEnd < 0) return
      try {
        const response = JSON.parse(buffer.slice(0, lineEnd)) as EditingAgentBridgeResponse
        if (!response.ok || !response.decision) finish(() => reject(new Error(response.error || '桌面端没有返回有效决策')))
        else finish(() => resolve(response.decision!))
      } catch {
        finish(() => reject(new Error('桌面端返回不是合法 JSON')))
      }
    })
    socket.once('error', (error) => finish(() => reject(new Error(`无法连接桌面端 Agent bridge：${error.message}`))))
  })
}

export async function readEditingAgentBridgeManifest(manifestPath: string): Promise<EditingAgentBridgeManifest> {
  let value: unknown
  try {
    value = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch {
    throw new Error(`桌面端 Agent bridge 未启动：${manifestPath}`)
  }
  if (!isManifest(value)) throw new Error('桌面端 Agent bridge 清单无效')
  return value
}

function isManifest(value: unknown): value is EditingAgentBridgeManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const object = value as Record<string, unknown>
  return object.protocol === EDITING_AGENT_BRIDGE_PROTOCOL && typeof object.socketPath === 'string' && object.socketPath.length > 0 && typeof object.token === 'string' && object.token.length >= 32 && typeof object.pid === 'number'
}

function isEnvelope(value: unknown): value is EditingAgentProposalEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const object = value as Record<string, unknown>
  const proposal = object.proposal
  return object.protocol === EDITING_AGENT_BRIDGE_PROTOCOL && typeof object.token === 'string' && typeof object.requestId === 'string' && object.requestId.length > 0 && typeof object.projectPath === 'string' && object.projectPath.toLowerCase().endsWith('.aivproj') && typeof object.createdAt === 'number' && Boolean(proposal && typeof proposal === 'object' && !Array.isArray(proposal))
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.part-${randomBytes(8).toString('hex')}`
  try {
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, filePath)
    if (process.platform !== 'win32') await chmod(filePath, 0o600)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

async function writeBridgeResponse(socket: Socket, response: EditingAgentBridgeResponse): Promise<void> {
  if (!socket.destroyed) socket.end(`${JSON.stringify(response)}\n`)
}

function normalizeTimeout(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(10 * 60 * 1000, Math.max(1000, Math.floor(value))) : DEFAULT_REQUEST_TIMEOUT_MS
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs) })])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
