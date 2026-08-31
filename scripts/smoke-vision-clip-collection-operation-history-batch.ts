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
  const conflictScreenshotPath = process.env.AIVPLAYER_SMOKE_CONFLICT_SCREENSHOT_PATH
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

    const historyTypeFilter = historyCard.getByRole('combobox', { name: '操作类型', exact: true })
    const historyStatusFilter = historyCard.getByRole('combobox', { name: '状态', exact: true })
    await historyTypeFilter.selectOption('flags')
    if (await historyCard.locator('.vision-collection-operation-history-entry').count() !== 1 || !(await historyCard.locator('.vision-collection-operation-history-entry').first().textContent())?.includes('收藏 / 归档')) throw new Error('Collection history type filter should keep only flag operations')
    await historyStatusFilter.selectOption('undone')
    if (await historyCard.locator('.vision-collection-operation-history-entry').count() !== 0 || await historyCard.getByText('没有符合当前筛选条件的集合历史。', { exact: true }).count() !== 1) throw new Error('Collection history status filter should render its empty state')
    await historyStatusFilter.selectOption('all')
    await page.evaluate(() => {
      const scope = window as unknown as { __aivplayerCollectionHistoryExport?: { blob: Blob; fileName: string } }
      const originalCreateObjectURL = URL.createObjectURL.bind(URL)
      const originalAnchorClick = HTMLAnchorElement.prototype.click
      URL.createObjectURL = (blob: Blob) => {
        scope.__aivplayerCollectionHistoryExport = { blob, fileName: '' }
        return originalCreateObjectURL(blob)
      }
      HTMLAnchorElement.prototype.click = function () {
        if (scope.__aivplayerCollectionHistoryExport) scope.__aivplayerCollectionHistoryExport.fileName = this.download
        originalAnchorClick.call(this)
      }
    })
    await historyCard.getByRole('button', { name: '导出筛选历史', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已导出 1 条集合历史' }).waitFor({ timeout: 10_000 })
    const exportedHistory = await page.evaluate(async () => {
      const scope = window as unknown as { __aivplayerCollectionHistoryExport?: { blob: Blob; fileName: string } }
      const value = scope.__aivplayerCollectionHistoryExport
      return value ? { json: await value.blob.text(), fileName: value.fileName } : null
    })
    if (!exportedHistory?.fileName.endsWith('.json')) throw new Error(`Collection history export filename mismatch: ${JSON.stringify(exportedHistory)}`)
    const exportedHistoryManifest = JSON.parse(exportedHistory.json) as { schemaVersion: number; typeFilter: string; statusFilter: string; entries: Array<{ type: string; status: string }> }
    if (exportedHistoryManifest.schemaVersion !== 1 || exportedHistoryManifest.typeFilter !== 'flags' || exportedHistoryManifest.statusFilter !== 'all' || exportedHistoryManifest.entries.length !== 1 || exportedHistoryManifest.entries[0]?.type !== 'flags' || exportedHistoryManifest.entries[0]?.status !== 'active') {
      throw new Error(`Collection history export manifest mismatch: ${JSON.stringify(exportedHistoryManifest)}`)
    }
    await historyTypeFilter.selectOption('all')

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
    const branchedFirst = await page.evaluate((next) => window.aiv.saveVisionClipCollection({ id: next.id, title: next.title, tags: next.tags, sortMode: next.sortMode, isFavorite: false, isArchived: next.isArchived, selections: next.selections }), redoneFirst)
    if (!branchedFirst || branchedFirst.isFavorite) throw new Error(`Collection history conflict branch setup failed: ${JSON.stringify(branchedFirst)}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const conflictHistoryCard = page.locator('.vision-collection-operation-history')
    await conflictHistoryCard.waitFor({ timeout: 10_000 })
    await conflictHistoryCard.getByRole('button', { name: '全选可撤销', exact: true }).click()
    await conflictHistoryCard.getByRole('button', { name: '批量撤销选中操作', exact: true }).click()
    const conflictPanel = conflictHistoryCard.locator('.vision-collection-operation-history-conflicts')
    await conflictPanel.waitFor({ timeout: 10_000 })
    if (!(await conflictPanel.getByText('集合已被修改或删除', { exact: true }).count())) throw new Error(`Collection history conflict reason was not rendered: ${await conflictPanel.textContent()}`)
    const historyBeforeRecovery = await page.evaluate(() => window.aiv.listVisionClipCollectionOperationHistory())
    if (historyBeforeRecovery.some((entry) => entry.status !== 'active')) throw new Error('Collection history conflict batch changed history status')
    if (conflictScreenshotPath) {
      await conflictHistoryCard.scrollIntoViewIfNeeded()
      await page.screenshot({ path: conflictScreenshotPath, fullPage: false })
    }
    await conflictPanel.getByRole('button', { name: '移除冲突项，保留其他选择', exact: true }).click()
    await conflictPanel.waitFor({ state: 'hidden', timeout: 10_000 })
    if (!(await conflictHistoryCard.getByRole('status').filter({ hasText: '已选择 1 条操作' }).count())) throw new Error('Collection history conflict removal did not retain the safe selection')
    await conflictHistoryCard.getByRole('button', { name: '批量撤销选中操作', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已批量撤销 1 条集合操作' }).waitFor({ timeout: 10_000 })
    const recoveredCollections = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const recoveredFirst = recoveredCollections.find((collection) => collection.id === first.id)
    const recoveredSecond = recoveredCollections.find((collection) => collection.id === second.id)
    if (!recoveredFirst || recoveredFirst.isFavorite || !recoveredSecond || recoveredSecond.title !== secondTitle) throw new Error(`Collection history conflict recovery mismatch: ${JSON.stringify({ recoveredFirst, recoveredSecond })}`)
    const historyAfterRecovery = await page.evaluate(() => window.aiv.listVisionClipCollectionOperationHistory())
    if (historyAfterRecovery.filter((entry) => entry.status === 'redoable').length !== 1 || historyAfterRecovery.filter((entry) => entry.status === 'active').length !== 1) throw new Error(`Collection history conflict recovery changed unexpected history statuses: ${JSON.stringify(historyAfterRecovery)}`)
    if (session.errors.length > 0) throw new Error(`Renderer errors during collection operation history batch smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Operation History Batch passed: ${JSON.stringify({ pageIdentity, mixedOperations: true, historyFilterVerified: true, historyExportVerified: true, selectedCount: 2, atomicUndoVerified: true, atomicRedoVerified: true, conflictDiagnosticsVerified: true, conflictRecoveryVerified: true, consoleErrors: session.errors.length, screenshotPath: screenshotPath ?? null, conflictScreenshotPath: conflictScreenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
