import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const missingImportPath = '/tmp/aivplayer-smoke-missing-import.mp4'
const initialTaskId = 'smoke-old-terminal-task'
const liveTaskId = 'smoke-live-active-task'

function itemId(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 32)
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

async function seed(userDataDirectory: string): Promise<void> {
  const now = Date.now() - 5_000
  await writeFile(join(userDataDirectory, 'task-center.json'), JSON.stringify({
    schemaVersion: 1,
    events: [{
      id: initialTaskId,
      kind: 'vision-index',
      status: 'completed',
      title: '旧终态任务',
      message: '应该被清除',
      progress: 1,
      current: 'old-history.mp4',
      updatedAt: now
    }]
  }, null, 2), { encoding: 'utf8', mode: 0o600 })

  const inboxItem = {
    path: missingImportPath,
    fileName: 'missing-import.mp4',
    directoryPath: '/tmp',
    sizeBytes: 1,
    mtimeMs: now,
    id: itemId(missingImportPath),
    status: 'discovered',
    discoveredAt: now,
    updatedAt: now,
    metadata: { tags: [], favorite: false, note: '', source: null, projectId: null },
    pipeline: { metadata: 'pending', subtitle: 'pending', vision: 'pending' }
  }
  await writeFile(join(userDataDirectory, 'media-import-inbox.json'), JSON.stringify({ schemaVersion: 1, items: [inboxItem] }, null, 2), { encoding: 'utf8', mode: 0o600 })
}

async function sendActiveTask(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }, task: Record<string, unknown>) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('task-center:event', task)
  }, {
    id: liveTaskId,
    kind: 'media-import',
    status: 'running',
    title: '活动导入任务',
    message: '仍在运行，不应被清理',
    progress: 0.25,
    current: 'active-import.mp4',
    updatedAt: Date.now()
  })
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-task-center-clear-finished-'))
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null

  try {
    await seed(userDataDirectory)
    const firstSession = await launchPlayer(userDataDirectory)
    firstApp = firstSession.app
    const page = firstSession.page
    const taskCenter = page.locator('aside.task-center')
    await taskCenter.waitFor({ timeout: 15_000 })
    await taskCenter.locator('.task-center-item').filter({ hasText: '旧终态任务' }).waitFor({ timeout: 15_000 })
    await sendActiveTask(firstApp)
    await taskCenter.locator('.task-center-item').filter({ hasText: '活动导入任务' }).waitFor({ timeout: 15_000 })

    const beforeClear = await page.evaluate(() => window.aiv.getTaskCenterEvents())
    if (beforeClear.length !== 1 || beforeClear[0]?.id !== initialTaskId) throw new Error(`Unexpected persisted task history before clear: ${JSON.stringify(beforeClear)}`)
    await taskCenter.getByRole('button', { name: '清除已结束' }).click()
    await taskCenter.locator('.task-center-item').filter({ hasText: '旧终态任务' }).waitFor({ state: 'detached', timeout: 15_000 })
    await taskCenter.locator('.task-center-item').filter({ hasText: '活动导入任务' }).waitFor({ timeout: 15_000 })
    const afterClear = await page.evaluate(() => window.aiv.getTaskCenterEvents())
    if (afterClear.length !== 0) throw new Error(`Cleared terminal history remained persisted: ${JSON.stringify(afterClear)}`)

    const inboxItem = await page.evaluate(() => window.aiv.listMediaImportInbox().then((items) => items[0]))
    if (!inboxItem || inboxItem.status !== 'discovered') throw new Error(`Missing inbox fixture was not ready: ${JSON.stringify(inboxItem)}`)
    await page.evaluate((id) => window.aiv.transitionMediaImportInbox({ itemId: id, status: 'queued' }), inboxItem.id)
    const failedRow = taskCenter.locator('.task-center-item.is-failed').filter({ hasText: 'missing-import.mp4' })
    await failedRow.waitFor({ timeout: 20_000 })
    const afterNewTerminal = await page.evaluate(() => window.aiv.getTaskCenterEvents())
    if (afterNewTerminal.length !== 1 || afterNewTerminal[0]?.kind !== 'media-import' || afterNewTerminal[0]?.status !== 'failed') {
      throw new Error(`New terminal event was lost after clear: ${JSON.stringify(afterNewTerminal)}`)
    }
    if (await taskCenter.locator('.task-center-item').filter({ hasText: '活动导入任务' }).count() !== 1) throw new Error('Active task was removed by clear-finished')
    if (firstSession.errors.length > 0) throw new Error(`Renderer errors during task center clear smoke:\n${firstSession.errors.join('\n')}`)

    await firstApp.close()
    firstApp = null
    const secondSession = await launchPlayer(userDataDirectory)
    secondApp = secondSession.app
    const secondTaskCenter = secondSession.page.locator('aside.task-center')
    await secondTaskCenter.waitFor({ timeout: 15_000 })
    await secondTaskCenter.locator('.task-center-item').filter({ hasText: 'missing-import.mp4' }).waitFor({ timeout: 15_000 })
    if (await secondTaskCenter.locator('.task-center-item').filter({ hasText: '旧终态任务' }).count() !== 0) throw new Error('Old cleared task returned after restart')
    if (await secondTaskCenter.locator('.task-center-item').filter({ hasText: '活动导入任务' }).count() !== 0) throw new Error('Transient active task was persisted as history')
    if (await secondTaskCenter.locator('.task-center-item').count() !== 1) throw new Error(`Unexpected task history after restart: ${await secondTaskCenter.locator('.task-center-item').allTextContents()}`)
    if (secondSession.errors.length > 0) throw new Error(`Renderer errors after task center clear restart:\n${secondSession.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Task Center Clear Finished passed: ${JSON.stringify({ oldTerminalCleared: true, activePreserved: true, newTerminalPersisted: true, restartHistory: ['media-import:failed'] })}`)
  } finally {
    if (secondApp) await secondApp.close().catch(() => undefined)
    if (firstApp) await firstApp.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
