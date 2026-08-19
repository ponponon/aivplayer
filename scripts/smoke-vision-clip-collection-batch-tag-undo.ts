import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-batch-tag-undo-'))
  const prefix = `批量标签撤销 Smoke ${Date.now()}`
  const titles = [`批量撤销一 ${prefix}`, `批量撤销二 ${prefix}`, `批量撤销三 ${prefix}`]
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ nextTitles }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: index === 0 ? ['海边', '采访'] : index === 1 ? ['海边'] : ['室内'],
      sortMode: 'source-time',
      selections: [{
        sourceId: 'source-batch-tag-undo-smoke',
        videoPath: '/tmp/aivplayer-batch-tag-undo-smoke-missing.mp4',
        fileName: 'batch-tag-undo-smoke-missing.mp4',
        fingerprint: 'batch-tag-undo-smoke-fingerprint',
        durationSeconds: 48,
        startSeconds: index + 1,
        endSeconds: index + 9,
        evidenceIds: [`batch-tag-undo-evidence-${index + 1}`],
        text: `批量标签撤销验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles })
    const selectedIds = originals.slice(0, 2).map((collection) => collection.id)

    const appended = await page.evaluate(({ collectionIds }) => window.aiv.updateVisionClipCollectionsTags({ collectionIds, tags: ['精选'], mode: 'add' }), { collectionIds: selectedIds })
    if (!appended.success) throw new Error(`Unable to prepare batch history: ${appended.message}`)
    let persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (persisted.filter((collection) => selectedIds.includes(collection.id)).some((collection) => !collection.tags.includes('精选'))) throw new Error('Batch append should create the first history entry')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const undoButton = page.getByRole('button', { name: '撤销上次标签操作', exact: true })
    await undoButton.waitFor({ timeout: 10_000 })
    await undoButton.click()
    await page.getByRole('status').filter({ hasText: '已撤销上次标签操作' }).waitFor({ timeout: 10_000 })
    persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const restoredFirstBatch = persisted.find((collection) => collection.id === originals[0]?.id)
    const restoredSecondBatch = persisted.find((collection) => collection.id === originals[1]?.id)
    if (JSON.stringify(restoredFirstBatch?.tags) !== JSON.stringify(['海边', '采访']) || JSON.stringify(restoredSecondBatch?.tags) !== JSON.stringify(['海边'])) throw new Error(`Batch undo should restore selected tags: ${JSON.stringify(persisted)}`)
    if (JSON.stringify(persisted.find((collection) => collection.id === originals[2]?.id)?.tags) !== JSON.stringify(['室内'])) throw new Error('Batch undo should not touch the unselected collection')

    const persistedRedoButton = page.getByRole('button', { name: '重做上次标签操作', exact: true })
    await persistedRedoButton.waitFor({ timeout: 10_000 })
    await persistedRedoButton.click()
    await page.getByRole('status').filter({ hasText: '已重做上次标签操作' }).waitFor({ timeout: 10_000 })
    persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (persisted.filter((collection) => selectedIds.includes(collection.id)).some((collection) => !collection.tags.includes('精选'))) throw new Error('Batch redo should restore the appended tag')

    const cleared = await page.evaluate(({ collectionIds }) => window.aiv.updateVisionClipCollectionsTags({ collectionIds, tags: [], mode: 'replace' }), { collectionIds: originals.map((collection) => collection.id) })
    if (!cleared.success) throw new Error(`Unable to prepare empty-tag history: ${cleared.message}`)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    if (await page.getByRole('button', { name: '重做上次标签操作', exact: true }).count() !== 0) throw new Error('A new batch operation should clear the previous redo branch')
    const emptyStateUndo = page.locator('.vision-collection-tag-undo-only').getByRole('button', { name: '撤销上次标签操作', exact: true })
    await emptyStateUndo.waitFor({ timeout: 10_000 })
    await emptyStateUndo.click()
    await page.getByRole('status').filter({ hasText: '已撤销上次标签操作' }).waitFor({ timeout: 10_000 })
    persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (JSON.stringify(persisted.find((collection) => collection.id === originals[0]?.id)?.tags) !== JSON.stringify(['海边', '采访', '精选']) || JSON.stringify(persisted.find((collection) => collection.id === originals[1]?.id)?.tags) !== JSON.stringify(['海边', '精选']) || JSON.stringify(persisted.find((collection) => collection.id === originals[2]?.id)?.tags) !== JSON.stringify(['室内'])) throw new Error(`Empty batch undo should restore all tags: ${JSON.stringify(persisted)}`)
    const undoAppendedBatch = page.getByRole('button', { name: '撤销上次标签操作', exact: true })
    await undoAppendedBatch.waitFor({ timeout: 10_000 })
    await undoAppendedBatch.click()
    await page.getByRole('status').filter({ hasText: '已撤销上次标签操作' }).waitFor({ timeout: 10_000 })
    if (await page.getByRole('button', { name: '撤销上次标签操作', exact: true }).count() !== 0) throw new Error('Batch tag undo history should be exhausted after both undos')
    if (await page.getByRole('button', { name: '重做上次标签操作', exact: true }).count() === 0) throw new Error('Batch redo history should remain available after undoing the append')

    if (screenshotPath) {
      await page.locator('.vision-collection-tag-manager').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during batch tag undo smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Batch Tag Undo passed: ${JSON.stringify({ originalCount: originals.length, appendedUndo: true, appendedRedo: true, emptyBatchUndo: true, untouchedPreserved: true, redoBranchCleared: true, historyExhausted: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
