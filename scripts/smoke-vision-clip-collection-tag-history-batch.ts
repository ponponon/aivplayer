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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-tag-history-batch-'))
  const tag = `跨页标签 Smoke ${Date.now()}`
  const finalNote = '跨页批量恢复完成'
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    const pageIdentity = await openVisionPanel(page)
    const collection = await page.evaluate((tag) => window.aiv.saveVisionClipCollection({
      title: '标签历史跨页 Smoke',
      tags: [tag],
      selections: [{
        sourceId: 'tag-history-batch-smoke',
        videoPath: '/tmp/aivplayer-tag-history-batch-smoke-missing.mp4',
        fileName: 'tag-history-batch-smoke-missing.mp4',
        fingerprint: 'tag-history-batch-smoke',
        durationSeconds: 30,
        startSeconds: 1,
        endSeconds: 3,
        evidenceIds: ['tag-history-batch-smoke-evidence'],
        text: '标签历史跨页验证',
        evidenceTypes: ['subtitle']
      }]
    }), tag)
    if (!collection) throw new Error('Tag history batch smoke collection was not created')

    for (let index = 0; index < 22; index += 1) {
      const note = index === 21 ? finalNote : `第 ${index + 1} 次标签历史`
      const result = await page.evaluate(({ tag, note }) => window.aiv.updateVisionClipCollectionTagMetadata({ tag, note }), { tag, note })
      if (!result.success || !result.metadata) throw new Error(`Tag metadata setup failed at ${index}: ${JSON.stringify(result)}`)
    }

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const historyCard = page.locator('.vision-collection-tag-history')
    await historyCard.waitFor({ timeout: 10_000 })
    if (await historyCard.locator('.vision-collection-tag-history-entry.is-active').count() !== 20) throw new Error('Expected 20 active tag history entries on the first page')

    await historyCard.getByRole('button', { name: '全选本页可撤销', exact: true }).click()
    await historyCard.getByRole('button', { name: '下一页', exact: true }).click()
    if (await historyCard.locator('.vision-collection-tag-history-entry.is-active').count() !== 2) throw new Error('Expected 2 active tag history entries on the second page')
    await historyCard.getByRole('button', { name: '全选本页可撤销', exact: true }).click()
    if (!(await historyCard.getByRole('status').filter({ hasText: '已选择 22 条标签操作' }).count())) throw new Error('Cross-page tag history selection count was not retained')
    await historyCard.getByRole('button', { name: '批量撤销选中操作', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已批量撤销 22 条标签操作' }).waitFor({ timeout: 10_000 })
    if ((await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())).length !== 0) throw new Error('Tag history batch undo did not restore empty metadata')

    const firstPage = historyCard
    await firstPage.getByRole('button', { name: '全选本页可重做', exact: true }).click()
    await firstPage.getByRole('button', { name: '下一页', exact: true }).click()
    await firstPage.getByRole('button', { name: '全选本页可重做', exact: true }).click()
    if (!(await firstPage.getByRole('status').filter({ hasText: '已选择 22 条标签操作' }).count())) throw new Error('Cross-page redo selection count was not retained')
    await firstPage.getByRole('button', { name: '批量重做选中操作', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已批量重做 22 条标签操作' }).waitFor({ timeout: 10_000 })
    const metadata = await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())
    if (metadata.length !== 1 || metadata[0]?.note !== finalNote) throw new Error(`Tag history batch redo mismatch: ${JSON.stringify(metadata)}`)

    const currentCollection = await page.evaluate((collectionId) => window.aiv.listVisionClipCollections().then((collections) => collections.find((collection) => collection.id === collectionId) ?? null), collection.id)
    if (!currentCollection) throw new Error('Tag history conflict smoke collection was not found')
    const conflictMetadata = await page.evaluate(({ tag }) => window.aiv.updateVisionClipCollectionTagMetadata({ tag, note: '冲突前状态' }), { tag })
    if (!conflictMetadata.success || !conflictMetadata.metadata) throw new Error(`Tag history conflict metadata setup failed: ${JSON.stringify(conflictMetadata)}`)
    const conflictUpdate = await page.evaluate(({ collectionId, tag }) => window.aiv.updateVisionClipCollectionTags({ collectionId, tags: [tag, '分支标签'] }), { collectionId: collection.id, tag })
    if (!conflictUpdate.success || !conflictUpdate.collection) throw new Error(`Tag history conflict tag setup failed: ${JSON.stringify(conflictUpdate)}`)
    const branched = await page.evaluate((next) => window.aiv.saveVisionClipCollection({ id: next.id, title: next.title, tags: ['分支标签'], sortMode: next.sortMode, isFavorite: next.isFavorite, isArchived: next.isArchived, selections: next.selections }), conflictUpdate.collection)
    if (!branched || branched.tags.join('|') !== '分支标签') throw new Error(`Tag history conflict branch setup failed: ${JSON.stringify(branched)}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const conflictHistoryCard = page.locator('.vision-collection-tag-history')
    await conflictHistoryCard.waitFor({ timeout: 10_000 })
    await conflictHistoryCard.getByRole('button', { name: '全选本页可撤销', exact: true }).click()
    if (await conflictHistoryCard.getByRole('button', { name: '下一页', exact: true }).count()) {
      await conflictHistoryCard.getByRole('button', { name: '下一页', exact: true }).click()
      await conflictHistoryCard.getByRole('button', { name: '全选本页可撤销', exact: true }).click()
    }
    await conflictHistoryCard.getByRole('button', { name: '批量撤销选中操作', exact: true }).click()
    const conflictPanel = conflictHistoryCard.locator('.vision-collection-tag-history-conflicts')
    await conflictPanel.waitFor({ timeout: 10_000 })
    if (!(await conflictPanel.getByText('集合标签或更新时间已变化', { exact: true }).count())) throw new Error(`Tag history conflict reason was not rendered: ${await conflictPanel.textContent()}`)
    if (await page.evaluate(() => window.aiv.listVisionClipCollectionTagOperationHistoryPage({ limit: 100 })).then((result) => result.entries.some((entry) => entry.status !== 'active'))) throw new Error('Tag history conflict batch changed history status')
    const branchAfterFailure = await page.evaluate((collectionId) => window.aiv.listVisionClipCollections().then((collections) => collections.find((item) => item.id === collectionId) ?? null), collection.id)
    if (!branchAfterFailure || branchAfterFailure.tags.join('|') !== '分支标签') throw new Error(`Tag history conflict batch changed current data: ${JSON.stringify(branchAfterFailure)}`)

    if (screenshotPath) {
      await conflictHistoryCard.scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during tag operation history batch smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Tag Operation History Batch passed: ${JSON.stringify({ pageIdentity, crossPageSelectionVerified: true, selectedCount: 22, atomicUndoVerified: true, atomicRedoVerified: true, conflictDiagnosticsVerified: true, consoleErrors: session.errors.length, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
