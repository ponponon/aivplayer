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

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-content-'))
  const title = `单集合内容编辑 Smoke ${Date.now()}`
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    const pageIdentity = await openVisionPanel(page)
    const original = await page.evaluate((collectionTitle) => window.aiv.saveVisionClipCollection({
      title: collectionTitle,
      tags: ['内容编辑', 'Smoke'],
      isFavorite: true,
      isArchived: true,
      sortMode: 'duration-desc',
      selections: [
        {
          sourceId: 'source-content-undo-smoke',
          videoPath: '/tmp/aivplayer-content-undo-smoke-missing.mp4',
          fileName: 'content-undo-smoke-missing.mp4',
          fingerprint: 'content-undo-smoke-fingerprint',
          durationSeconds: 30,
          startSeconds: 1,
          endSeconds: 2,
          evidenceIds: ['content-undo-evidence-1'],
          text: '内容编辑前一',
          evidenceTypes: ['subtitle']
        },
        {
          sourceId: 'source-content-undo-smoke',
          videoPath: '/tmp/aivplayer-content-undo-smoke-missing.mp4',
          fileName: 'content-undo-smoke-missing.mp4',
          fingerprint: 'content-undo-smoke-fingerprint',
          durationSeconds: 30,
          startSeconds: 2.2,
          endSeconds: 3,
          evidenceIds: ['content-undo-evidence-2'],
          text: '内容编辑前二',
          evidenceTypes: ['subtitle']
        }
      ]
    }), title)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const row = page.locator('.vision-collection').filter({ hasText: title }).first()
    await row.waitFor({ timeout: 10_000 })
    const initial = await page.evaluate((collectionId) => window.aiv.listVisionClipCollections().then((items) => items.find((item) => item.id === collectionId) ?? null), original.id)
    if (!initial || initial.selections.length !== 2 || initial.tags.join(',') !== '内容编辑,Smoke' || !initial.isFavorite || !initial.isArchived) {
      throw new Error(`Single collection content initial mismatch: ${JSON.stringify(initial)}`)
    }

    await row.getByRole('button', { name: '合并相邻选段', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已更新“' }).waitFor({ timeout: 10_000 })
    const afterMerge = await page.evaluate((collectionId) => Promise.all([
      window.aiv.listVisionClipCollections().then((items) => items.find((item) => item.id === collectionId) ?? null),
      window.aiv.getVisionClipCollectionOperationHistory()
    ]), original.id)
    if (!afterMerge[0] || afterMerge[0].selections.length !== 1 || afterMerge[0].selections[0]?.startSeconds !== 1 || afterMerge[0].selections[0]?.endSeconds !== 3 || afterMerge[1]?.type !== 'content') {
      throw new Error(`Single collection merge content mismatch: ${JSON.stringify(afterMerge)}`)
    }

    const undoButton = page.getByRole('button', { name: '撤销上次集合操作', exact: true })
    await undoButton.waitFor({ timeout: 10_000 })
    await undoButton.click()
    await page.getByRole('status').filter({ hasText: '已撤销上次集合操作' }).waitFor({ timeout: 10_000 })
    const afterUndo = await page.evaluate((collectionId) => window.aiv.listVisionClipCollections().then((items) => items.find((item) => item.id === collectionId) ?? null), original.id)
    if (!afterUndo || JSON.stringify(afterUndo) !== JSON.stringify(initial)) throw new Error(`Single collection content undo mismatch: ${JSON.stringify(afterUndo)}`)
    if (undoScreenshotPath) {
      await page.locator('.vision-collection-operation-redo').scrollIntoViewIfNeeded()
      await page.screenshot({ path: undoScreenshotPath, fullPage: false })
    }

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const redoButton = page.getByRole('button', { name: '重做上次集合操作', exact: true })
    await redoButton.waitFor({ timeout: 10_000 })
    await redoButton.click()
    await page.getByRole('status').filter({ hasText: '已重做上次集合操作' }).waitFor({ timeout: 10_000 })
    const afterRedo = await page.evaluate((collectionId) => window.aiv.listVisionClipCollections().then((items) => items.find((item) => item.id === collectionId) ?? null), original.id)
    if (!afterRedo || afterRedo.selections.length !== 1 || afterRedo.selections[0]?.startSeconds !== 1 || afterRedo.selections[0]?.endSeconds !== 3) throw new Error(`Single collection content redo mismatch: ${JSON.stringify(afterRedo)}`)

    const mergedRow = page.locator('.vision-collection').filter({ hasText: title }).first()
    await mergedRow.getByRole('button', { name: '反选时间范围', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已更新“' }).waitFor({ timeout: 10_000 })
    const afterInvert = await page.evaluate((collectionId) => Promise.all([
      window.aiv.listVisionClipCollections().then((items) => items.find((item) => item.id === collectionId) ?? null),
      window.aiv.getVisionClipCollectionOperationHistory()
    ]), original.id)
    if (!afterInvert[0] || afterInvert[0].selections.length !== 2 || afterInvert[0].selections.some((selection) => selection.evidenceIds.length !== 0 || selection.text !== undefined) || afterInvert[1]?.type !== 'content') {
      throw new Error(`Single collection invert content mismatch: ${JSON.stringify(afterInvert)}`)
    }

    const invertUndoButton = page.getByRole('button', { name: '撤销上次集合操作', exact: true })
    await invertUndoButton.click()
    await page.getByRole('status').filter({ hasText: '已撤销上次集合操作' }).waitFor({ timeout: 10_000 })
    const afterInvertUndo = await page.evaluate((collectionId) => window.aiv.listVisionClipCollections().then((items) => items.find((item) => item.id === collectionId) ?? null), original.id)
    if (!afterInvertUndo || JSON.stringify(afterInvertUndo) !== JSON.stringify(afterRedo)) throw new Error(`Single collection invert undo mismatch: ${JSON.stringify(afterInvertUndo)}`)

    if (screenshotPath) {
      await page.locator('.vision-collection-operation-redo').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during single collection content smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Content Undo passed: ${JSON.stringify({ pageIdentity, originalSelectionCount: initial.selections.length, mergedSelectionCount: afterMerge[0]?.selections.length ?? 0, invertedSelectionCount: afterInvert[0]?.selections.length ?? 0, contentUndoRedoVerified: true, persistedRedoAfterReload: true, invertUndoVerified: true, consoleErrors: session.errors.length, undoScreenshotPath: undoScreenshotPath ?? null, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
