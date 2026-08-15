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

async function acceptTagConfirmation(page: Page): Promise<string> {
  const dialogPromise = page.waitForEvent('dialog').then(async (dialog) => {
    if (dialog.type() !== 'confirm') throw new Error(`Expected tag update confirmation, received ${dialog.type()}`)
    const message = dialog.message()
    await dialog.accept()
    return message
  })
  await Promise.all([page.getByRole('button', { name: '更新选中集合标签', exact: true }).click(), dialogPromise])
  return dialogPromise
}

async function dismissTagConfirmation(page: Page): Promise<string> {
  const dialogPromise = page.waitForEvent('dialog').then(async (dialog) => {
    if (dialog.type() !== 'confirm') throw new Error(`Expected tag update confirmation, received ${dialog.type()}`)
    const message = dialog.message()
    await dialog.dismiss()
    return message
  })
  await Promise.all([page.getByRole('button', { name: '更新选中集合标签', exact: true }).click(), dialogPromise])
  return dialogPromise
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-batch-tags-'))
  const prefix = `批量标签 Smoke ${Date.now()}`
  const titles = [`标签一 ${prefix}`, `标签二 ${prefix}`, `标签三 ${prefix}`]
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ nextTitles }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: index === 0 ? ['旧标签一'] : index === 1 ? ['旧标签二'] : ['保留标签'],
      sortMode: index === 0 ? 'duration-desc' : 'source-time',
      selections: [{
        sourceId: 'source-batch-tags-smoke',
        videoPath: '/tmp/aivplayer-batch-tags-smoke-missing.mp4',
        fileName: 'batch-tags-smoke-missing.mp4',
        fingerprint: 'batch-tags-smoke-fingerprint',
        durationSeconds: 40,
        startSeconds: index + 1,
        endSeconds: index + 8,
        evidenceIds: [`batch-tags-evidence-${index + 1}`],
        text: `批量标签验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    for (const title of titles.slice(0, 2)) {
      await page.getByRole('checkbox', { name: `选择集合：${title}`, exact: true }).check()
    }

    const tagInput = page.getByRole('textbox', { name: '批量标签（逗号分隔，留空清空）', exact: true })
    await tagInput.fill('海边, 采访, 海边,   ')
    const confirmationMessage = await acceptTagConfirmation(page)
    if (!confirmationMessage.includes('2') || !confirmationMessage.includes('海边 · 采访')) throw new Error(`Batch tag confirmation mismatch: ${confirmationMessage}`)
    await page.getByRole('status').filter({ hasText: '已替换标签 2 个集合的标签' }).waitFor({ timeout: 10_000 })

    let persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const updated = persisted.filter((collection) => collection.id === originals[0]?.id || collection.id === originals[1]?.id)
    const untouched = persisted.find((collection) => collection.id === originals[2]?.id)
    if (updated.length !== 2 || updated.some((collection) => JSON.stringify(collection.tags) !== JSON.stringify(['海边', '采访'])) || !untouched || JSON.stringify(untouched.tags) !== JSON.stringify(['保留标签'])) {
      throw new Error(`Batch tag persistence mismatch: ${JSON.stringify(persisted)}`)
    }
    const firstUpdated = persisted.find((collection) => collection.id === originals[0]?.id)
    if (firstUpdated?.sortMode !== originals[0]?.sortMode || firstUpdated?.selections[0]?.evidenceIds[0] !== originals[0]?.selections[0]?.evidenceIds[0]) throw new Error('Batch tag update should preserve sort mode and evidence metadata')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    for (const title of titles.slice(0, 2)) {
      await page.getByRole('checkbox', { name: `选择集合：${title}`, exact: true }).check()
    }
    await page.getByRole('combobox', { name: '标签批量操作', exact: true }).selectOption({ label: '追加标签' })
    await page.getByRole('textbox', { name: '输入标签（用逗号分隔）', exact: true }).fill('旅行, 海边')
    await acceptTagConfirmation(page)
    await page.getByRole('status').filter({ hasText: '已追加标签 2 个集合的标签' }).waitFor({ timeout: 10_000 })
    persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (persisted.filter((collection) => collection.id === originals[0]?.id || collection.id === originals[1]?.id).some((collection) => JSON.stringify(collection.tags) !== JSON.stringify(['海边', '采访', '旅行']))) throw new Error(`Batch tag append mismatch: ${JSON.stringify(persisted)}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    for (const title of titles.slice(0, 2)) {
      await page.getByRole('checkbox', { name: `选择集合：${title}`, exact: true }).check()
    }
    await page.getByRole('textbox', { name: '输入标签（用逗号分隔）', exact: true }).fill('   ')
    await acceptTagConfirmation(page)
    await page.getByRole('status').filter({ hasText: '已替换标签 2 个集合的标签' }).waitFor({ timeout: 10_000 })
    if (await page.getByText('未设置标签', { exact: true }).count() !== 2) throw new Error('Blank batch tag input should clear the selected collections tags')
    persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (persisted.find((collection) => collection.id === originals[0]?.id)?.tags.length !== 0 || persisted.find((collection) => collection.id === originals[1]?.id)?.tags.length !== 0 || JSON.stringify(persisted.find((collection) => collection.id === originals[2]?.id)?.tags) !== JSON.stringify(['保留标签'])) throw new Error(`Batch tag clearing mismatch: ${JSON.stringify(persisted)}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByRole('checkbox', { name: `选择集合：${titles[2]}`, exact: true }).check()
    await page.getByRole('combobox', { name: '标签批量操作', exact: true }).selectOption({ label: '移除标签' })
    await page.getByRole('textbox', { name: '输入标签（用逗号分隔）', exact: true }).fill('保留标签')
    await acceptTagConfirmation(page)
    await page.getByRole('status').filter({ hasText: '已移除标签 1 个集合的标签' }).waitFor({ timeout: 10_000 })
    persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (persisted.find((collection) => collection.id === originals[2]?.id)?.tags.length !== 0) throw new Error(`Batch tag remove mismatch: ${JSON.stringify(persisted)}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByRole('checkbox', { name: `选择集合：${titles[0]}`, exact: true }).check()
    await page.getByRole('combobox', { name: '标签批量操作', exact: true }).selectOption({ label: '追加标签' })
    await page.getByRole('textbox', { name: '输入标签（用逗号分隔）', exact: true }).fill('不应保存')
    const cancelMessage = await dismissTagConfirmation(page)
    if (!cancelMessage.includes('不应保存') || !(await page.getByRole('checkbox', { name: `选择集合：${titles[0]}`, exact: true }).isChecked()) || await page.getByRole('textbox', { name: '输入标签（用逗号分隔）', exact: true }).inputValue() !== '不应保存') throw new Error('Cancelling batch tag confirmation should preserve selection and draft input')
    persisted = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (persisted.find((collection) => collection.id === originals[0]?.id)?.tags.length !== 0) throw new Error('Cancelling batch tag confirmation should not mutate tags')

    if (screenshotPath) {
      await page.locator('.vision-collection-batch-tags-actions').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection batch tags smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Batch Tags passed: ${JSON.stringify({ originalCount: originals.length, updatedCount: 2, normalized: true, appended: true, cleared: true, removed: true, cancelled: true, metadataPreserved: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
