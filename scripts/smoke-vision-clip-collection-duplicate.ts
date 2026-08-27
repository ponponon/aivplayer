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

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-duplicate-'))
  const collectionTitle = `复制集合 Smoke ${Date.now()}`
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await page.getByRole('tab', { name: '影视库搜索' }).click()
    await page.locator('.vision-panel').waitFor({ timeout: 10_000 })

    const original = await page.evaluate((title) => window.aiv.saveVisionClipCollection({
      title,
      tags: ['smoke', 'copy'],
      sortMode: 'duration-desc',
      selections: [{
        sourceId: 'source-duplicate-smoke',
        videoPath: '/tmp/aivplayer-duplicate-smoke-missing.mp4',
        fileName: 'duplicate-smoke-missing.mp4',
        fingerprint: 'duplicate-smoke-fingerprint',
        durationSeconds: 20,
        startSeconds: 2,
        endSeconds: 8,
        evidenceIds: ['duplicate-evidence-1'],
        text: '复制验证选段',
        evidenceTypes: ['subtitle']
      }]
    }), collectionTitle)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: '影视库搜索' }).click()
    await page.locator('.vision-panel').waitFor({ timeout: 10_000 })

    const originalRow = page.locator('.vision-collection').filter({ hasText: collectionTitle }).first()
    await originalRow.waitFor({ timeout: 10_000 })
    await originalRow.getByRole('button', { name: '复制集合', exact: true }).click()

    const duplicateTitle = `${collectionTitle} · 副本`
    await page.locator('.vision-collection').filter({ hasText: ' · 副本' }).first().waitFor({ timeout: 10_000 })
    const collectionsAfterCopy = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const duplicate = collectionsAfterCopy.find((collection) => collection.title === duplicateTitle)
    const persistedOriginal = collectionsAfterCopy.find((collection) => collection.id === original.id)
    if (!duplicate || !persistedOriginal || duplicate.id === original.id || persistedOriginal.title !== collectionTitle || duplicate.selections[0]?.evidenceIds[0] !== 'duplicate-evidence-1') {
      throw new Error(`Clip collection duplicate persistence mismatch: ${JSON.stringify(collectionsAfterCopy)}`)
    }
    const duplicateSnapshot = { ...duplicate, selections: duplicate.selections.map((selection) => ({ ...selection, evidenceIds: [...selection.evidenceIds], evidenceTypes: [...selection.evidenceTypes] })) }

    const undoButton = page.getByRole('button', { name: '撤销上次集合操作', exact: true })
    await undoButton.waitFor({ timeout: 10_000 })
    await undoButton.click()
    await page.getByRole('status').filter({ hasText: '已撤销上次集合操作' }).waitFor({ timeout: 10_000 })
    const collectionsAfterUndo = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (collectionsAfterUndo.length !== 1 || !collectionsAfterUndo.some((collection) => collection.id === original.id && collection.title === collectionTitle) || collectionsAfterUndo.some((collection) => collection.id === duplicateSnapshot.id)) {
      throw new Error(`Clip collection duplicate undo mismatch: ${JSON.stringify(collectionsAfterUndo)}`)
    }
    if (undoScreenshotPath) {
      await page.locator('.vision-collection-operation-redo').scrollIntoViewIfNeeded()
      await page.screenshot({ path: undoScreenshotPath, fullPage: false })
    }

    const redoButton = page.getByRole('button', { name: '重做上次集合操作', exact: true })
    await redoButton.waitFor({ timeout: 10_000 })
    await redoButton.click()
    await page.getByRole('status').filter({ hasText: '已重做上次集合操作' }).waitFor({ timeout: 10_000 })
    const collectionsAfterRedo = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (collectionsAfterRedo.length !== 2 || !collectionsAfterRedo.some((collection) => JSON.stringify(collection) === JSON.stringify(duplicateSnapshot)) || !collectionsAfterRedo.some((collection) => collection.id === original.id && collection.title === collectionTitle)) {
      throw new Error(`Clip collection duplicate redo mismatch: ${JSON.stringify(collectionsAfterRedo)}`)
    }

    await page.evaluate(({ collectionId }) => window.aiv.saveVisionClipCollection({
      id: collectionId,
      title: '复制副本已修改',
      selections: [{
        sourceId: 'source-duplicate-smoke',
        videoPath: '/tmp/aivplayer-duplicate-smoke-missing.mp4',
        fileName: 'duplicate-smoke-missing.mp4',
        fingerprint: 'duplicate-smoke-fingerprint',
        durationSeconds: 20,
        startSeconds: 10,
        endSeconds: 12,
        evidenceIds: [],
        evidenceTypes: []
      }]
    }), { collectionId: duplicate.id })
    const independentCollections = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const untouchedOriginal = independentCollections.find((collection) => collection.id === original.id)
    if (untouchedOriginal?.title !== collectionTitle || untouchedOriginal.selections[0]?.startSeconds !== 2) {
      throw new Error(`Clip collection duplicate independence mismatch: ${JSON.stringify(independentCollections)}`)
    }

    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection duplicate smoke:\n${session.errors.join('\n')}`)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: '影视库搜索' }).click()
    await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
    const persistedAfterReload = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const persistedEditedDuplicate = persistedAfterReload.find((collection) => collection.id === duplicateSnapshot.id)
    if (persistedAfterReload.length !== 2 || persistedEditedDuplicate?.title !== '复制副本已修改' || persistedAfterReload.some((collection) => collection.id === original.id && collection.title !== collectionTitle)) {
      throw new Error(`Clip collection duplicate reload mismatch: ${JSON.stringify(persistedAfterReload)}`)
    }
    const activeOperation = await page.evaluate(() => window.aiv.getVisionClipCollectionOperationHistory())
    if (activeOperation?.type !== 'duplicate') throw new Error(`Clip collection duplicate history mismatch: ${JSON.stringify(activeOperation)}`)
    if (screenshotPath) {
      await page.locator('.vision-collection-operation-undo').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection duplicate smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Duplicate passed: ${JSON.stringify({ originalId: original.id, duplicateId: duplicate.id, independent: true, duplicateUndoRedoVerified: true, persistedAfterReload: true, consoleErrors: session.errors.length, undoScreenshotPath: undoScreenshotPath ?? null, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
