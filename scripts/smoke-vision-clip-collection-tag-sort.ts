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

async function readTagOrder(page: Page): Promise<string[]> {
  return page.locator('.vision-collection-tag-manager-item span').allTextContents()
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-tag-sort-'))
  const prefix = `标签排序 Smoke ${Date.now()}`
  const titles = [`排序海边一 ${prefix}`, `排序海边二 ${prefix}`, `排序采访 ${prefix}`, `排序项目 ${prefix}`]
  const tagValues = ['海边', '海边', '采访', '项目']
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
        sourceId: 'source-tag-sort-smoke',
        videoPath: '/tmp/aivplayer-tag-sort-smoke-missing.mp4',
        fileName: 'tag-sort-smoke-missing.mp4',
        fingerprint: `tag-sort-smoke-${index}`,
        durationSeconds: 48,
        startSeconds: index + 1,
        endSeconds: index + 9,
        evidenceIds: [`tag-sort-evidence-${index + 1}`],
        text: `标签排序验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles, nextTags: tagValues })
    const favoriteResult = await page.evaluate(() => window.aiv.updateVisionClipCollectionTagMetadata({ tag: '项目', isFavorite: true, note: '排序 Smoke 收藏标签' }))
    if (!favoriteResult.success) throw new Error(`Unable to prepare favorite tag: ${favoriteResult.message}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const sort = page.locator('.vision-collection-tag-manager-filter').getByRole('combobox', { name: '排序', exact: true })
    await sort.selectOption('usage-desc')
    const usageOrder = await readTagOrder(page)
    if (usageOrder[0] !== '海边') throw new Error(`Usage sort should put the most-used tag first: ${JSON.stringify(usageOrder)}`)

    await sort.selectOption('favorite-first')
    const favoriteOrder = await readTagOrder(page)
    if (favoriteOrder[0] !== '项目') throw new Error(`Favorite sort should put the favorite tag first: ${JSON.stringify(favoriteOrder)}`)

    await sort.selectOption('name')
    const nameOrder = await readTagOrder(page)
    const expectedNameOrder = await page.evaluate(() => ['海边', '采访', '项目'].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })))
    if (JSON.stringify(nameOrder) !== JSON.stringify(expectedNameOrder)) throw new Error(`Name sort mismatch: ${JSON.stringify({ nameOrder, expectedNameOrder })}`)

    await sort.selectOption('favorite-first')
    const storedCollections = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const originalTagShape = originals.map((collection) => ({ id: collection.id, tags: collection.tags })).sort((left, right) => left.id.localeCompare(right.id))
    const storedTagShape = storedCollections.map((collection) => ({ id: collection.id, tags: collection.tags })).sort((left, right) => left.id.localeCompare(right.id))
    if (JSON.stringify(storedTagShape) !== JSON.stringify(originalTagShape)) throw new Error(`Sorting should not change collection tags: ${JSON.stringify(storedTagShape)}`)
    if (screenshotPath) {
      await page.locator('.vision-collection-tag-manager').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection tag sort smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Tag Sort passed: ${JSON.stringify({ originalCount: originals.length, usageSorted: true, favoriteSorted: true, nameSorted: true, dataUnchanged: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
