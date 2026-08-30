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

async function openVisionPanel(page: Page): Promise<string> {
  await page.getByRole('tab', { name: '影视库搜索' }).click()
  await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
  const identity = (await page.locator('.vision-intro h2').textContent())?.trim() ?? ''
  if (!identity) throw new Error('Vision panel identity is missing')
  return identity
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-history-batch-'))
  const firstTitle = `批量历史一 Smoke ${Date.now()}`
  const secondTitle = `批量历史二 Smoke ${Date.now()}`
  const renamedTitle = `${secondTitle} · 已重命名`
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    const pageIdentity = await openVisionPanel(page)
    const collections = await page.evaluate(({ firstTitle, secondTitle }) => Promise.all([firstTitle, secondTitle].map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: ['batch-history', 'Smoke'],
      selections: [{
        sourceId: `source-operation-history-batch-${index}`,
        videoPath: '/tmp/aivplayer-operation-history-batch-smoke-missing.mp4',
        fileName: 'operation-history-batch-smoke-missing.mp4',
        fingerprint: `operation-history-batch-${index}`,
        durationSeconds: 30,
        startSeconds: index + 1,
        endSeconds: index + 3,
        evidenceIds: [`operation-history-batch-evidence-${index}`],
        text: `批量历史验证 ${index}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { firstTitle, secondTitle })
    const first = collections[0]
    const second = collections[1]
    if (!first || !second) throw new Error('Batch history smoke collections were not created')

    const flagResult = await page.evaluate((collectionId) => window.aiv.updateVisionClipCollectionFlags({ collectionIds: [collectionId], isFavorite: true }), first.id)
    if (!flagResult.collections.some((collection) => collection.id === first.id && collection.isFavorite)) throw new Error(`Batch history flag setup failed: ${JSON.stringify(flagResult)}`)
    const renamed = await page.evaluate(({ collectionId, title }) => window.aiv.renameVisionClipCollection({ collectionId, title }), { collectionId: second.id, title: renamedTitle })
    if (!renamed || renamed.title !== renamedTitle) throw new Error(`Batch history rename setup failed: ${JSON.stringify(renamed)}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const historyCard = page.locator('.vision-collection-operation-history')
    await historyCard.waitFor({ timeout: 10_000 })
    const activeEntries = historyCard.locator('.vision-collection-operation-history-entry.is-active')
    if (await activeEntries.count() !== 2) throw new Error(`Expected two active history entries, got ${await activeEntries.count()}`)
    if (await historyCard.locator('.vision-collection-operation-history-select').count() !== 2) throw new Error('Expected two selectable undo history entries')

    await historyCard.getByRole('button', { name: '全选可撤销', exact: true }).click()
    await historyCard.getByRole('button', { name: '批量撤销选中操作', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已批量撤销 2 条集合操作' }).waitFor({ timeout: 10_000 })
    const afterUndo = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const undoneFirst = afterUndo.find((collection) => collection.id === first.id)
    const undoneSecond = afterUndo.find((collection) => collection.id === second.id)
    if (!undoneFirst || undoneFirst.isFavorite || !undoneSecond || undoneSecond.title !== secondTitle) throw new Error(`Batch history undo mismatch: ${JSON.stringify({ undoneFirst, undoneSecond })}`)
    if (await historyCard.locator('.vision-collection-operation-history-entry.is-redoable').count() !== 2) throw new Error('Expected two redoable history entries after batch undo')

    await historyCard.getByRole('button', { name: '全选可重做', exact: true }).click()
    await historyCard.getByRole('button', { name: '批量重做选中操作', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已批量重做 2 条集合操作' }).waitFor({ timeout: 10_000 })
    const afterRedo = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const redoneFirst = afterRedo.find((collection) => collection.id === first.id)
    const redoneSecond = afterRedo.find((collection) => collection.id === second.id)
    if (!redoneFirst || !redoneFirst.isFavorite || !redoneSecond || redoneSecond.title !== renamedTitle) throw new Error(`Batch history redo mismatch: ${JSON.stringify({ redoneFirst, redoneSecond })}`)

    if (screenshotPath) {
      await historyCard.scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during collection operation history batch smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Operation History Batch passed: ${JSON.stringify({ pageIdentity, mixedOperations: true, selectedCount: 2, atomicUndoVerified: true, atomicRedoVerified: true, consoleErrors: session.errors.length, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
