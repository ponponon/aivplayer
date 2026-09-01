import { selectAppOption } from './smoke-select.ts'
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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-tag-custom-order-'))
  const prefix = `标签自定义顺序 Smoke ${Date.now()}`
  const titles = [`自定义海边 ${prefix}`, `自定义采访 ${prefix}`, `自定义项目 ${prefix}`]
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
        sourceId: 'source-tag-custom-order-smoke',
        videoPath: '/tmp/aivplayer-tag-custom-order-smoke-missing.mp4',
        fileName: 'tag-custom-order-smoke-missing.mp4',
        fingerprint: `tag-custom-order-smoke-${index}`,
        durationSeconds: 48,
        startSeconds: index + 1,
        endSeconds: index + 9,
        evidenceIds: [`tag-custom-order-evidence-${index + 1}`],
        text: `标签自定义顺序验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles, nextTags: tags })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)

    const sort = page.locator('.vision-collection-tag-manager-filter').getByRole('combobox', { name: '排序', exact: true })
    await selectAppOption(page, sort, 'custom')
    const initialOrder = await readTagOrder(page)
    if (initialOrder.length !== 3) throw new Error(`Custom order fixture mismatch: ${JSON.stringify(initialOrder)}`)
    const movableTag = initialOrder[initialOrder.length - 1]!
    await page.getByRole('button', { name: `${movableTag} · 1 个集合`, exact: true }).click()
    await page.getByRole('button', { name: `上移标签: ${movableTag}`, exact: true }).click()
    const movedOrder = await readTagOrder(page)
    if (movedOrder[movedOrder.length - 2] !== movableTag) throw new Error(`Custom order move mismatch: ${JSON.stringify({ initialOrder, movedOrder, movableTag })}`)
    await page.waitForFunction(() => (document.querySelector('.vision-collection-tag-manager-filter .app-select[aria-label="排序"]') as HTMLElement | null)?.dataset.selectValue === 'custom')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const persistedSort = page.locator('.vision-collection-tag-manager-filter').getByRole('combobox', { name: '排序', exact: true })
    await persistedSort.waitFor({ timeout: 10_000 })
    await page.waitForFunction(() => (document.querySelector('.vision-collection-tag-manager-filter .app-select[aria-label="排序"]') as HTMLElement | null)?.dataset.selectValue === 'custom')
    const persistedOrder = await readTagOrder(page)
    if (JSON.stringify(persistedOrder) !== JSON.stringify(movedOrder)) throw new Error(`Custom order was not persisted: ${JSON.stringify({ movedOrder, persistedOrder })}`)

    const storedCollections = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const originalTagShape = originals.map((collection) => ({ id: collection.id, tags: collection.tags })).sort((left, right) => left.id.localeCompare(right.id))
    const storedTagShape = storedCollections.map((collection) => ({ id: collection.id, tags: collection.tags })).sort((left, right) => left.id.localeCompare(right.id))
    if (JSON.stringify(storedTagShape) !== JSON.stringify(originalTagShape)) throw new Error(`Custom order should not change collection tags: ${JSON.stringify(storedTagShape)}`)
    if (screenshotPath) {
      await page.locator('.vision-collection-tag-manager').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection tag custom order smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Tag Custom Order passed: ${JSON.stringify({ originalCount: originals.length, customSort: true, moved: true, persisted: true, dataUnchanged: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
