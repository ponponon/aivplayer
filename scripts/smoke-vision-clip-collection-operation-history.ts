import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const undoScreenshotPath = process.env.AIVPLAYER_SMOKE_UNDO_SCREENSHOT_PATH
const screenshotPath = process.env.AIVPLAYER_SMOKE_SCREENSHOT_PATH

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
  await page.locator('#root').waitFor({ timeout: 10_000 })
  return { app, page, errors }
}

async function openVisionPanel(page: Page): Promise<string> {
  await page.getByRole('tab', { name: '影视库搜索' }).click()
  await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
  const identity = (await page.locator('.vision-intro h2').textContent())?.trim() ?? ''
  if (!identity) throw new Error('Vision panel identity is missing')
  return identity
}

async function readHistoryEntry(page: Page): Promise<string> {
  const entry = page.locator('.vision-collection-operation-history-entry').first()
  await entry.waitFor({ timeout: 10_000 })
  return (await entry.textContent())?.trim() ?? ''
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-history-'))
  const title = `集合历史时间线 Smoke ${Date.now()}`
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    const pageIdentity = await openVisionPanel(page)
    const original = await page.evaluate((collectionTitle) => window.aiv.saveVisionClipCollection({
      title: collectionTitle,
      tags: ['历史时间线', 'Smoke'],
      selections: [
        {
          sourceId: 'source-operation-history-smoke',
          videoPath: '/tmp/aivplayer-operation-history-smoke-missing.mp4',
          fileName: 'operation-history-smoke-missing.mp4',
          fingerprint: 'operation-history-smoke-fingerprint',
          durationSeconds: 30,
          startSeconds: 1,
          endSeconds: 2,
          evidenceIds: ['operation-history-evidence-1'],
          text: '历史时间线第一段',
          evidenceTypes: ['subtitle']
        },
        {
          sourceId: 'source-operation-history-smoke',
          videoPath: '/tmp/aivplayer-operation-history-smoke-missing.mp4',
          fileName: 'operation-history-smoke-missing.mp4',
          fingerprint: 'operation-history-smoke-fingerprint',
          durationSeconds: 30,
          startSeconds: 5,
          endSeconds: 7,
          evidenceIds: ['operation-history-evidence-2'],
          text: '历史时间线第二段',
          evidenceTypes: ['scene']
        }
      ]
    }), title)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const row = page.locator('.vision-collection').filter({ hasText: title }).first()
    await row.waitFor({ timeout: 10_000 })
    await row.getByRole('button', { name: `收藏集合: ${title}`, exact: true }).click()
    await page.getByRole('status').filter({ hasText: `已将“${title}”标记为收藏` }).waitFor({ timeout: 10_000 })

    const afterFavorite = await page.evaluate((collectionId) => Promise.all([
      window.aiv.listVisionClipCollectionOperationHistory(),
      window.aiv.listVisionClipCollections().then((items) => items.find((item) => item.id === collectionId) ?? null)
    ]), original.id)
    const activeEntry = afterFavorite[0][0]
    if (!activeEntry || activeEntry.type !== 'flags' || activeEntry.status !== 'active' || activeEntry.collectionTitles[0] !== title || activeEntry.collectionIds.length !== 1 || activeEntry.selectionCount !== 2 || !afterFavorite[1]?.isFavorite) {
      throw new Error(`Collection operation history active mismatch: ${JSON.stringify(afterFavorite)}`)
    }
    const activeText = await readHistoryEntry(page)
    if (!activeText.includes('收藏 / 归档') || !activeText.includes(title) || !activeText.includes('已应用') || !activeText.includes('1 个集合') || !activeText.includes('2 个选段')) {
      throw new Error(`Collection operation history active UI mismatch: ${activeText}`)
    }

    const undoButton = page.getByRole('button', { name: '撤销上次集合操作', exact: true })
    await undoButton.click()
    await page.getByRole('status').filter({ hasText: '已撤销上次集合操作' }).waitFor({ timeout: 10_000 })
    const afterUndo = await page.evaluate((collectionId) => Promise.all([
      window.aiv.listVisionClipCollectionOperationHistory(),
      window.aiv.listVisionClipCollections().then((items) => items.find((item) => item.id === collectionId) ?? null)
    ]), original.id)
    const redoableEntry = afterUndo[0][0]
    if (!redoableEntry || redoableEntry.type !== 'flags' || redoableEntry.status !== 'redoable' || afterUndo[1]?.isFavorite) {
      throw new Error(`Collection operation history undo mismatch: ${JSON.stringify(afterUndo)}`)
    }
    const redoableText = await readHistoryEntry(page)
    if (!redoableText.includes('可重做')) throw new Error(`Collection operation history redoable UI mismatch: ${redoableText}`)
    if (undoScreenshotPath) {
      await page.locator('.vision-collection-operation-history-entry').first().scrollIntoViewIfNeeded()
      await page.screenshot({ path: undoScreenshotPath, fullPage: false })
    }

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const redoButton = page.getByRole('button', { name: '重做上次集合操作', exact: true })
    await redoButton.waitFor({ timeout: 10_000 })
    await redoButton.click()
    await page.getByRole('status').filter({ hasText: '已重做上次集合操作' }).waitFor({ timeout: 10_000 })
    const afterRedo = await page.evaluate((collectionId) => Promise.all([
      window.aiv.listVisionClipCollectionOperationHistory(),
      window.aiv.listVisionClipCollections().then((items) => items.find((item) => item.id === collectionId) ?? null)
    ]), original.id)
    const activeAgainEntry = afterRedo[0][0]
    if (!activeAgainEntry || activeAgainEntry.type !== 'flags' || activeAgainEntry.status !== 'active' || !afterRedo[1]?.isFavorite) {
      throw new Error(`Collection operation history redo mismatch: ${JSON.stringify(afterRedo)}`)
    }
    const activeAgainText = await readHistoryEntry(page)
    if (!activeAgainText.includes('已应用')) throw new Error(`Collection operation history applied UI mismatch: ${activeAgainText}`)
    if (screenshotPath) {
      await page.locator('.vision-collection-operation-history-entry').first().scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during collection operation history smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Operation History passed: ${JSON.stringify({ pageIdentity, historyVisible: true, statusTransitionVerified: true, persistedRedoAfterReload: true, consoleErrors: session.errors.length, undoScreenshotPath: undoScreenshotPath ?? null, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
