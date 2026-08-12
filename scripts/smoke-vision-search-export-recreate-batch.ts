import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const failedTaskIds = ['smoke-failed-export-a', 'smoke-failed-export-b', 'smoke-failed-export-c'] as const

type ExportManifest = {
  schemaVersion: number
  tasks: Array<{
    taskId: string
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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-export-recreate-batch-user-data-'))
  const taskManifestPath = join(userDataDirectory, 'vision-search-exports.json')
  const taskCenterPath = join(userDataDirectory, 'task-center.json')
  let app: ElectronApplication | null = null

  try {
    const now = Date.now()
    await writeFile(taskManifestPath, JSON.stringify({
      schemaVersion: 1,
      tasks: failedTaskIds.map((taskId, index) => ({
        taskId,
        request: { kind: 'image', request: { imagePath: join(userDataDirectory, `missing-image-${index}.png`) }, format: 'json' },
        outputPath: index >= 1 ? join(userDataDirectory, 'smoke-results-shared.json') : join(userDataDirectory, `smoke-results-${index}.json`),
        partsDirectory: join(userDataDirectory, 'vision-search-export-parts', taskId),
        chunkSize: 256,
        resultCount: 0,
        writtenCount: 0,
        completedParts: {},
        status: 'failed',
        createdAt: now,
        updatedAt: now,
        error: '历史索引版本已清理'
      }))
    }, null, 2))
    await writeFile(taskCenterPath, JSON.stringify({
      schemaVersion: 1,
      events: failedTaskIds.map((taskId, index) => ({
        id: `vision-export:${taskId}`,
        kind: 'vision-export',
        status: 'failed',
        title: '视觉搜索导出',
        message: '历史索引版本已清理',
        progress: 0,
        current: `smoke-results-${index}.json`,
        updatedAt: now - index
      }))
    }, null, 2))

    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await page.locator('[data-testid="task-center-recreate-all"]').waitFor({ timeout: 15_000 })
    await page.locator('[data-testid="task-center-recreate-all"]').click()

    await page.waitForFunction((oldTaskIds) => {
      const api = window.aiv
      const oldTaskIdSet = new Set<string>(oldTaskIds as string[])
      return api.getTaskCenterEvents().then((events) => events.filter((event) => event.kind === 'vision-export' && !oldTaskIdSet.has(event.id.replace('vision-export:', ''))).length >= 2)
    }, [...failedTaskIds], { timeout: 30_000 })
    const notice = page.locator('[data-testid="task-center-recreate-notice"]')
    await notice.waitFor({ timeout: 15_000 })
    const noticeText = await notice.textContent()
    if (!noticeText?.includes('1')) throw new Error(`Expected one output path conflict in task center notice: ${noticeText}`)

    const manifest = await waitForFileState<ExportManifest>(taskManifestPath, (value) => {
      const recreatedTasks = value.tasks.filter((task) => !failedTaskIds.includes(task.taskId as typeof failedTaskIds[number]) && task.searchRevision !== undefined)
      return value.tasks.length >= 5 && recreatedTasks.length >= 2 && recreatedTasks.every((task) => task.status === 'failed')
    })
    const recreated = manifest.tasks.filter((task) => !failedTaskIds.includes(task.taskId as typeof failedTaskIds[number]))
    if (recreated.length !== 2) throw new Error(`Batch recreated tasks were not persisted with one conflict skipped: ${JSON.stringify(manifest)}`)
    if (!failedTaskIds.every((taskId) => manifest.tasks.some((task) => task.taskId === taskId))) throw new Error(`Batch recreation removed an original task: ${JSON.stringify(manifest)}`)
    if (new Set(recreated.slice(0, 2).map((task) => task.taskId)).size !== 2) throw new Error(`Batch recreation did not create distinct task IDs: ${JSON.stringify(recreated)}`)
    if (new Set(recreated.slice(0, 2).map((task) => task.partsDirectory)).size !== 2) throw new Error(`Batch recreation reused parts directories: ${JSON.stringify(recreated)}`)
    if (recreated.slice(0, 2).some((task) => task.status !== 'failed' || task.searchRevision === undefined)) throw new Error(`Expected both invalid-image tasks to fail with a revision: ${JSON.stringify(recreated)}`)
    if (session.errors.length > 0) throw new Error(`Renderer errors during batch export recreate smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Search Export Recreate Batch passed: ${JSON.stringify({ originalTaskIds: failedTaskIds, recreatedTaskIds: recreated.slice(0, 2).map((task) => task.taskId), sharedRevision: JSON.stringify(recreated[0]?.searchRevision) === JSON.stringify(recreated[1]?.searchRevision), conflictNotice: noticeText })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
