import { readAppSelectValue, selectAppOption } from './smoke-select.ts'
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

async function setColorInput(page: Page, index: number, value: string): Promise<void> {
  await page.locator('input[type="color"]').nth(index).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (!valueSetter) throw new Error('Unable to set color input value')
    valueSetter.call(input, nextValue as string)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-tag-metadata-'))
  const prefix = `标签元数据 Smoke ${Date.now()}`
  const titles = [`标签样式一 ${prefix}`, `标签样式二 ${prefix}`, `标签样式三 ${prefix}`]
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
        sourceId: 'source-tag-metadata-smoke',
        videoPath: '/tmp/aivplayer-tag-metadata-smoke-missing.mp4',
        fileName: 'tag-metadata-smoke-missing.mp4',
        fingerprint: 'tag-metadata-smoke-fingerprint',
        durationSeconds: 48,
        startSeconds: index + 1,
        endSeconds: index + 9,
        evidenceIds: [`tag-metadata-evidence-${index + 1}`],
        text: `标签元数据验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByRole('button', { name: '海边 · 2 个集合', exact: true }).click()

    await selectAppOption(page, page.getByRole('combobox', { name: '父标签', exact: true }), { label: '采访' })
    await setColorInput(page, 0, '#aabbcc')
    await setColorInput(page, 1, '#101010')
    await page.getByRole('button', { name: '保存样式', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已保存标签“海边”的样式设置' }).waitFor({ timeout: 10_000 })

    const metadata = await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())
    const styledMetadata = metadata.find((item) => item.tag === '海边')
    if (styledMetadata?.parentTag !== '采访' || styledMetadata.color !== '#aabbcc' || styledMetadata.textColor !== '#101010') {
      throw new Error(`Tag metadata mismatch: ${JSON.stringify(styledMetadata)}`)
    }
    const storedCollections = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (storedCollections.length !== originals.length || storedCollections.filter((collection) => collection.tags.includes('海边')).length !== 2) {
      throw new Error(`Collection tag persistence mismatch: ${JSON.stringify(storedCollections)}`)
    }
    if (!(await page.getByRole('button', { name: '海边 · 2 个集合', exact: true }).locator('span').innerText()).includes('海边')) throw new Error('Styled tag should remain visible in the tag manager')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByRole('button', { name: '海边 · 2 个集合', exact: true }).click()
    const persistedMetadata = await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())
    const persistedStyledMetadata = persistedMetadata.find((item) => item.tag === '海边')
    if (JSON.stringify(persistedStyledMetadata) !== JSON.stringify(styledMetadata)) throw new Error(`Metadata should persist after reload: ${JSON.stringify(persistedMetadata)}`)
    if ((await page.locator('input[type="color"]').nth(0).inputValue()) !== '#aabbcc') throw new Error('Background color should reload from metadata')
    if ((await readAppSelectValue(page.getByRole('combobox', { name: '父标签', exact: true }))) !== '采访') throw new Error('Parent tag should reload from metadata')

    if (screenshotPath) {
      await page.locator('.vision-collection-tag-manager').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection tag metadata smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Tag Metadata passed: ${JSON.stringify({ originalCount: originals.length, styledTag: '海边', parentTag: '采访', colors: true, persisted: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
