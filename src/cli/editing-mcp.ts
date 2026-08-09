import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import { extname, resolve } from 'node:path'
import { buildDeleteScriptProposal, EditingProposalError } from '../core/editing/edit-proposal.ts'
import type { EditingAgentProposalDecision, EditingAgentProposalRequest } from '../shared/editing-agent'
import { inspectEditingProject, loadEditingProjectFile, searchEditingProjectCaptions } from './cli-edit.ts'

const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const
const MCP_SERVER_NAME = 'aivplayer-editing'
const MAX_LINE_BYTES = 1024 * 1024
const MAX_PROPOSAL_SEGMENTS = 64

type JsonRpcId = string | number | null
type JsonRpcRequest = {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: unknown
}

export type EditingMcpResponse = {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export type EditingMcpServerOptions = {
  projectPath: string
  version: string
  proposalSink?: (request: EditingAgentProposalRequest) => Promise<EditingAgentProposalDecision>
}

type EditingMcpTool = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOLS: readonly EditingMcpTool[] = [
  {
    name: 'editing_project_inspect',
    title: '查看剪辑工程',
    description: '只读查看固定 .aivproj 工程的素材、时间线、字幕和脚本统计。不会修改工程或读取其他路径。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'editing_project_captions',
    title: '检索工程字幕',
    description: '只读检索固定 .aivproj 工程的脚本行和字幕，可命中原文、译文以及已删除脚本行。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '可选的原文或译文检索词；省略时返回前 limit 条脚本行。' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'editing_project_propose_delete_script',
    title: '生成脚本删除 Proposal',
    description: '生成脚本行删除 Proposal，展示源区间、保留区间、字幕影响和预计时长；默认只读，桌面桥接模式下等待用户确认，但不会直接写工程或删除媒体。',
    inputSchema: {
      type: 'object',
      properties: {
        segmentIds: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_PROPOSAL_SEGMENTS,
          uniqueItems: true,
          items: { type: 'string', minLength: 1 }
        }
      },
      required: ['segmentIds'],
      additionalProperties: false
    }
  }
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasRequestId(request: JsonRpcRequest): boolean {
  return Object.prototype.hasOwnProperty.call(request, 'id')
}

function response(id: JsonRpcId, result: unknown): EditingMcpResponse {
  return { jsonrpc: '2.0', id, result }
}

function errorResponse(id: JsonRpcId, code: number, message: string, data?: unknown): EditingMcpResponse {
  return { jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } }
}

function toolText(value: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function invalidParams(message: string): Error {
  return new Error(message)
}

function readToolArguments(params: unknown): Record<string, unknown> {
  if (params === undefined) return {}
  if (!isRecord(params)) throw invalidParams('工具参数必须是 JSON object')
  return params
}

function readOptionalQuery(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw invalidParams('query 必须是字符串')
  return value
}

function readLimit(value: unknown): number {
  if (value === undefined) return 50
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 200) throw invalidParams('limit 必须是 1 到 200 之间的整数')
  return value
}

function readSegmentIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PROPOSAL_SEGMENTS) throw invalidParams(`segmentIds 必须是 1 到 ${MAX_PROPOSAL_SEGMENTS} 项的数组`)
  const segmentIds = value.map((item) => {
    if (typeof item !== 'string' || !item.trim()) throw invalidParams('segmentIds 中的每一项都必须是非空字符串')
    return item
  })
  if (new Set(segmentIds).size !== segmentIds.length) throw invalidParams('segmentIds 不能重复')
  return segmentIds
}

async function loadPinnedProject(projectPath: string) {
  return loadEditingProjectFile(projectPath)
}

async function callTool(name: string, params: unknown, options: EditingMcpServerOptions): Promise<{ content: [{ type: 'text'; text: string }] }> {
  const args = readToolArguments(params)
  const loaded = await loadPinnedProject(options.projectPath)

  if (name === 'editing_project_inspect') {
    if (Object.keys(args).length > 0) throw invalidParams('editing_project_inspect 不接受参数')
    return toolText({ ok: true, projectPath: loaded.filePath, project: inspectEditingProject(loaded.project) })
  }

  if (name === 'editing_project_captions') {
    const result = searchEditingProjectCaptions(loaded.project, readOptionalQuery(args.query), readLimit(args.limit))
    return toolText({ ok: true, projectPath: loaded.filePath, projectId: loaded.project.id, ...result })
  }

  if (name === 'editing_project_propose_delete_script') {
    let proposal
    try {
      proposal = buildDeleteScriptProposal(loaded.project, readSegmentIds(args.segmentIds))
    } catch (error) {
      if (error instanceof EditingProposalError) throw new Error(`${error.code}：${error.message}`)
      throw error
    }
    const decision = options.proposalSink
      ? await options.proposalSink({ requestId: randomUUID(), projectPath: loaded.filePath, proposal, createdAt: Date.now() })
      : undefined
    return toolText({ ok: true, projectPath: loaded.filePath, projectId: loaded.project.id, proposal, ...(decision ? { decision } : {}) })
  }

  throw invalidParams(`未知工具：${name}`)
}

function negotiateProtocolVersion(value: unknown): string {
  return typeof value === 'string' && MCP_PROTOCOL_VERSIONS.includes(value as typeof MCP_PROTOCOL_VERSIONS[number])
    ? value
    : MCP_PROTOCOL_VERSIONS[0]
}

export async function handleEditingMcpRequest(request: unknown, options: EditingMcpServerOptions): Promise<EditingMcpResponse | null> {
  if (!isRecord(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return errorResponse(null, -32600, '无效的 JSON-RPC 请求')
  const message = request as unknown as JsonRpcRequest
  if (!hasRequestId(message)) {
    if (message.method === 'notifications/initialized' || message.method.startsWith('notifications/')) return null
    return null
  }
  const id = message.id ?? null

  if (message.method === 'initialize') {
    const params = isRecord(message.params) ? message.params : {}
    return response(id, {
      protocolVersion: negotiateProtocolVersion(params.protocolVersion),
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: MCP_SERVER_NAME, version: options.version },
      instructions: options.proposalSink
        ? '本 MCP 只读取启动时固定的 .aivproj 工程并生成 Proposal；桌面桥接模式会把 Proposal 发送给已打开的 AIVPlayer，由用户确认后应用，不会直接写文件、删除媒体或执行 shell。'
        : '本 MCP 只读取启动时固定的 .aivproj 工程并生成 Proposal；不会应用 Proposal、写文件、删除媒体或执行 shell。'
    })
  }

  if (message.method === 'ping') return response(id, {})
  if (message.method === 'tools/list') return response(id, { tools: TOOLS })

  if (message.method === 'tools/call') {
    const params = isRecord(message.params) ? message.params : {}
    if (typeof params.name !== 'string') return errorResponse(id, -32602, 'tools/call 缺少工具名称')
    try {
      return response(id, await callTool(params.name, params.arguments, options))
    } catch (error) {
      return response(id, { isError: true, ...toolText({ ok: false, error: error instanceof Error ? error.message : String(error) }) })
    }
  }

  return errorResponse(id, -32601, `不支持的 MCP 方法：${message.method}`)
}

export async function runEditingMcpServer(options: EditingMcpServerOptions): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of input) {
    if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
      process.stdout.write(`${JSON.stringify(errorResponse(null, -32600, 'MCP 请求超过 1 MiB 限制'))}\n`)
      continue
    }
    let request: unknown
    try {
      request = JSON.parse(line)
    } catch {
      process.stdout.write(`${JSON.stringify(errorResponse(null, -32700, 'MCP 请求不是合法 JSON'))}\n`)
      continue
    }
    const result = await handleEditingMcpRequest(request, options)
    if (result) process.stdout.write(`${JSON.stringify(result)}\n`)
  }
}

export function resolveEditingMcpProjectPath(value: string): string {
  const projectPath = resolve(value)
  if (extname(projectPath).toLowerCase() !== '.aivproj') throw new Error('MCP 只接受 .aivproj 工程文件')
  return projectPath
}

export const editingMcpToolNames = TOOLS.map((tool) => tool.name)
