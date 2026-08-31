import { basename, join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const previewScreenshotPath = '/private/tmp/aivplayer-collection-repair-preview.png'
const appliedScreenshotPath = '/private/tmp/aivplayer-collection-repair-applied.png'
const historyScreenshotPath = '/private/tmp/aivplayer-collection-repair-history.png'

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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-batch-repair-'))
  const prefix = `批量修复 Smoke ${Date.now()}`
    const titles = [`${prefix} 一号`, `${prefix} 二号`]
    const fileName = basename(mediaPath)
    const originalsById = new Map<string, { selections: Array<{ videoPath: string }> }>()
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ titles: nextTitles, fileName: nextFileName }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: ['smoke', 'repair'],
      selections: [{
        sourceId: `source-batch-repair-${index}`,
        videoPath: `/tmp/aivplayer-batch-repair-old-${index}/${nextFileName}`,
        fileName: nextFileName,
        fingerprint: `batch-repair-old-${index}`,
        durationSeconds: 30,
        startSeconds: 2 + index,
        endSeconds: 8 + index,
        evidenceIds: [`batch-repair-evidence-${index}`],
        text: `批量修复验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { titles, fileName })
    for (const original of originals) originalsById.set(original.id, original)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    for (const title of titles) {
      const row = page.locator('.vision-collection').filter({ hasText: title }).first()
      await row.waitFor({ timeout: 10_000 })
      await row.locator('input[type="checkbox"]').first().check()
    }
    await page.locator('.vision-collection-missing').nth(1).waitFor({ timeout: 10_000 })
    const repairButton = page.getByRole('button', { name: '批量修复源文件', exact: true })
    await repairButton.waitFor({ timeout: 10_000 })

    await app.evaluate(({ dialog }, replacementPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [replacementPath] })
    }, mediaPath)
    await repairButton.click()

    const preview = page.locator('.vision-collection-repair-preview')
    await preview.waitFor({ timeout: 10_000 })
    const previewItems = preview.locator('.vision-collection-repair-preview-item')
    if (await previewItems.count() !== 2 || await preview.locator('[data-status="matched"]').count() !== 2) throw new Error(`Batch repair preview mismatch: ${await preview.textContent()}`)
    await preview.screenshot({ path: previewScreenshotPath })

    await preview.getByRole('button', { name: '确认批量修复', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已批量修复 2 个选段集合' }).waitFor({ timeout: 15_000 })
    const afterApply = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (afterApply.length !== 2 || afterApply.some((collection) => collection.selections[0]?.videoPath !== mediaPath || (collection.selections[0]?.durationSeconds ?? 0) <= 0)) {
      throw new Error(`Batch repair apply mismatch: ${JSON.stringify(afterApply)}`)
    }
    await page.locator('.vision-collections').screenshot({ path: appliedScreenshotPath })

    const historyAfterApply = await page.evaluate(() => window.aiv.listVisionClipCollectionOperationHistory())
    const repairOperation = historyAfterApply.find((operation) => operation.type === 'content' && operation.status === 'active')
    if (historyAfterApply.length !== 1 || !repairOperation || repairOperation.collectionIds.length !== 2 || repairOperation.selectionCount !== 2) {
      throw new Error(`Batch repair history mismatch: ${JSON.stringify(historyAfterApply)}`)
    }

    const historyEntry = page.locator('.vision-collection-operation-history-entry').first()
    await historyEntry.waitFor({ timeout: 15_000 })
    await historyEntry.locator('.vision-collection-operation-history-action').click()
    await page.getByRole('status').filter({ hasText: '已撤销指定集合操作' }).waitFor({ timeout: 10_000 })
    const afterUndo = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (afterUndo.some((collection) => collection.selections[0]?.videoPath !== originalsById.get(collection.id)?.selections[0]?.videoPath)) throw new Error(`Batch repair undo mismatch: ${JSON.stringify(afterUndo)}`)

    await historyEntry.locator('.vision-collection-operation-history-action').click()
    await page.getByRole('status').filter({ hasText: '已重做指定集合操作' }).waitFor({ timeout: 10_000 })
    const afterRedo = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (afterRedo.some((collection) => collection.selections[0]?.videoPath !== mediaPath)) throw new Error(`Batch repair redo mismatch: ${JSON.stringify(afterRedo)}`)
    await page.locator('.vision-collection-operation-history').screenshot({ path: historyScreenshotPath })

    if (session.errors.length > 0) throw new Error(`Renderer errors during batch collection repair smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Batch Repair passed: ${JSON.stringify({ collectionCount: afterRedo.length, matchedCount: 2, atomicHistoryVerified: true, undoRedoVerified: true, consoleErrors: session.errors.length, previewScreenshotPath, appliedScreenshotPath, historyScreenshotPath })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
