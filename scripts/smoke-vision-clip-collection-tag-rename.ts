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

async function confirmTagRename(page: Page): Promise<string> {
  const dialogPromise = page.waitForEvent('dialog').then(async (dialog) => {
    if (dialog.type() !== 'confirm') throw new Error(`Expected tag rename confirmation, received ${dialog.type()}`)
    const message = dialog.message()
    await dialog.accept()
    return message
  })
  await Promise.all([page.getByRole('button', { name: '重命名标签', exact: true }).click(), dialogPromise])
  return dialogPromise
}

async function dismissTagRename(page: Page): Promise<string> {
  const dialogPromise = page.waitForEvent('dialog').then(async (dialog) => {
    if (dialog.type() !== 'confirm') throw new Error(`Expected tag rename confirmation, received ${dialog.type()}`)
    const message = dialog.message()
    await dialog.dismiss()
    return message
  })
  await Promise.all([page.getByRole('button', { name: '重命名标签', exact: true }).click(), dialogPromise])
  return dialogPromise
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-tag-rename-'))
  const prefix = `标签重命名 Smoke ${Date.now()}`
  const titles = [`标签迁移一 ${prefix}`, `标签迁移二 ${prefix}`, `标签迁移三 ${prefix}`]
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ nextTitles }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: index === 0 ? ['海边', '采访'] : index === 1 ? ['海边', '访谈'] : ['室内'],
      sortMode: index === 0 ? 'duration-desc' : 'source-time',
      selections: [{
        sourceId: 'source-tag-rename-smoke',
        videoPath: '/tmp/aivplayer-tag-rename-smoke-missing.mp4',
        fileName: 'tag-rename-smoke-missing.mp4',
        fingerprint: 'tag-rename-smoke-fingerprint',
        durationSeconds: 48,
        startSeconds: index + 1,
        endSeconds: index + 9,
        evidenceIds: [`tag-rename-evidence-${index + 1}`],
        text: `标签重命名验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByRole('button', { name: '海边 · 2 个集合', exact: true }).click()
    const renameInput = page.getByRole('textbox', { name: '输入新标签名称', exact: true })
    await renameInput.fill('访谈')
    const confirmationMessage = await confirmTagRename(page)
    if (!confirmationMessage.includes('海边') || !confirmationMessage.includes('访谈') || !confirmationMessage.includes('2')) throw new Error(`Tag rename confirmation mismatch: ${confirmationMessage}`)
    await page.getByRole('status').filter({ hasText: '已将 2 个集合中的标签“海边”重命名为“访谈”' }).waitFor({ timeout: 10_000 })

    let persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const renamed = persisted.filter((collection) => collection.id === originals[0]?.id || collection.id === originals[1]?.id)
    const untouched = persisted.find((collection) => collection.id === originals[2]?.id)
    if (renamed.length !== 2 || renamed.some((collection) => collection.tags.includes('海边')) || !untouched || JSON.stringify(untouched.tags) !== JSON.stringify(['室内'])) {
      throw new Error(`Tag rename persistence mismatch: ${JSON.stringify(persisted)}`)
    }
    const firstRenamed = persisted.find((collection) => collection.id === originals[0]?.id)
    const secondRenamed = persisted.find((collection) => collection.id === originals[1]?.id)
    if (JSON.stringify(firstRenamed?.tags) !== JSON.stringify(['访谈', '采访']) || JSON.stringify(secondRenamed?.tags) !== JSON.stringify(['访谈']) || firstRenamed?.sortMode !== originals[0]?.sortMode || firstRenamed?.selections[0]?.evidenceIds[0] !== originals[0]?.selections[0]?.evidenceIds[0]) {
      throw new Error('Tag rename should merge duplicate targets and preserve metadata')
    }
    if (await page.getByRole('button', { name: '海边 · 2 个集合', exact: true }).count() !== 0) throw new Error('Renamed source tag should disappear from the tag manager')
    await page.getByRole('button', { name: '访谈 · 2 个集合', exact: true }).waitFor({ timeout: 10_000 })

    await page.getByRole('button', { name: '访谈 · 2 个集合', exact: true }).click()
    await renameInput.fill('不应保存')
    const cancelMessage = await dismissTagRename(page)
    if (!cancelMessage.includes('访谈') || !cancelMessage.includes('不应保存') || !cancelMessage.includes('2')) throw new Error(`Tag rename cancel confirmation mismatch: ${cancelMessage}`)
    persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (JSON.stringify(persisted.find((collection) => collection.id === originals[0]?.id)?.tags) !== JSON.stringify(['访谈', '采访']) || JSON.stringify(persisted.find((collection) => collection.id === originals[1]?.id)?.tags) !== JSON.stringify(['访谈'])) throw new Error('Cancelling tag rename should not mutate tags')

    if (screenshotPath) {
      await page.locator('.vision-collection-tag-manager').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection tag rename smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Tag Rename passed: ${JSON.stringify({ originalCount: originals.length, renamedFrom: '海边', renamedTo: '访谈', updatedCount: 2, merged: true, cancelled: true, metadataPreserved: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
