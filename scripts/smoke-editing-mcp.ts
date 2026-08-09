import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createEditingProject } from '../src/core/editing/project.ts'
import { serializeEditingProject } from '../src/core/editing/project-file.ts'
import type { EditingSource } from '../src/shared/editing-types.ts'

type JsonRpcResponse = { result?: Record<string, unknown>; error?: { code: number; message: string } }

const source: EditingSource = {
  id: 'source-main',
  path: '/videos/mcp-smoke.mp4',
  name: 'mcp-smoke.mp4',
  fingerprint: '/videos/mcp-smoke.mp4:10',
  durationSeconds: 10,
  width: 1920,
  height: 1080
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function main(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-mcp-'))
  const projectPath = join(directory, 'project.aivproj')
  const project = createEditingProject(source, { projectId: 'project-mcp-smoke', clipId: 'clip-main', now: 123 })
  await writeFile(projectPath, serializeEditingProject({
    ...project,
    videoClips: [{ ...project.videoClips[0]!, sourceStartSeconds: 0, sourceEndSeconds: 10 }],
    captions: [{ id: 'caption-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, startSeconds: 1, durationSeconds: 2, text: '烟测脚本', kind: 'source' }],
    scriptSegments: [{ id: 'script-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, text: '烟测脚本' }]
  }), 'utf8')

  const moduleUrl = pathToFileURL(join(process.cwd(), 'src/cli/editing-mcp.ts')).href
  const child = spawn(process.execPath, [
    '--experimental-strip-types',
    '--experimental-loader',
    join(process.cwd(), 'scripts/resolve-ts-loader.mjs'),
    '--input-type=module',
    '--eval',
    `import { runEditingMcpServer } from ${JSON.stringify(moduleUrl)}; await runEditingMcpServer({ projectPath: process.env.AIVPLAYER_MCP_SMOKE_PROJECT ?? '', version: 'smoke' })`
  ], {
    env: { ...process.env, AIVPLAYER_MCP_SMOKE_PROJECT: projectPath },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const output = createInterface({ input: child.stdout, crlfDelay: Infinity })
  const outputIterator = output[Symbol.asyncIterator]()
  const request = async (message: Record<string, unknown>): Promise<JsonRpcResponse> => {
    child.stdin.write(`${JSON.stringify(message)}\n`)
    const next = await outputIterator.next()
    if (next.done) throw new Error('MCP smoke 子进程提前结束')
    return JSON.parse(next.value) as JsonRpcResponse
  }

  try {
    const initialized = await request({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
    assert(initialized.result?.serverInfo && (initialized.result.serverInfo as Record<string, unknown>).name === 'aivplayer-editing', 'MCP initialize 结果不正确')
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
    const listed = await request({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const tools = (listed.result?.tools as Array<{ name: string }> | undefined)?.map((tool) => tool.name) ?? []
    assert(tools.length === 3 && !tools.includes('editing_project_apply'), `MCP 工具集合不符合只读边界：${tools.join(',')}`)
    const inspected = await request({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'editing_project_inspect' } })
    assert(inspected.result?.content, 'MCP inspect 没有返回 content')
    const inspectedPayload = JSON.parse((inspected.result.content as Array<{ text: string }>)[0]?.text ?? '{}') as Record<string, unknown>
    assert(inspectedPayload.projectPath === projectPath, 'MCP inspect 没有固定到启动工程')
    const proposal = await request({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'editing_project_propose_delete_script', arguments: { segmentIds: ['script-1'] } } })
    const proposalPayload = JSON.parse((proposal.result?.content as Array<{ text: string }>)[0]?.text ?? '{}') as Record<string, unknown>
    assert((proposalPayload.proposal as Record<string, unknown> | undefined)?.id, 'MCP Proposal 缺少确定性 ID')
    child.stdin.end()
    const [exitCode] = await once(child, 'close') as [number | null]
    assert(exitCode === 0, `MCP smoke 子进程退出码异常：${String(exitCode)}`)
    console.log(JSON.stringify({ ok: true, tools, projectPath, proposalId: (proposalPayload.proposal as Record<string, unknown>).id }))
  } finally {
    output.close()
    if (!child.killed && child.exitCode === null) child.kill()
    await rm(directory, { recursive: true, force: true })
  }
}

await main()
