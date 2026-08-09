import { _electron as electron } from 'playwright'
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { access, copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { once } from 'node:events'
import { promisify } from 'node:util'
import { createEditingProject } from '../src/core/editing/project.ts'
import { serializeEditingProject } from '../src/core/editing/project-file.ts'
import { getEditingAgentBridgePaths } from '../src/core/editing/editing-agent-bridge.ts'
import type { EditingSource } from '../src/shared/editing-types.ts'

const execFileAsync = promisify(execFile)
const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

type JsonRpcResponse = {
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function waitForPath(path: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await access(path)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error(`等待路径超时：${path}`)
}

function parseToolPayload(response: JsonRpcResponse): Record<string, unknown> {
  const content = response.result?.content as Array<{ type?: string; text?: string }> | undefined
  const text = content?.find((item) => item.type === 'text')?.text
  if (!text) throw new Error(`MCP 没有返回文本内容：${JSON.stringify(response)}`)
  return JSON.parse(text) as Record<string, unknown>
}

function createMcpClient(electronPath: string, homeDirectory: string, projectPath: string, manifestPath: string): {
  child: ChildProcessWithoutNullStreams
  nextResponse: () => Promise<JsonRpcResponse>
  sendRequest: (request: Record<string, unknown>) => Promise<JsonRpcResponse>
} {
  const child = spawn(electronPath, [
    '--no-sandbox',
    '--in-process-gpu',
    `--user-data-dir=${homeDirectory}`,
    join(process.cwd(), 'out/main/index.js'),
    '--cli',
    'mcp',
    'serve',
    projectPath,
    '--desktop',
    '--bridge-manifest',
    manifestPath
  ], {
    env: { ...process.env, HOME: homeDirectory, AIVPLAYER_DISABLE_GPU: '1' },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  const iterator = lines[Symbol.asyncIterator]()
  const nextResponse = async (): Promise<JsonRpcResponse> => {
    while (true) {
      const next = await iterator.next()
      if (next.done) throw new Error(`MCP 子进程提前结束：${child.exitCode ?? 'unknown'}`)
      try {
        return JSON.parse(next.value) as JsonRpcResponse
      } catch {
        // Electron startup diagnostics must never be interpreted as MCP output.
      }
    }
  }
  const sendRequest = async (request: Record<string, unknown>): Promise<JsonRpcResponse> => {
    child.stdin.write(`${JSON.stringify(request)}\n`)
    return nextResponse()
  }
  return { child, nextResponse, sendRequest }
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-agent-bridge-'))
  const homeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-agent-home-'))
  const mediaPath = join(smokeDirectory, basename(sourceMediaPath))
  const projectPath = join(smokeDirectory, 'agent-bridge-smoke.aivproj')
  let app: Awaited<ReturnType<typeof electron.launch>> | null = null
  let client: ReturnType<typeof createMcpClient> | null = null
  try {
    await copyFile(sourceMediaPath, mediaPath)
    const durationSeconds = Number((await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', mediaPath])).stdout.trim())
    if (!Number.isFinite(durationSeconds) || durationSeconds < 6) throw new Error(`测试媒体时长不足：${durationSeconds}`)
    const source: EditingSource = {
      id: 'source-agent-bridge-smoke',
      path: mediaPath,
      name: basename(mediaPath),
      fingerprint: `${mediaPath}:${durationSeconds}`,
      durationSeconds,
      width: 1920,
      height: 1080
    }
    const project = createEditingProject(source, { projectId: 'project-agent-bridge-smoke', clipId: 'clip-main', now: 123 })
    await writeFile(projectPath, serializeEditingProject({
      ...project,
      videoClips: [{ ...project.videoClips[0]!, sourceStartSeconds: 0, sourceEndSeconds: durationSeconds }],
      captions: [{ id: 'caption-agent-bridge', sourceId: source.id, sourceStartSeconds: 2, sourceEndSeconds: 4, startSeconds: 2, durationSeconds: 2, text: 'Agent bridge smoke', kind: 'source' }],
      scriptSegments: [{ id: 'segment-agent-bridge', sourceId: source.id, sourceStartSeconds: 2, sourceEndSeconds: 4, text: 'Agent bridge smoke' }]
    }), 'utf8')

    app = await electron.launch({
      args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${homeDirectory}`, 'out/main/index.js', mediaPath],
      env: { ...process.env, HOME: homeDirectory, AIVPLAYER_DISABLE_GPU: '1' }
    })
    const page = await app.firstWindow()
    const consoleErrors: string[] = []
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', (error) => consoleErrors.push(error.message))
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('video.video-surface', { timeout: 15_000 })
    await page.locator('.clip-editor-tool-button').click()
    await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 15_000 })
    await app.evaluate(({ dialog }, selectedPath: string) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
    }, projectPath)
    await page.locator('[data-testid="editing-open-project"]').click()
    await page.locator('[data-testid="editing-script-row-segment-agent-bridge"]').waitFor({ timeout: 15_000 })

    const electronPath = await app.evaluate(() => process.execPath)
    const userDataPath = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
    const manifestPath = getEditingAgentBridgePaths(userDataPath).manifestPath
    await waitForPath(manifestPath)
    client = createMcpClient(electronPath, homeDirectory, projectPath, manifestPath)
    const initialized = await client.sendRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
    assert(initialized.result?.serverInfo, '桌面桥接 MCP initialize 失败')

    const callProposal = (): Promise<JsonRpcResponse> => client!.sendRequest({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: 'editing_project_propose_delete_script', arguments: { segmentIds: ['segment-agent-bridge'] } } })
    const cancelledResponse = callProposal()
    await page.locator('[data-testid="editing-proposal-cancel"]').waitFor({ timeout: 15_000 })
    await page.locator('[data-testid="editing-proposal-cancel"]').click()
    const cancelledPayload = parseToolPayload(await cancelledResponse)
    assert((cancelledPayload.decision as Record<string, unknown> | undefined)?.outcome === 'rejected', `取消决策错误：${JSON.stringify(cancelledPayload)}`)

    const appliedResponse = callProposal()
    await page.locator('[data-testid="editing-proposal-confirm"]').waitFor({ timeout: 15_000 })
    await page.locator('[data-testid="editing-proposal-confirm"]').click()
    const appliedPayload = parseToolPayload(await appliedResponse)
    assert((appliedPayload.decision as Record<string, unknown> | undefined)?.outcome === 'applied', `确认决策错误：${JSON.stringify(appliedPayload)}`)
    await page.locator('[data-testid="editing-script-row-segment-agent-bridge"].is-deleted').waitFor({ timeout: 15_000 })
    const persisted = await page.evaluate(() => {
      const projects = JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { scriptSegments?: Array<{ id: string; deleted?: boolean }> }>
      return Object.values(projects).some((candidate) => candidate.scriptSegments?.some((segment) => segment.id === 'segment-agent-bridge' && segment.deleted === true) === true)
    })
    assert(persisted, '确认后的 Proposal 没有进入本地工程缓存')
    assert(consoleErrors.length === 0, `Renderer console errors: ${consoleErrors.join('\n')}`)
    console.log(JSON.stringify({ ok: true, cancelled: 'rejected', applied: 'applied', persisted, manifestPath }))
    client.child.stdin.end()
    const [exitCode] = await once(client.child, 'close') as [number | null]
    assert(exitCode === 0, `MCP 子进程退出码异常：${String(exitCode)}`)
  } finally {
    if (client) {
      if (!client.child.killed && client.child.exitCode === null) client.child.kill()
    }
    if (app) await app.close()
    await rm(smokeDirectory, { recursive: true, force: true })
    await rm(homeDirectory, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
