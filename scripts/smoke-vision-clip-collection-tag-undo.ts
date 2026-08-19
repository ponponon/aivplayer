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

async function confirmCleanup(page: Page): Promise<void> {
  const dialogPromise = page.waitForEvent('dialog').then(async (dialog) => {
    if (dialog.type() !== 'confirm') throw new Error(`Expected cleanup confirmation, received ${dialog.type()}`)
    if (!dialog.message().includes('海边') || !dialog.message().includes('2')) throw new Error(`Unexpected cleanup confirmation: ${dialog.message()}`)
    await dialog.accept()
  })
  await Promise.all([page.getByRole('button', { name: '清理标签', exact: true }).click(), dialogPromise])
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-tag-undo-'))
  const prefix = `标签撤销 Smoke ${Date.now()}`
  const titles = [`撤销集合一 ${prefix}`, `撤销集合二 ${prefix}`, `撤销集合三 ${prefix}`]
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
        sourceId: 'source-tag-undo-smoke',
        videoPath: '/tmp/aivplayer-tag-undo-smoke-missing.mp4',
        fileName: 'tag-undo-smoke-missing.mp4',
        fingerprint: 'tag-undo-smoke-fingerprint',
        durationSeconds: 48,
        startSeconds: index + 1,
        endSeconds: index + 9,
        evidenceIds: [`tag-undo-evidence-${index + 1}`],
        text: `标签撤销验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles })
    const metadataResult = await page.evaluate(() => window.aiv.updateVisionClipCollectionTagMetadata({ tag: '海边', parentTag: '采访', color: '#aabbcc', textColor: '#101010' }))
    if (!metadataResult.success) throw new Error(`Unable to prepare metadata history: ${metadataResult.message}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByRole('button', { name: '海边 · 2 个集合', exact: true }).click()
    await confirmCleanup(page)
    await page.getByRole('status').filter({ hasText: '已从 2 个集合中清理标签：海边' }).waitFor({ timeout: 10_000 })

    let persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (persisted.filter((collection) => collection.tags.includes('海边')).length !== 0) throw new Error('Cleanup should remove the tag before undo')
    if ((await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())).some((item) => item.tag === '海边')) throw new Error('Cleanup should remove metadata before undo')

    const undoButton = page.getByRole('button', { name: '撤销上次标签操作', exact: true })
    await undoButton.click()
    await page.getByRole('status').filter({ hasText: '已撤销上次标签操作' }).waitFor({ timeout: 10_000 })
    persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (persisted.length !== originals.length || persisted.filter((collection) => collection.tags.includes('海边')).length !== 2) throw new Error(`Undo should restore tags: ${JSON.stringify(persisted)}`)
    const restoredMetadata = await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())
    if (restoredMetadata.find((item) => item.tag === '海边')?.color !== '#aabbcc' || restoredMetadata.find((item) => item.tag === '海边')?.parentTag !== '采访') throw new Error(`Undo should restore metadata: ${JSON.stringify(restoredMetadata)}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const persistedRedoButton = page.getByRole('button', { name: '重做上次标签操作', exact: true })
    await persistedRedoButton.waitFor({ timeout: 10_000 })
    await persistedRedoButton.click()
    await page.getByRole('status').filter({ hasText: '已重做上次标签操作' }).waitFor({ timeout: 10_000 })
    persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (persisted.filter((collection) => collection.tags.includes('海边')).length !== 0) throw new Error('Redo should reapply cleanup after reload')
    if ((await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())).some((item) => item.tag === '海边')) throw new Error('Redo should remove metadata after reload')

    const undoAfterRedo = page.getByRole('button', { name: '撤销上次标签操作', exact: true })
    await undoAfterRedo.waitFor({ timeout: 10_000 })
    await undoAfterRedo.click()
    await page.getByRole('status').filter({ hasText: '已撤销上次标签操作' }).waitFor({ timeout: 10_000 })
    persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (persisted.filter((collection) => collection.tags.includes('海边')).length !== 2) throw new Error('Undo after redo should restore tags')

    const persistedUndoButton = page.getByRole('button', { name: '撤销上次标签操作', exact: true })
    await persistedUndoButton.waitFor({ timeout: 10_000 })
    await persistedUndoButton.click()
    await page.getByRole('status').filter({ hasText: '已撤销上次标签操作' }).waitFor({ timeout: 10_000 })
    const metadataAfterSecondUndo = await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())
    if (metadataAfterSecondUndo.some((item) => item.tag === '海边')) throw new Error('Second undo should remove the earlier style operation')
    if (await page.getByRole('button', { name: '撤销上次标签操作', exact: true }).count() !== 0) throw new Error('All tag history should be consumed after the second undo')
    if (await page.getByRole('button', { name: '重做上次标签操作', exact: true }).count() === 0) throw new Error('Redo history should remain available after undoing style metadata')

    if (screenshotPath) {
      await page.locator('.vision-collection-tag-manager').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection tag undo smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Tag Undo passed: ${JSON.stringify({ originalCount: originals.length, cleaned: true, restored: true, persistedHistory: true, redoAfterReload: true, metadataUndo: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
