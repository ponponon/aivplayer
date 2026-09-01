import { selectAppOption } from './smoke-select.ts'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const taskCount = 13

type TaskStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

type TaskEvent = {
  id: string
  kind: 'asr' | 'batch-subtitle' | 'vision-index' | 'vision-export' | 'media-import' | 'evidence' | 'drama' | 'drama-generation'
  status: TaskStatus
  title: string
  message: string
  progress: number | null
  current?: string
  updatedAt: number
}

function createTaskEvents(now: number): TaskEvent[] {
  return Array.from({ length: taskCount }, (_, index) => ({
    id: `smoke-task-${String(index).padStart(2, '0')}`,
    kind: index % 2 === 0 ? 'asr' : 'vision-index',
    status: index % 3 === 0 ? 'failed' : index % 3 === 1 ? 'cancelled' : 'completed',
    title: index === 10 ? '字幕 QA 历史任务' : `历史任务 ${String(index).padStart(2, '0')}`,
    message: index === 10 ? 'episode-qa-01 处理失败' : `历史任务消息 ${index}`,
    progress: index % 3 === 2 ? 1 : 0.5,
    current: index === 10 ? 'episode-qa-01.mp4' : `history-${index}.mp4`,
    updatedAt: now - index * 1_000
  }))
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

async function waitForTaskRows(page: Page, count: number): Promise<void> {
  await page.waitForFunction((expected) => document.querySelectorAll('.task-center-item').length === expected, count, { timeout: 15_000 })
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-task-center-history-pagination-'))
  const taskCenterPath = join(userDataDirectory, 'task-center.json')
  let app: ElectronApplication | null = null

  try {
    await writeFile(taskCenterPath, JSON.stringify({ schemaVersion: 1, events: createTaskEvents(Date.now()) }, null, 2), { encoding: 'utf8', mode: 0o600 })
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    const taskCenter = page.locator('aside.task-center')
    await taskCenter.waitFor({ timeout: 15_000 })
    await waitForTaskRows(page, 8)

    const firstPage = await taskCenter.locator('.task-center-item strong').allTextContents()
    const firstPageLabel = await taskCenter.locator('.task-center-pagination span').textContent()
    if (firstPage.length !== 8 || firstPageLabel !== '第 1 / 2 页') {
      throw new Error(`Task center first page mismatch: ${JSON.stringify({ count: firstPage.length, firstPageLabel })}`)
    }

    await taskCenter.getByRole('button', { name: '下一页' }).click()
    await waitForTaskRows(page, 5)
    const secondPage = await taskCenter.locator('.task-center-item strong').allTextContents()
    const secondPageLabel = await taskCenter.locator('.task-center-pagination span').textContent()
    if (secondPage.length !== 5 || secondPageLabel !== '第 2 / 2 页') {
      throw new Error(`Task center second page mismatch: ${JSON.stringify({ count: secondPage.length, secondPageLabel })}`)
    }

    await taskCenter.locator('input[type="search"]').fill('episode-qa-01')
    await waitForTaskRows(page, 1)
    const searchRows = await taskCenter.locator('.task-center-item strong').allTextContents()
    if (searchRows.length !== 1 || searchRows[0] !== '字幕 QA 历史任务') throw new Error(`Task center search mismatch: ${JSON.stringify(searchRows)}`)

    await taskCenter.locator('input[type="search"]').fill('')
    await selectAppOption(page, taskCenter.locator('.app-select[aria-label="筛选状态"]'), 'failed')
    await waitForTaskRows(page, 5)
    const failedRows = await taskCenter.locator('.task-center-item.is-failed').count()
    if (failedRows !== 5) throw new Error(`Task center status filter mismatch: ${failedRows}`)

    await selectAppOption(page, taskCenter.locator('.app-select[aria-label="筛选状态"]'), 'running')
    await waitForTaskRows(page, 0)
    const liveEvent: TaskEvent = {
      id: 'smoke-live-task',
      kind: 'media-import',
      status: 'running',
      title: '实时导入任务',
      message: '目录 watcher 已发现新视频',
      progress: 0.25,
      current: 'live-import.mp4',
      updatedAt: Date.now()
    }
    await app.evaluate(({ BrowserWindow }, event: TaskEvent) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('task-center:event', event)
    }, liveEvent)
    await taskCenter.locator('.task-center-item').filter({ hasText: '实时导入任务' }).waitFor({ timeout: 15_000 })
    const liveRows = await taskCenter.locator('.task-center-item').allTextContents()
    if (liveRows.length !== 1 || !liveRows[0]?.includes('实时导入任务')) throw new Error(`Live task event was lost under filter: ${JSON.stringify(liveRows)}`)

    if (session.errors.length > 0) throw new Error(`Renderer errors during task center history smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Task Center History Pagination passed: ${JSON.stringify({ firstPage: firstPage.length, secondPage: secondPage.length, searchMatches: searchRows.length, failedMatches: failedRows, liveEventRetained: true })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
