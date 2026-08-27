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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-inline-rename-'))
  const originalTitle = `内联改名 Smoke ${Date.now()}`
  const savedTitle = `${originalTitle} · Enter 保存`
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const original = await page.evaluate((title) => window.aiv.saveVisionClipCollection({
      title,
      tags: ['smoke', 'inline-rename'],
      sortMode: 'file-name',
      selections: [{
        sourceId: 'source-inline-rename-smoke',
        videoPath: '/tmp/aivplayer-inline-rename-smoke-missing.mp4',
        fileName: 'inline-rename-smoke-missing.mp4',
        fingerprint: 'inline-rename-smoke-fingerprint',
        durationSeconds: 45,
        startSeconds: 2,
        endSeconds: 9,
        evidenceIds: ['inline-rename-evidence-1'],
        text: '内联改名验证',
        evidenceTypes: ['subtitle']
      }]
    }), originalTitle)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const originalRow = page.locator('.vision-collection').filter({ hasText: originalTitle }).first()
    await originalRow.waitFor({ timeout: 10_000 })
    await originalRow.getByRole('button', { name: `编辑集合名称: ${originalTitle}`, exact: true }).click()

    const titleInput = page.getByRole('textbox', { name: '集合名称', exact: true })
    await titleInput.fill(savedTitle)
    await titleInput.press('Enter')
    await page.getByRole('status').filter({ hasText: '已更新选段集合' }).waitFor({ timeout: 10_000 })

    const afterEnter = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const renamed = afterEnter.find((collection) => collection.id === original.id)
    if (!renamed || renamed.title !== savedTitle || renamed.tags.join(',') !== 'smoke,inline-rename' || renamed.sortMode !== 'file-name' || renamed.selections[0]?.evidenceIds[0] !== 'inline-rename-evidence-1') {
      throw new Error(`Inline collection rename persistence mismatch: ${JSON.stringify(renamed)}`)
    }

    const undoButton = page.getByRole('button', { name: '撤销上次集合操作', exact: true })
    await undoButton.waitFor({ timeout: 10_000 })
    await undoButton.click()
    await page.getByRole('status').filter({ hasText: '已撤销上次集合操作' }).waitFor({ timeout: 10_000 })
    const afterUndo = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (afterUndo.length !== 1 || afterUndo[0]?.id !== original.id || afterUndo[0]?.title !== originalTitle || afterUndo[0]?.tags.join(',') !== 'smoke,inline-rename' || afterUndo[0]?.selections[0]?.evidenceIds[0] !== 'inline-rename-evidence-1') {
      throw new Error(`Inline collection rename undo mismatch: ${JSON.stringify(afterUndo)}`)
    }
    if (undoScreenshotPath) {
      await page.locator('.vision-collection-operation-redo').scrollIntoViewIfNeeded()
      await page.screenshot({ path: undoScreenshotPath, fullPage: false })
    }

    const redoButton = page.getByRole('button', { name: '重做上次集合操作', exact: true })
    await redoButton.waitFor({ timeout: 10_000 })
    await redoButton.click()
    await page.getByRole('status').filter({ hasText: '已重做上次集合操作' }).waitFor({ timeout: 10_000 })
    const afterRedo = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (afterRedo.length !== 1 || afterRedo[0]?.id !== original.id || afterRedo[0]?.title !== savedTitle || afterRedo[0]?.tags.join(',') !== 'smoke,inline-rename' || afterRedo[0]?.selections[0]?.evidenceIds[0] !== 'inline-rename-evidence-1') {
      throw new Error(`Inline collection rename redo mismatch: ${JSON.stringify(afterRedo)}`)
    }

    const renamedRow = page.locator('.vision-collection').filter({ hasText: savedTitle }).first()
    await renamedRow.getByRole('button', { name: `编辑集合名称: ${savedTitle}`, exact: true }).click()
    const cancelInput = page.getByRole('textbox', { name: '集合名称', exact: true })
    await cancelInput.fill('不应该保存的标题')
    await cancelInput.press('Escape')
    await page.getByText(savedTitle, { exact: true }).waitFor({ timeout: 10_000 })
    if (await page.getByText('不应该保存的标题', { exact: true }).count() !== 0) throw new Error('Escape should discard the inline collection title edit')

    await renamedRow.getByRole('button', { name: `编辑集合名称: ${savedTitle}`, exact: true }).click()
    const emptyInput = page.getByRole('textbox', { name: '集合名称', exact: true })
    await emptyInput.fill('   ')
    await page.getByRole('button', { name: '保存集合名称', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '集合名称不能为空' }).waitFor({ timeout: 10_000 })
    if (!(await page.getByRole('textbox', { name: '集合名称', exact: true }).count())) throw new Error('Empty title should keep inline edit mode open')
    await page.getByRole('button', { name: '取消编辑集合名称', exact: true }).click()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByText(savedTitle, { exact: true }).waitFor({ timeout: 10_000 })
    const persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (persisted.length !== 1 || persisted[0]?.id !== original.id || persisted[0]?.title !== savedTitle) throw new Error(`Inline collection rename reload mismatch: ${JSON.stringify(persisted)}`)
    if (screenshotPath) {
      await page.locator('.vision-collections').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during inline collection rename smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Inline Rename passed: ${JSON.stringify({ originalId: original.id, enterSaved: true, escapeCancelled: true, emptyTitleGuarded: true, metadataPreserved: true, renameUndoRedoVerified: true, persistedAfterReload: true, consoleErrors: session.errors.length, undoScreenshotPath: undoScreenshotPath ?? null, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
