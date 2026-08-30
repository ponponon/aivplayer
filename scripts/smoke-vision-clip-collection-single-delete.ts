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

async function openVisionPanel(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '影视库搜索' }).click()
  await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-single-delete-'))
  const prefix = `单集合删除 Smoke ${Date.now()}`
  const targetTitle = `${prefix} 目标`
  const untouchedTitle = `${prefix} 保留`
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ target, untouched }) => Promise.all([
      window.aiv.saveVisionClipCollection({
        title: target,
        tags: ['单集合', '待恢复'],
        isFavorite: true,
        isArchived: true,
        sortMode: 'duration-desc',
        selections: [{
          sourceId: 'source-single-delete-smoke',
          videoPath: '/tmp/aivplayer-single-delete-smoke-missing.mp4',
          fileName: 'single-delete-smoke-missing.mp4',
          fingerprint: 'single-delete-smoke-fingerprint',
          durationSeconds: 40,
          startSeconds: 4,
          endSeconds: 12,
          evidenceIds: ['single-delete-evidence-1'],
          text: '单集合删除撤销验证',
          evidenceTypes: ['subtitle']
        }]
      }),
      window.aiv.saveVisionClipCollection({
        title: untouched,
        tags: ['保留'],
        selections: [{
          sourceId: 'source-single-delete-untouched',
          videoPath: '/tmp/aivplayer-single-delete-untouched-missing.mp4',
          fileName: 'single-delete-untouched-missing.mp4',
          fingerprint: 'single-delete-untouched-fingerprint',
          durationSeconds: 30,
          startSeconds: 2,
          endSeconds: 8,
          evidenceIds: ['single-delete-evidence-2'],
          text: '未删除集合',
          evidenceTypes: ['scene']
        }]
      })
    ]), { target: targetTitle, untouched: untouchedTitle })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const targetRow = page.locator('.vision-collection').filter({ hasText: targetTitle }).first()
    await targetRow.waitFor({ timeout: 10_000 })
    await targetRow.getByRole('button', { name: '删除集合', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已删除 1 个集合' }).waitFor({ timeout: 10_000 })

    const afterDelete = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (afterDelete.length !== 1 || afterDelete[0]?.id !== originals[1]?.id || afterDelete[0]?.title !== untouchedTitle) {
      throw new Error(`Single collection delete mismatch: ${JSON.stringify(afterDelete)}`)
    }
    const deleteHistory = await page.evaluate(() => window.aiv.getVisionClipCollectionOperationHistory())
    if (!deleteHistory || deleteHistory.type !== 'delete') throw new Error(`Single collection delete history mismatch: ${JSON.stringify(deleteHistory)}`)

    const undoButton = page.getByRole('button', { name: '撤销上次集合操作', exact: true })
    await undoButton.waitFor({ timeout: 10_000 })
    await undoButton.click()
    await page.getByRole('status').filter({ hasText: '已撤销上次集合操作' }).waitFor({ timeout: 10_000 })
    const afterUndo = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const restored = afterUndo.find((collection) => collection.id === originals[0]?.id)
    const stillUntouched = afterUndo.find((collection) => collection.id === originals[1]?.id)
    if (!restored || JSON.stringify(restored) !== JSON.stringify(originals[0]) || !stillUntouched || JSON.stringify(stillUntouched) !== JSON.stringify(originals[1])) {
      throw new Error(`Single collection delete undo mismatch: ${JSON.stringify(afterUndo)}`)
    }
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
    const afterRedo = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (afterRedo.length !== 1 || afterRedo[0]?.id !== originals[1]?.id || afterRedo[0]?.title !== untouchedTitle) {
      throw new Error(`Single collection delete redo mismatch: ${JSON.stringify(afterRedo)}`)
    }
    if (await page.getByText(targetTitle, { exact: true }).count() !== 0) throw new Error('Deleted collection remained visible after redo')

    if (screenshotPath) {
      await page.locator('.vision-collection-operation-undo').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during single collection delete smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Single Delete passed: ${JSON.stringify({ originalCount: originals.length, deletedCount: 1, remainingCount: afterRedo.length, deleteUndoRedoVerified: true, persistedRedoAfterReload: true, consoleErrors: session.errors.length, undoScreenshotPath: undoScreenshotPath ?? null, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
