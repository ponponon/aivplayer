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

async function saveParentMetadata(page: Page, tag: string, parentTag: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${tag} · 1 个集合$`) }).click()
  await selectAppOption(page, page.getByRole('combobox', { name: '父标签', exact: true }), { label: parentTag })
  await page.getByRole('button', { name: '保存样式', exact: true }).click()
  await page.getByRole('status').filter({ hasText: `已保存标签“${tag}”的样式设置` }).waitFor({ timeout: 10_000 })
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-tag-hierarchy-'))
  const prefix = `标签层级 Smoke ${Date.now()}`
  const titles = [`层级项目 ${prefix}`, `层级访谈 ${prefix}`, `层级海边 ${prefix}`]
  const tags = ['项目', '访谈', '海边']
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
        sourceId: 'source-tag-hierarchy-smoke',
        videoPath: '/tmp/aivplayer-tag-hierarchy-smoke-missing.mp4',
        fileName: 'tag-hierarchy-smoke-missing.mp4',
        fingerprint: `tag-hierarchy-smoke-${index}`,
        durationSeconds: 48,
        startSeconds: index + 1,
        endSeconds: index + 9,
        evidenceIds: [`tag-hierarchy-evidence-${index + 1}`],
        text: `标签层级验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles, nextTags: tags })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await saveParentMetadata(page, '海边', '访谈')
    await saveParentMetadata(page, '访谈', '项目')

    const seaButton = page.getByRole('button', { name: /^海边 · 1 个集合$/ })
    if (!(await seaButton.locator('span').innerText()).includes('项目 / 访谈 / 海边')) throw new Error('Multi-level tag path should be visible')

    await page.getByRole('button', { name: /^项目 · 1 个集合$/ }).click()
    const parentOptions = await page.getByRole('combobox', { name: '父标签', exact: true }).locator('option').allTextContents()
    if (parentOptions.includes('海边')) throw new Error(`Cycle-forming parent should be filtered: ${JSON.stringify(parentOptions)}`)

    const cycleResult = await page.evaluate(() => window.aiv.updateVisionClipCollectionTagMetadata({ tag: '项目', parentTag: '海边' }))
    if (cycleResult.success || !cycleResult.message.includes('环路')) throw new Error(`Cycle assignment should be rejected: ${JSON.stringify(cycleResult)}`)

    const metadata = await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())
    if (metadata.find((item) => item.tag === '访谈')?.parentTag !== '项目' || metadata.find((item) => item.tag === '海边')?.parentTag !== '访谈') throw new Error(`Hierarchy metadata mismatch: ${JSON.stringify(metadata)}`)
    const storedCollections = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (storedCollections.length !== originals.length) throw new Error(`Collection persistence mismatch: ${JSON.stringify(storedCollections)}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const persistedSeaButton = page.getByRole('button', { name: /^海边 · 1 个集合$/ })
    if (!(await persistedSeaButton.locator('span').innerText()).includes('项目 / 访谈 / 海边')) throw new Error('Multi-level path should persist after reload')

    if (screenshotPath) {
      await persistedSeaButton.scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection tag hierarchy smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Tag Hierarchy passed: ${JSON.stringify({ originalCount: originals.length, path: '项目 / 访谈 / 海边', cycleRejected: true, candidateFiltered: true, persisted: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
