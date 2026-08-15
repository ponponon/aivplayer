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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-inline-tags-'))
  const title = `标签编辑 Smoke ${Date.now()}`
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const original = await page.evaluate((collectionTitle) => window.aiv.saveVisionClipCollection({
      title: collectionTitle,
      tags: ['初始标签', '保留元数据'],
      sortMode: 'duration-desc',
      selections: [{
        sourceId: 'source-inline-tags-smoke',
        videoPath: '/tmp/aivplayer-inline-tags-smoke-missing.mp4',
        fileName: 'inline-tags-smoke-missing.mp4',
        fingerprint: 'inline-tags-smoke-fingerprint',
        durationSeconds: 50,
        startSeconds: 3,
        endSeconds: 12,
        evidenceIds: ['inline-tags-evidence-1'],
        text: '标签内联编辑验证',
        evidenceTypes: ['subtitle']
      }]
    }), title)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    let row = page.locator('.vision-collection').filter({ hasText: title }).first()
    await row.waitFor({ timeout: 10_000 })
    await row.getByRole('button', { name: `编辑集合标签: ${title}`, exact: true }).click()

    const tagInput = page.getByRole('textbox', { name: '集合标签', exact: true })
    await tagInput.fill('海边, 采访, 海边,   ')
    await tagInput.press('Enter')
    await page.getByRole('status').filter({ hasText: '已更新集合标签' }).waitFor({ timeout: 10_000 })

    let afterNormalize = await page.evaluate(() => window.aiv.listVisionClipCollections())
    let updated = afterNormalize.find((collection) => collection.id === original.id)
    if (!updated || JSON.stringify(updated.tags) !== JSON.stringify(['海边', '采访']) || updated.sortMode !== 'duration-desc' || updated.selections[0]?.evidenceIds[0] !== 'inline-tags-evidence-1') {
      throw new Error(`Inline collection tags normalization mismatch: ${JSON.stringify(updated)}`)
    }

    row = page.locator('.vision-collection').filter({ hasText: title }).first()
    await row.getByRole('button', { name: `编辑集合标签: ${title}`, exact: true }).click()
    const cancelInput = page.getByRole('textbox', { name: '集合标签', exact: true })
    await cancelInput.fill('不要保存的标签')
    await cancelInput.press('Escape')
    await page.getByText('海边 · 采访', { exact: true }).waitFor({ timeout: 10_000 })
    if (await page.getByText('不要保存的标签', { exact: true }).count() !== 0) throw new Error('Escape should discard the inline collection tags edit')

    row = page.locator('.vision-collection').filter({ hasText: title }).first()
    await row.getByRole('button', { name: `编辑集合标签: ${title}`, exact: true }).click()
    const clearInput = page.getByRole('textbox', { name: '集合标签', exact: true })
    await clearInput.fill('   ')
    await page.getByRole('button', { name: '保存集合标签', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已更新集合标签' }).waitFor({ timeout: 10_000 })
    await page.getByText('未设置标签', { exact: true }).waitFor({ timeout: 10_000 })
    const afterClear = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (afterClear[0]?.id !== original.id || afterClear[0]?.tags.length !== 0) throw new Error(`Inline collection tags clear mismatch: ${JSON.stringify(afterClear[0])}`)

    row = page.locator('.vision-collection').filter({ hasText: title }).first()
    await row.getByRole('button', { name: `编辑集合标签: ${title}`, exact: true }).click()
    await page.getByRole('textbox', { name: '集合标签', exact: true }).fill('海边, 采访')
    await page.getByRole('textbox', { name: '集合标签', exact: true }).press('Enter')
    await page.getByRole('status').filter({ hasText: '已更新集合标签' }).waitFor({ timeout: 10_000 })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByText(title, { exact: true }).waitFor({ timeout: 10_000 })
    afterNormalize = await page.evaluate(() => window.aiv.listVisionClipCollections())
    updated = afterNormalize.find((collection) => collection.id === original.id)
    if (!updated || JSON.stringify(updated.tags) !== JSON.stringify(['海边', '采访']) || updated.selections[0]?.evidenceIds[0] !== 'inline-tags-evidence-1') throw new Error(`Inline collection tags reload mismatch: ${JSON.stringify(updated)}`)
    if (screenshotPath) {
      await page.locator('.vision-collections').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during inline collection tags smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Inline Tags passed: ${JSON.stringify({ originalId: original.id, normalized: true, escapeCancelled: true, cleared: true, metadataPreserved: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
