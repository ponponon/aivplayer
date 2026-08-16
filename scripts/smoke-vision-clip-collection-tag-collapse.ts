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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-tag-collapse-'))
  const prefix = `标签折叠 Smoke ${Date.now()}`
  const titles = ['项目', '访谈', '海边', '旁支', '独立'].map((tag) => `${tag} ${prefix}`)
  const tags = ['项目', '访谈', '海边', '旁支', '独立']
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
        sourceId: 'source-tag-collapse-smoke',
        videoPath: '/tmp/aivplayer-tag-collapse-smoke-missing.mp4',
        fileName: 'tag-collapse-smoke-missing.mp4',
        fingerprint: `tag-collapse-smoke-${index}`,
        durationSeconds: 48,
        startSeconds: index + 1,
        endSeconds: index + 9,
        evidenceIds: [`tag-collapse-evidence-${index + 1}`],
        text: `标签折叠验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles, nextTags: tags })
    const metadataUpdates = [
      { tag: '访谈', parentTag: '项目' },
      { tag: '海边', parentTag: '访谈' },
      { tag: '旁支', parentTag: '项目' }
    ]
    const metadataResults = await page.evaluate((updates) => Promise.all(updates.map((update) => window.aiv.updateVisionClipCollectionTagMetadata(update))), metadataUpdates)
    if (metadataResults.some((result) => !result.success)) throw new Error(`Unable to prepare tag hierarchy: ${JSON.stringify(metadataResults)}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    if (await tagButtonCount(page) !== 5) throw new Error(`All tags should be visible before collapse: ${await tagButtonCount(page)}`)

    const collapseProject = page.getByRole('button', { name: '收起子标签: 项目', exact: true })
    await collapseProject.click()
    if ((await collapseProject.getAttribute('aria-expanded')) !== 'false') throw new Error('Parent collapse button should expose aria-expanded=false')
    if (await tagButtonCount(page) !== 2 || await page.getByRole('button', { name: '海边 · 1 个集合', exact: true }).count() !== 0 || await page.getByRole('button', { name: '独立 · 1 个集合', exact: true }).count() !== 1) throw new Error('Collapsing a parent should hide all descendants but keep unrelated roots')

    await page.getByRole('button', { name: '展开子标签: 项目', exact: true }).click()
    await page.getByRole('button', { name: '收起子标签: 访谈', exact: true }).click()
    if (await tagButtonCount(page) !== 4 || await page.getByRole('button', { name: '海边 · 1 个集合', exact: true }).count() !== 0 || await page.getByRole('button', { name: '旁支 · 1 个集合', exact: true }).count() !== 1) throw new Error('Collapsing an intermediate tag should hide only its descendants')

    const query = page.getByRole('textbox', { name: '搜索标签或备注', exact: true })
    await query.fill('海边')
    if (await tagButtonCount(page) !== 1 || await page.getByRole('button', { name: '海边 · 1 个集合', exact: true }).count() !== 1) throw new Error('Tag search should reveal a matching descendant even when its ancestor is collapsed')
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    if (await tagButtonCount(page) !== 4 || (await query.inputValue()) !== '') throw new Error('Clearing the filter should restore the collapsed hierarchy')

    const storedCollections = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const originalTagShape = originals.map((collection) => ({ id: collection.id, tags: collection.tags })).sort((left, right) => left.id.localeCompare(right.id))
    const storedTagShape = storedCollections.map((collection) => ({ id: collection.id, tags: collection.tags })).sort((left, right) => left.id.localeCompare(right.id))
    if (JSON.stringify(storedTagShape) !== JSON.stringify(originalTagShape)) throw new Error(`Tag collapse should not change collection data: ${JSON.stringify(storedTagShape)}`)
    if (screenshotPath) {
      await page.locator('.vision-collection-tag-manager').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection tag collapse smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Tag Collapse passed: ${JSON.stringify({ originalCount: originals.length, parentCollapsed: true, intermediateCollapsed: true, searchRevealsDescendant: true, dataUnchanged: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
