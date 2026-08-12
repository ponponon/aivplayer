import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

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

async function openVisionInbox(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '影视库搜索' }).click()
  await page.locator('.vision-import-inbox').waitFor({ timeout: 15_000 })
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-media-import-inbox-pipeline-user-data-'))
  const inboxDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-media-import-inbox-pipeline-files-'))
  const badMediaPath = join(inboxDirectory, 'bad-inbox.mp4')
  const taskCenterPath = join(userDataDirectory, 'task-center.json')
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null

  try {
    await writeFile(badMediaPath, 'this is not a valid video container\n', { encoding: 'utf8' })
    await writeFile(join(userDataDirectory, 'app-settings.json'), JSON.stringify({
      schemaVersion: 27,
      ui: { locale: 'zh-CN' },
      media: { importInboxDirectories: [inboxDirectory], importInboxWriteSidecars: false }
    }, null, 2), { encoding: 'utf8', mode: 0o600 })

    const firstSession = await launchPlayer(userDataDirectory)
    firstApp = firstSession.app
    const page = firstSession.page
    await openVisionInbox(page)
    const inbox = page.locator('.vision-import-inbox')
    const badItem = inbox.locator('.vision-inbox-item').filter({ hasText: 'bad-inbox.mp4' })
    await badItem.waitFor({ timeout: 30_000 })
    await unlink(badMediaPath)
    await badItem.locator('.vision-primary-action').click()
    await page.waitForFunction(() => window.aiv.listMediaImportInbox().then((items) => items.some((item) => item.fileName === 'bad-inbox.mp4' && item.status === 'failed')), undefined, { timeout: 30_000 })
    const failedItem = await page.evaluate(() => window.aiv.listMediaImportInbox().then((items) => items.find((item) => item.fileName === 'bad-inbox.mp4')))
    if (!failedItem || failedItem.status !== 'failed' || failedItem.pipeline.metadata !== 'failed' || !failedItem.lastError) {
      throw new Error(`Inbox processor did not persist metadata failure: ${JSON.stringify(failedItem)}`)
    }
    const taskCenter = page.locator('aside.task-center')
    const taskRow = taskCenter.locator('.task-center-item.is-failed').filter({ hasText: 'bad-inbox.mp4' })
    await taskRow.waitFor({ timeout: 15_000 })
    const firstHistory = await page.evaluate(() => window.aiv.getTaskCenterEvents())
    if (firstHistory.length !== 1 || firstHistory[0]?.kind !== 'media-import' || firstHistory[0]?.status !== 'failed' || firstHistory[0]?.current !== 'bad-inbox.mp4') {
      throw new Error(`Inbox failure did not reach task center: ${JSON.stringify(firstHistory)}`)
    }
    if (firstSession.errors.length > 0) throw new Error(`Renderer errors during media import inbox pipeline smoke:\n${firstSession.errors.join('\n')}`)

    await firstApp.close()
    firstApp = null
    const secondSession = await launchPlayer(userDataDirectory)
    secondApp = secondSession.app
    await openVisionInbox(secondSession.page)
    await secondSession.page.locator('.vision-inbox-item').filter({ hasText: 'bad-inbox.mp4' }).waitFor({ timeout: 15_000 })
    const restoredItem = await secondSession.page.evaluate(() => window.aiv.listMediaImportInbox().then((items) => items.find((item) => item.fileName === 'bad-inbox.mp4')))
    if (!restoredItem || (restoredItem.status !== 'failed' && restoredItem.status !== 'missing') || restoredItem.pipeline.metadata !== 'failed' || !restoredItem.lastError) throw new Error(`Failed inbox record was not restored after restart: ${JSON.stringify(restoredItem)}`)
    const restoredHistory = await secondSession.page.evaluate(() => window.aiv.getTaskCenterEvents())
    if (restoredHistory.length !== 1 || restoredHistory[0]?.kind !== 'media-import' || restoredHistory[0]?.status !== 'failed') throw new Error(`Task center failure history was not restored: ${JSON.stringify(restoredHistory)}`)
    const persistedManifest = JSON.parse(await readFile(join(userDataDirectory, 'media-import-inbox.json'), 'utf8')) as { items: Array<{ fileName: string; status: string; pipeline?: { metadata?: string }; lastError?: string }> }
    if (persistedManifest.items.length !== 1 || !['failed', 'missing'].includes(persistedManifest.items[0]?.status ?? '') || persistedManifest.items[0]?.pipeline?.metadata !== 'failed' || !persistedManifest.items[0]?.lastError) throw new Error(`Inbox manifest persistence mismatch: ${JSON.stringify(persistedManifest)}`)
    const persistedTaskCenter = JSON.parse(await readFile(taskCenterPath, 'utf8')) as { events: Array<{ kind: string; status: string }> }
    if (persistedTaskCenter.events.length !== 1 || persistedTaskCenter.events[0]?.kind !== 'media-import') throw new Error(`Task center manifest persistence mismatch: ${JSON.stringify(persistedTaskCenter)}`)
    if (secondSession.errors.length > 0) throw new Error(`Renderer errors after media import inbox restart:\n${secondSession.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Media Import Inbox Pipeline passed: ${JSON.stringify({ scanned: 'bad-inbox.mp4', finalStatus: 'failed', metadataStage: 'failed', taskCenterFailure: true, restartRestored: true })}`)
  } finally {
    if (secondApp) await secondApp.close().catch(() => undefined)
    if (firstApp) await firstApp.close().catch(() => undefined)
    await rm(inboxDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
