import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const recoveredTaskIds = ['smoke-queued-export', 'smoke-running-export'] as const
const retryTaskId = 'smoke-retry-export'

type ExportTask = {
  taskId: string
  outputPath: string
  partsDirectory: string
  status: string
  updatedAt: number
}

type ExportManifest = {
  schemaVersion: number
  tasks: ExportTask[]
}

async function waitForManifest(filePath: string, predicate: (manifest: ExportManifest) => boolean, timeoutMs = 30_000): Promise<ExportManifest> {
  const deadline = Date.now() + timeoutMs
  let lastManifest: ExportManifest | undefined
  while (Date.now() < deadline) {
    try {
      lastManifest = JSON.parse(await readFile(filePath, 'utf8')) as ExportManifest
      if (predicate(lastManifest)) return lastManifest
    } catch {
      // The main process may be between two atomic manifest replacements.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for export manifest: ${JSON.stringify(lastManifest)}`)
}

async function launchPlayer(userDataDirectory: string): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
    env: { ...process.env, HOME: userDataDirectory }
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  await page.waitForLoadState('domcontentloaded')
  await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
  return { app, page, errors }
}

function taskFixture(userDataDirectory: string, taskId: string, status: 'queued' | 'running' | 'failed', outputName: string, now: number): ExportTask & Record<string, unknown> {
  return {
    taskId,
    request: { kind: 'image', request: { imagePath: join(userDataDirectory, `${taskId}-missing.png`) }, format: 'json' },
    outputPath: join(userDataDirectory, outputName),
    partsDirectory: join(userDataDirectory, 'vision-search-export-parts', taskId),
    chunkSize: 2,
    resultCount: 0,
    writtenCount: 0,
    completedParts: {},
    status,
    createdAt: now,
    updatedAt: now
  }
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-export-recovery-user-data-'))
  const taskManifestPath = join(userDataDirectory, 'vision-search-exports.json')
  const taskCenterPath = join(userDataDirectory, 'task-center.json')
  const retryPartsDirectory = join(userDataDirectory, 'vision-search-export-parts', retryTaskId)
  const retryMarkerPath = join(retryPartsDirectory, '000000.part')
  const initialUpdatedAt = Date.now() - 5_000
  let app: ElectronApplication | null = null

  try {
    await mkdir(retryPartsDirectory, { recursive: true })
    await writeFile(retryMarkerPath, 'verified checkpoint marker')
    const tasks = [
      taskFixture(userDataDirectory, recoveredTaskIds[0], 'queued', 'smoke-queued-results.json', initialUpdatedAt),
      taskFixture(userDataDirectory, recoveredTaskIds[1], 'running', 'smoke-running-results.json', initialUpdatedAt),
      taskFixture(userDataDirectory, retryTaskId, 'failed', 'smoke-retry-results.json', initialUpdatedAt)
    ]
    await writeFile(taskManifestPath, JSON.stringify({ schemaVersion: 1, tasks }, null, 2))
    await writeFile(taskCenterPath, JSON.stringify({
      schemaVersion: 1,
      events: [{
        id: `vision-export:${retryTaskId}`,
        kind: 'vision-export',
        status: 'failed',
        title: '视觉搜索导出',
        message: '预置失败任务',
        progress: 0,
        current: 'smoke-retry-results.json',
        updatedAt: initialUpdatedAt
      }]
    }, null, 2))

    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    const recoveredManifest = await waitForManifest(taskManifestPath, (manifest) => recoveredTaskIds.every((taskId) => manifest.tasks.find((task) => task.taskId === taskId)?.status === 'failed'))
    for (const taskId of recoveredTaskIds) {
      const task = recoveredManifest.tasks.find((item) => item.taskId === taskId)
      if (!task || task.updatedAt <= initialUpdatedAt) throw new Error(`Startup recovery did not update task ${taskId}: ${JSON.stringify(recoveredManifest)}`)
    }

    const retryRow = page.locator('li.task-center-item').filter({ hasText: basename(join(userDataDirectory, 'smoke-retry-results.json')) })
    await retryRow.locator('[data-testid="task-center-retry"]').waitFor({ timeout: 15_000 })
    await retryRow.locator('[data-testid="task-center-retry"]').click()
    const retriedManifest = await waitForManifest(taskManifestPath, (manifest) => {
      const task = manifest.tasks.find((item) => item.taskId === retryTaskId)
      return task?.status === 'failed' && task.updatedAt > initialUpdatedAt
    })
    const retriedTask = retriedManifest.tasks.find((task) => task.taskId === retryTaskId)
    if (!retriedTask || retriedTask.taskId !== retryTaskId) throw new Error(`Retry replaced the original task record: ${JSON.stringify(retriedManifest)}`)
    if ((await readFile(retryMarkerPath, 'utf8')) !== 'verified checkpoint marker') throw new Error('Retry removed the verified checkpoint directory contents')
    if (session.errors.length > 0) throw new Error(`Renderer errors during export recovery smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Search Export Recovery passed: ${JSON.stringify({ recoveredTaskIds, retriedTaskId: retryTaskId, checkpointPreserved: true })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
