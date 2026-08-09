import { _electron as electron } from 'playwright'
import { execFile } from 'node:child_process'
import { access, copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { buildDeleteScriptProposal } from '../src/core/editing/edit-proposal.ts'
import { createEditingProject } from '../src/core/editing/project.ts'
import { serializeEditingProject } from '../src/core/editing/project-file.ts'
import { getEditingAgentBridgePaths, submitEditingAgentProposal } from '../src/core/editing/editing-agent-bridge.ts'
import type { EditingProject, EditingSource } from '../src/shared/editing-types.ts'

const execFileAsync = promisify(execFile)
const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

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

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-agent-bridge-'))
  const homeDirectory = await mkdtemp('/tmp/aivplayer-smoke-agent-home-')
  const mediaPath = join(smokeDirectory, basename(sourceMediaPath))
  const projectPath = join(smokeDirectory, 'agent-bridge-smoke.aivproj')
  let app: Awaited<ReturnType<typeof electron.launch>> | null = null
  const mainConsoleErrors: string[] = []
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
    const captionSourceRevision = `sources=${source.id}:${source.path}:source=none:translation=none`
    const smokeProject: EditingProject = {
      ...project,
      captionSourceRevision,
      captionSourceRevisions: { [source.id]: { source: null, translation: null } },
      videoClips: [{ ...project.videoClips[0]!, sourceStartSeconds: 0, sourceEndSeconds: durationSeconds }],
      captions: [{ id: 'caption-agent-bridge', sourceId: source.id, sourceStartSeconds: 2, sourceEndSeconds: 4, startSeconds: 2, durationSeconds: 2, text: 'Agent bridge smoke', kind: 'source' }],
      scriptSegments: [{ id: 'segment-agent-bridge', sourceId: source.id, sourceStartSeconds: 2, sourceEndSeconds: 4, text: 'Agent bridge smoke' }]
    }
    await writeFile(projectPath, serializeEditingProject(smokeProject), 'utf8')

    app = await electron.launch({
      args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${homeDirectory}`, 'out/main/index.js', mediaPath],
      env: { ...process.env, HOME: homeDirectory, AIVPLAYER_DISABLE_GPU: '1' }
    })
    app.on('console', (message) => {
      const text = message.text()
      if (text.includes('[editing-agent-bridge]')) mainConsoleErrors.push(text)
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

    const userDataPath = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
    const manifestPath = getEditingAgentBridgePaths(userDataPath).manifestPath
    try {
      await waitForPath(manifestPath)
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}；主进程日志：${mainConsoleErrors.join(' | ') || '无'}`)
    }
    const proposal = buildDeleteScriptProposal(smokeProject, ['segment-agent-bridge'])
    const cancelledResponse = submitEditingAgentProposal(manifestPath, { requestId: 'smoke-agent-bridge-cancel', projectPath, proposal, createdAt: Date.now() })
    await page.locator('[data-testid="editing-proposal-cancel"]').waitFor({ timeout: 15_000 })
    await page.locator('[data-testid="editing-proposal-cancel"]').click()
    const cancelledDecision = await cancelledResponse
    assert(cancelledDecision.outcome === 'rejected', `取消决策错误：${JSON.stringify(cancelledDecision)}`)

    const appliedResponse = submitEditingAgentProposal(manifestPath, { requestId: 'smoke-agent-bridge-confirm', projectPath, proposal, createdAt: Date.now() })
    await page.locator('[data-testid="editing-proposal-confirm"]').waitFor({ timeout: 15_000 })
    await page.locator('[data-testid="editing-proposal-confirm"]').click()
    const appliedDecision = await appliedResponse
    assert(appliedDecision.outcome === 'applied', `确认决策错误：${JSON.stringify(appliedDecision)}`)
    await page.locator('[data-testid="editing-script-row-segment-agent-bridge"].is-deleted').waitFor({ timeout: 15_000 })
    const persisted = await page.evaluate(() => {
      const projects = JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { scriptSegments?: Array<{ id: string; deleted?: boolean }> }>
      return Object.values(projects).some((candidate) => candidate.scriptSegments?.some((segment) => segment.id === 'segment-agent-bridge' && segment.deleted === true) === true)
    })
    assert(persisted, '确认后的 Proposal 没有进入本地工程缓存')
    assert(consoleErrors.length === 0, `Renderer console errors: ${consoleErrors.join('\n')}`)
    console.log(JSON.stringify({ ok: true, bridge: 'connected', cancelled: cancelledDecision.outcome, applied: appliedDecision.outcome, persisted, manifestPath }))
  } finally {
    if (app) await app.close()
    await rm(smokeDirectory, { recursive: true, force: true })
    await rm(homeDirectory, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
