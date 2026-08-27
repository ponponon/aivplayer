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

async function acceptRenameConfirmation(page: Page): Promise<string> {
  const dialogPromise = page.waitForEvent('dialog').then(async (dialog) => {
    if (dialog.type() !== 'confirm') throw new Error(`Expected collection rename confirmation, received ${dialog.type()}`)
    const message = dialog.message()
    await dialog.accept()
    return message
  })
  await Promise.all([page.getByRole('button', { name: '重命名选中集合', exact: true }).click(), dialogPromise])
  return await dialogPromise
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-batch-rename-'))
  const prefix = `批量重命名 Smoke ${Date.now()}`
  const titles = [`${prefix} 一号`, `${prefix} 二号`, `${prefix} 三号`]
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ titles: nextTitles }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: ['smoke', 'rename'],
      sortMode: 'duration-desc',
      selections: [{
        sourceId: 'source-batch-rename-smoke',
        videoPath: '/tmp/aivplayer-batch-rename-smoke-missing.mp4',
        fileName: 'batch-rename-smoke-missing.mp4',
        fingerprint: 'batch-rename-smoke-fingerprint',
        durationSeconds: 30,
        startSeconds: index + 1,
        endSeconds: index + 6,
        evidenceIds: [`batch-rename-evidence-${index + 1}`],
        text: `批量重命名验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { titles })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)

    for (const title of titles.slice(0, 2)) {
      const row = page.locator('.vision-collection').filter({ hasText: title }).first()
      await row.waitFor({ timeout: 10_000 })
      await row.getByRole('checkbox', { name: `选择集合：${title}`, exact: true }).check()
    }

    const renameButton = page.getByRole('button', { name: '重命名选中集合', exact: true })
    if (!(await renameButton.isDisabled())) throw new Error('Batch rename should be disabled without a prefix or suffix')
    const prefixInput = page.getByRole('textbox', { name: '批量前缀（可选）', exact: true })
    const suffixInput = page.getByRole('textbox', { name: '批量后缀（可选）', exact: true })
    await prefixInput.fill('项目 · ')
    await suffixInput.fill(' · 精选')
    const preview = page.getByRole('status').filter({ hasText: '预览' })
    await preview.waitFor({ timeout: 10_000 })
    if (!(await preview.innerText()).includes('项目 · ') || !(await preview.innerText()).includes(' · 精选')) throw new Error(`Batch rename preview mismatch: ${await preview.innerText()}`)

    const confirmationMessage = await acceptRenameConfirmation(page)
    if (!confirmationMessage.includes('2')) throw new Error(`Batch rename confirmation count mismatch: ${confirmationMessage}`)
    await page.getByRole('status').filter({ hasText: '已重命名 2 个选段集合' }).waitFor({ timeout: 10_000 })

    const afterRename = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const renamed = afterRename.filter((collection) => collection.title.startsWith('项目 · '))
    const untouched = afterRename.find((collection) => collection.id === originals[2]?.id)
    if (afterRename.length !== 3 || renamed.length !== 2 || !untouched || untouched.title !== titles[2]) {
      throw new Error(`Clip collection batch rename persistence mismatch: ${JSON.stringify(afterRename)}`)
    }
    for (const original of originals.slice(0, 2)) {
      const renamedCollection = afterRename.find((collection) => collection.id === original.id)
      if (!renamedCollection || renamedCollection.tags.join(',') !== 'smoke,rename' || renamedCollection.sortMode !== 'duration-desc' || renamedCollection.selections[0]?.evidenceIds.length !== 1 || !renamedCollection.title.endsWith(' · 精选')) {
        throw new Error(`Clip collection batch rename metadata mismatch: ${JSON.stringify(renamedCollection)}`)
      }
    }

    const undoButton = page.getByRole('button', { name: '撤销上次集合操作', exact: true })
    await undoButton.waitFor({ timeout: 10_000 })
    await undoButton.click()
    await page.getByRole('status').filter({ hasText: '已撤销上次集合操作' }).waitFor({ timeout: 10_000 })
    const afterUndo = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (afterUndo.length !== 3 || originals.some((original) => !afterUndo.some((collection) => collection.id === original.id && collection.title === original.title))) {
      throw new Error(`Clip collection batch rename undo mismatch: ${JSON.stringify(afterUndo)}`)
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
    if (afterRedo.length !== 3 || originals.slice(0, 2).some((original) => !afterRedo.some((collection) => collection.id === original.id && collection.title === `项目 · ${original.title} · 精选`))) {
      throw new Error(`Clip collection batch rename redo mismatch: ${JSON.stringify(afterRedo)}`)
    }

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByText(`项目 · ${titles[0]} · 精选`, { exact: true }).waitFor({ timeout: 10_000 })
    if (screenshotPath) {
      await page.locator('.vision-collection-operation-undo').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection batch rename smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Batch Rename passed: ${JSON.stringify({ originalCount: originals.length, renamedCount: renamed.length, preview: true, metadataPreserved: true, renameUndoRedoVerified: true, persistedAfterReload: true, consoleErrors: session.errors.length, undoScreenshotPath: undoScreenshotPath ?? null, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
