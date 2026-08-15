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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-tag-notes-'))
  const prefix = `标签备注 Smoke ${Date.now()}`
  const titles = [`备注标签一 ${prefix}`, `备注标签二 ${prefix}`]
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ nextTitles }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: index === 0 ? ['海边'] : ['采访'],
      sortMode: 'source-time',
      selections: [{
        sourceId: 'source-tag-notes-smoke',
        videoPath: '/tmp/aivplayer-tag-notes-smoke-missing.mp4',
        fileName: 'tag-notes-smoke-missing.mp4',
        fingerprint: `tag-notes-smoke-${index}`,
        durationSeconds: 48,
        startSeconds: index + 1,
        endSeconds: index + 9,
        evidenceIds: [`tag-notes-evidence-${index + 1}`],
        text: `标签备注验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByRole('button', { name: '海边 · 1 个集合', exact: true }).click()
    const note = page.getByRole('textbox', { name: '备注', exact: true })
    await note.fill('海边采访重点，优先用于短视频筛选')
    const favorite = page.getByRole('checkbox', { name: '收藏标签', exact: true })
    await favorite.check()
    await page.getByRole('button', { name: '保存样式', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已保存标签“海边”的样式设置' }).waitFor({ timeout: 10_000 })

    const metadata = await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())
    const saved = metadata.find((item) => item.tag === '海边')
    if (saved?.note !== '海边采访重点，优先用于短视频筛选' || saved.isFavorite !== true) throw new Error(`Tag note metadata mismatch: ${JSON.stringify(saved)}`)
    if ((await page.getByRole('checkbox', { name: '收藏标签', exact: true }).isChecked()) !== true) throw new Error('Favorite state should be checked after save')
    if ((await note.inputValue()) !== '海边采访重点，优先用于短视频筛选') throw new Error('Tag note should remain in the editor after save')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByRole('button', { name: '海边 · 1 个集合', exact: true }).click()
    const persistedNote = page.getByRole('textbox', { name: '备注', exact: true })
    const persistedFavorite = page.getByRole('checkbox', { name: '收藏标签', exact: true })
    if ((await persistedNote.inputValue()) !== '海边采访重点，优先用于短视频筛选' || (await persistedFavorite.isChecked()) !== true) throw new Error('Tag note and favorite should persist after reload')

    const persistedMetadata = await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())
    if (JSON.stringify(persistedMetadata.find((item) => item.tag === '海边')) !== JSON.stringify(saved)) throw new Error(`Tag note metadata should persist after reload: ${JSON.stringify(persistedMetadata)}`)
    const storedCollections = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (storedCollections.length !== originals.length || storedCollections.some((collection) => collection.tags.length !== 1)) throw new Error(`Collection tags should remain unchanged: ${JSON.stringify(storedCollections)}`)

    if (screenshotPath) {
      await page.locator('.vision-collection-tag-manager').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection tag notes smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Tag Notes passed: ${JSON.stringify({ originalCount: originals.length, notePersisted: true, favoritePersisted: true, tagsUnchanged: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
