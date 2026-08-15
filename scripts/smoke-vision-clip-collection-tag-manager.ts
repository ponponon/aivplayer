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

async function confirmTagCleanup(page: Page): Promise<string> {
  const dialogPromise = page.waitForEvent('dialog').then(async (dialog) => {
    if (dialog.type() !== 'confirm') throw new Error(`Expected tag cleanup confirmation, received ${dialog.type()}`)
    const message = dialog.message()
    await dialog.accept()
    return message
  })
  await Promise.all([page.getByRole('button', { name: '清理标签', exact: true }).click(), dialogPromise])
  return dialogPromise
}

async function dismissTagCleanup(page: Page): Promise<string> {
  const dialogPromise = page.waitForEvent('dialog').then(async (dialog) => {
    if (dialog.type() !== 'confirm') throw new Error(`Expected tag cleanup confirmation, received ${dialog.type()}`)
    const message = dialog.message()
    await dialog.dismiss()
    return message
  })
  await Promise.all([page.getByRole('button', { name: '清理标签', exact: true }).click(), dialogPromise])
  return dialogPromise
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-tag-manager-'))
  const prefix = `标签管理 Smoke ${Date.now()}`
  const titles = [`标签管理一 ${prefix}`, `标签管理二 ${prefix}`, `标签管理三 ${prefix}`]
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ nextTitles }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: index === 0 ? ['海边', '采访'] : index === 1 ? ['海边'] : ['室内'],
      sortMode: index === 0 ? 'duration-desc' : 'source-time',
      selections: [{
        sourceId: 'source-tag-manager-smoke',
        videoPath: '/tmp/aivplayer-tag-manager-smoke-missing.mp4',
        fileName: 'tag-manager-smoke-missing.mp4',
        fingerprint: 'tag-manager-smoke-fingerprint',
        durationSeconds: 55,
        startSeconds: index + 2,
        endSeconds: index + 11,
        evidenceIds: [`tag-manager-evidence-${index + 1}`],
        text: `标签管理验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const seaTag = page.getByRole('button', { name: '海边 · 2 个集合', exact: true })
    await seaTag.waitFor({ timeout: 10_000 })
    await seaTag.click()
    const confirmationMessage = await confirmTagCleanup(page)
    if (!confirmationMessage.includes('海边') || !confirmationMessage.includes('2')) throw new Error(`Tag cleanup confirmation mismatch: ${confirmationMessage}`)
    await page.getByRole('status').filter({ hasText: '已从 2 个集合中清理标签：海边' }).waitFor({ timeout: 10_000 })

    let persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const cleaned = persisted.filter((collection) => collection.id === originals[0]?.id || collection.id === originals[1]?.id)
    const untouched = persisted.find((collection) => collection.id === originals[2]?.id)
    if (cleaned.length !== 2 || cleaned.some((collection) => collection.tags.includes('海边')) || !untouched || JSON.stringify(untouched.tags) !== JSON.stringify(['室内'])) {
      throw new Error(`Tag cleanup persistence mismatch: ${JSON.stringify(persisted)}`)
    }
    const firstCleaned = persisted.find((collection) => collection.id === originals[0]?.id)
    if (JSON.stringify(firstCleaned?.tags) !== JSON.stringify(['采访']) || firstCleaned?.sortMode !== originals[0]?.sortMode || firstCleaned?.selections[0]?.evidenceIds[0] !== originals[0]?.selections[0]?.evidenceIds[0]) {
      throw new Error('Tag cleanup should preserve remaining tags, sort mode and evidence metadata')
    }
    if (await page.getByRole('button', { name: '海边 · 2 个集合', exact: true }).count() !== 0) throw new Error('Cleaned tag should disappear from the tag manager')

    await page.getByRole('button', { name: '室内 · 1 个集合', exact: true }).click()
    const cancelMessage = await dismissTagCleanup(page)
    if (!cancelMessage.includes('室内') || !cancelMessage.includes('1')) throw new Error(`Tag cleanup cancel confirmation mismatch: ${cancelMessage}`)
    persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (JSON.stringify(persisted.find((collection) => collection.id === originals[2]?.id)?.tags) !== JSON.stringify(['室内'])) throw new Error('Cancelling tag cleanup should not mutate tags')

    if (screenshotPath) {
      await page.locator('.vision-collection-tag-manager').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection tag manager smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Tag Manager passed: ${JSON.stringify({ originalCount: originals.length, cleanedTag: '海边', updatedCount: 2, untouchedCount: 1, cancelled: true, metadataPreserved: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
