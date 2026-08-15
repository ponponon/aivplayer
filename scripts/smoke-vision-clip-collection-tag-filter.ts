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

async function tagButtonCount(page: Page): Promise<number> {
  return page.locator('.vision-collection-tag-manager-list .vision-collection-tag-manager-item').count()
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-tag-filter-'))
  const prefix = `标签筛选 Smoke ${Date.now()}`
  const titles = [`筛选海边 ${prefix}`, `筛选采访 ${prefix}`, `筛选项目 ${prefix}`]
  const tags = ['海边', '采访', '项目']
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ nextTitles, nextTags }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: [nextTags[index]!],
      sortMode: 'source-time',
      selections: [{
        sourceId: 'source-tag-filter-smoke',
        videoPath: '/tmp/aivplayer-tag-filter-smoke-missing.mp4',
        fileName: 'tag-filter-smoke-missing.mp4',
        fingerprint: `tag-filter-smoke-${index}`,
        durationSeconds: 48,
        startSeconds: index + 1,
        endSeconds: index + 9,
        evidenceIds: [`tag-filter-evidence-${index + 1}`],
        text: `标签筛选验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles, nextTags: tags })
    const favoriteResult = await page.evaluate(() => window.aiv.updateVisionClipCollectionTagMetadata({ tag: '海边', isFavorite: true, note: '筛选 Smoke 收藏标签' }))
    if (!favoriteResult.success) throw new Error(`Unable to prepare favorite tag: ${favoriteResult.message}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const query = page.getByRole('textbox', { name: '搜索标签', exact: true })
    const favoriteOnly = page.getByRole('checkbox', { name: '仅看收藏', exact: true })
    await query.fill('海')
    if (await tagButtonCount(page) !== 1 || await page.getByRole('button', { name: '海边 · 1 个集合', exact: true }).count() !== 1) throw new Error('Tag query should show only the matching tag')

    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    if (await tagButtonCount(page) !== 3) throw new Error('Clearing filters should restore all tags')
    await favoriteOnly.check()
    if (await tagButtonCount(page) !== 1 || await page.getByRole('button', { name: '海边 · 1 个集合', exact: true }).count() !== 1) throw new Error('Favorites-only filter should show only the favorite tag')

    await query.fill('项目')
    if (await tagButtonCount(page) !== 0 || await page.getByText('没有符合筛选条件的标签。', { exact: true }).count() !== 1) throw new Error('Non-matching favorite query should show the tag empty state')
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    if (await tagButtonCount(page) !== 3 || (await favoriteOnly.isChecked()) !== false || (await query.inputValue()) !== '') throw new Error('Clear filters should reset query and favorite state')

    const storedCollections = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (storedCollections.length !== originals.length || storedCollections.some((collection) => collection.tags.length !== 1)) throw new Error(`Filtering should not change collection data: ${JSON.stringify(storedCollections)}`)
    if (screenshotPath) {
      await favoriteOnly.check()
      await page.locator('.vision-collection-tag-manager').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection tag filter smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Tag Filter passed: ${JSON.stringify({ originalCount: originals.length, queryMatches: 1, favoritesMatches: 1, emptyState: true, cleared: true, dataUnchanged: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
