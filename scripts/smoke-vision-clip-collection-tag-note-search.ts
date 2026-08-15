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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-tag-note-search-'))
  const prefix = `标签备注搜索 Smoke ${Date.now()}`
  const titles = [`备注海边 ${prefix}`, `备注采访 ${prefix}`, `备注项目 ${prefix}`]
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
        sourceId: 'source-tag-note-search-smoke',
        videoPath: '/tmp/aivplayer-tag-note-search-smoke-missing.mp4',
        fileName: 'tag-note-search-smoke-missing.mp4',
        fingerprint: `tag-note-search-smoke-${index}`,
        durationSeconds: 48,
        startSeconds: index + 1,
        endSeconds: index + 9,
        evidenceIds: [`tag-note-search-evidence-${index + 1}`],
        text: `标签备注搜索验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles, nextTags: tags })
    const seasideNote = await page.evaluate(() => window.aiv.updateVisionClipCollectionTagMetadata({ tag: '海边', note: '外景海岸线镜头' }))
    if (!seasideNote.success) throw new Error(`Unable to prepare seaside note: ${seasideNote.message}`)
    const interviewNote = await page.evaluate(() => window.aiv.updateVisionClipCollectionTagMetadata({ tag: '采访', note: '室内对话与采访' }))
    if (!interviewNote.success) throw new Error(`Unable to prepare interview note: ${interviewNote.message}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const query = page.getByRole('textbox', { name: '搜索标签或备注', exact: true })
    await query.fill('外景')
    if (await tagButtonCount(page) !== 1 || await page.getByRole('button', { name: '海边 · 1 个集合', exact: true }).count() !== 1) throw new Error('Note query should show the tag matched by its note')

    await query.fill('室内')
    if (await tagButtonCount(page) !== 1 || await page.getByRole('button', { name: '采访 · 1 个集合', exact: true }).count() !== 1) throw new Error('Note query should match another note')

    await query.fill('海边')
    if (await tagButtonCount(page) !== 1 || await page.getByRole('button', { name: '海边 · 1 个集合', exact: true }).count() !== 1) throw new Error('Tag query should keep matching tag names')

    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    if (await tagButtonCount(page) !== 3 || (await query.inputValue()) !== '') throw new Error('Clear filters should restore all tags after note search')

    const storedCollections = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const originalTagShape = originals.map((collection) => ({ id: collection.id, tags: collection.tags })).sort((left, right) => left.id.localeCompare(right.id))
    const storedTagShape = storedCollections.map((collection) => ({ id: collection.id, tags: collection.tags })).sort((left, right) => left.id.localeCompare(right.id))
    if (JSON.stringify(storedTagShape) !== JSON.stringify(originalTagShape)) throw new Error(`Note search should not change collection tags: ${JSON.stringify(storedTagShape)}`)
    const metadata = await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())
    if (metadata.find((item) => item.tag === '海边')?.note !== '外景海岸线镜头' || metadata.find((item) => item.tag === '采访')?.note !== '室内对话与采访') throw new Error(`Note search should preserve notes: ${JSON.stringify(metadata)}`)
    if (screenshotPath) {
      await query.fill('外景')
      await page.locator('.vision-collection-tag-manager').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection tag note search smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Tag Note Search passed: ${JSON.stringify({ originalCount: originals.length, noteMatches: 2, tagMatch: true, cleared: true, dataUnchanged: true, notesPersisted: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
