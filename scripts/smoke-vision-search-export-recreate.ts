import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

type ExportManifest = {
  schemaVersion: number
  tasks: Array<{
    taskId: string
    request: unknown
    outputPath: string
    partsDirectory: string
    searchRevision?: unknown
    status: string
  }>
}

async function waitForFileState<T>(filePath: string, predicate: (value: T) => boolean, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastValue: T | undefined
  while (Date.now() < deadline) {
    try {
      lastValue = JSON.parse(await readFile(filePath, 'utf8')) as T
      if (predicate(lastValue)) return lastValue
    } catch {
      // The main process may be in the middle of an atomic manifest replace.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for manifest: ${JSON.stringify(lastValue)}`)
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

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-export-recreate-user-data-'))
  const failedTaskId = 'smoke-failed-export'
  const outputPath = join(userDataDirectory, 'smoke-results.json')
  const partsDirectory = join(userDataDirectory, 'vision-search-export-parts', failedTaskId)
  const taskManifestPath = join(userDataDirectory, 'vision-search-exports.json')
  const taskCenterPath = join(userDataDirectory, 'task-center.json')
  let app: ElectronApplication | null = null

  try {
    const now = Date.now()
    await writeFile(taskManifestPath, JSON.stringify({
      schemaVersion: 1,
      tasks: [{
        taskId: failedTaskId,
        request: { kind: 'image', request: { imagePath: join(userDataDirectory, 'missing-image.png') }, format: 'json' },
        outputPath,
        partsDirectory,
        chunkSize: 256,
        resultCount: 0,
        writtenCount: 0,
        completedParts: {},
        status: 'failed',
        createdAt: now,
        updatedAt: now,
        error: '历史索引版本已清理'
      }]
    }, null, 2))
    await writeFile(taskCenterPath, JSON.stringify({
      schemaVersion: 1,
      events: [{
        id: `vision-export:${failedTaskId}`,
        kind: 'vision-export',
        status: 'failed',
        title: '视觉搜索导出',
        message: '历史索引版本已清理',
        progress: 0,
        current: 'smoke-results.json',
        updatedAt: now
      }]
    }, null, 2))

    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await page.locator('[data-testid="task-center-recreate"]').waitFor({ timeout: 15_000 })
    await page.locator('[data-testid="task-center-recreate"]').click()

    await page.waitForFunction((oldTaskId) => {
      const api = window.aiv
      return api.getTaskCenterEvents().then((events) => events.some((event) => event.kind === 'vision-export' && event.id !== `vision-export:${oldTaskId}`))
    }, failedTaskId, { timeout: 30_000 })

    const manifest = await waitForFileState<ExportManifest>(taskManifestPath, (value) => value.tasks.length >= 2 && value.tasks.some((task) => task.taskId !== failedTaskId && task.searchRevision !== undefined))
    const recreated = manifest.tasks.find((task) => task.taskId !== failedTaskId)
    if (!recreated) throw new Error(`Recreated export task was not persisted: ${JSON.stringify(manifest)}`)
    if (recreated.outputPath !== outputPath) throw new Error(`Recreated task changed output path: ${JSON.stringify(recreated)}`)
    if (recreated.partsDirectory === partsDirectory) throw new Error('Recreated task reused the old parts directory')
    if (recreated.status !== 'failed') throw new Error(`Expected invalid-image smoke task to finish as failed: ${JSON.stringify(recreated)}`)
    if (session.errors.length > 0) throw new Error(`Renderer errors during export recreate smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Search Export Recreate passed: ${JSON.stringify({ originalTaskId: failedTaskId, recreatedTaskId: recreated.taskId, hasRevision: Boolean(recreated.searchRevision) })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
