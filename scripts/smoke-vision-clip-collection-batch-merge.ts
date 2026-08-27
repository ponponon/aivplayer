import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const screenshotPath = process.env.AIVPLAYER_SMOKE_SCREENSHOT_PATH
const previewScreenshotPath = process.env.AIVPLAYER_SMOKE_PREVIEW_SCREENSHOT_PATH

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

async function openVisionPanel(page: Page): Promise<string> {
  await page.getByRole('tab', { name: '影视库搜索' }).click()
  await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
  const pageIdentity = (await page.locator('.vision-intro h2').textContent())?.trim() ?? ''
  if (!pageIdentity) throw new Error('Vision panel identity is missing')
  return pageIdentity
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-batch-merge-'))
  const prefix = `批量合并 Smoke ${Date.now()}`
  const titles = [`${prefix} 一号`, `${prefix} 二号`]
  const mergedTitle = `精选合并结果 ${Date.now()}`
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    const pageIdentity = await openVisionPanel(page)

    const originals = await page.evaluate(({ nextTitles }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: index === 0 ? ['人物', '烟火'] : ['烟火', '采访'],
      sortMode: 'source-time',
      selections: [{
        sourceId: 'source-batch-merge-smoke',
        videoPath: '/tmp/aivplayer-batch-merge-smoke-missing.mp4',
        fileName: 'batch-merge-smoke-missing.mp4',
        fingerprint: 'batch-merge-smoke-fingerprint',
        durationSeconds: 30,
        startSeconds: index === 0 ? 1 : 2.6,
        endSeconds: index === 0 ? 3 : 5,
        evidenceIds: [`batch-merge-evidence-${index + 1}`],
        text: `批量合并验证 ${index + 1}`,
        evidenceTypes: ['subtitle'] as ['subtitle']
      }, ...(index === 0 ? [{
        sourceId: 'source-batch-merge-smoke',
        videoPath: '/tmp/aivplayer-batch-merge-smoke-missing.mp4',
        fileName: 'batch-merge-smoke-missing.mp4',
        fingerprint: 'batch-merge-smoke-fingerprint',
        durationSeconds: 30,
        startSeconds: 10,
        endSeconds: 11,
        evidenceIds: ['batch-merge-evidence-extra'],
        text: '批量合并验证待取消',
        evidenceTypes: ['subtitle'] as ['subtitle']
      }] : [])]
    }))), { nextTitles: titles })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    for (const title of titles) {
      const row = page.locator('.vision-collection').filter({ hasText: title }).first()
      await row.waitFor({ timeout: 10_000 })
      await row.getByRole('checkbox', { name: `选择集合：${title}`, exact: true }).check()
    }

    const mergeAction = page.locator('.vision-collection-batch-merge')
    await mergeAction.waitFor({ timeout: 10_000 })
    await page.getByRole('region', { name: '合并预览', exact: true }).waitFor({ timeout: 10_000 })
    const preview = mergeAction.locator('.vision-collection-merge-preview')
    await preview.getByText('合并后 2 个选段 · 3 个标签', { exact: true }).waitFor({ timeout: 10_000 })
    const previewSources = await preview.locator('.vision-collection-merge-preview-source').allTextContents()
    if (previewSources.length !== 2 || titles.some((title) => !previewSources.some((source) => source.includes(title))) || !previewSources.some((source) => source.includes('00:01.0–00:03.0')) || !previewSources.some((source) => source.includes('00:02.6–00:05.0')) || !previewSources.some((source) => source.includes('00:10.0–00:11.0'))) throw new Error(`Batch merge preview source ranges mismatch: ${JSON.stringify(previewSources)}`)
    const removableSelection = preview.getByRole('checkbox', { name: '选择合并选段 00:10.0–00:11.0', exact: true })
    await removableSelection.uncheck()
    await preview.getByText('已选择 2 个来源选段', { exact: true }).waitFor({ timeout: 10_000 })
    await preview.getByText('合并后 1 个选段 · 3 个标签', { exact: true }).waitFor({ timeout: 10_000 })
    const previewOutputRanges = await preview.locator('.vision-collection-merge-preview-output-ranges span').allTextContents()
    if (previewOutputRanges.length !== 1 || previewOutputRanges[0] !== '00:01.0–00:05.0') throw new Error(`Batch merge preview output ranges mismatch: ${JSON.stringify(previewOutputRanges)}`)
    const titleInput = mergeAction.getByRole('textbox', { name: '合并后集合名称', exact: true })
    await titleInput.fill(mergedTitle)
    if (await titleInput.inputValue() !== mergedTitle) throw new Error('Batch merge custom title input did not retain its value')
    if (previewScreenshotPath) {
      await mergeAction.scrollIntoViewIfNeeded()
      await mergeAction.screenshot({ path: previewScreenshotPath })
    }
    const mergeButton = mergeAction.getByRole('button', { name: '合并选中集合', exact: true })
    if (!(await mergeButton.isEnabled())) throw new Error('Batch merge button should be enabled for two selected collections')

    const dialogPromise = page.waitForEvent('dialog').then(async (dialog) => {
      if (dialog.type() !== 'confirm') throw new Error(`Expected merge confirmation, received ${dialog.type()}`)
      const message = dialog.message()
      await dialog.accept()
      return message
    })
    await Promise.all([mergeButton.click(), dialogPromise])
    const confirmationMessage = await dialogPromise
    if (!confirmationMessage.includes('2') || !confirmationMessage.includes(mergedTitle) || !confirmationMessage.includes('原集合会保留')) {
      throw new Error(`Batch merge confirmation mismatch: ${confirmationMessage}`)
    }

    await page.getByRole('status').filter({ hasText: '已将 2 个集合合并为新集合' }).waitFor({ timeout: 10_000 })
    const afterMerge = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const merged = afterMerge.find((collection) => collection.title === mergedTitle)
    const persistedOriginals = originals.map((original) => afterMerge.find((collection) => collection.id === original.id))
    if (afterMerge.length !== 3 || !merged || persistedOriginals.some((collection) => !collection)) {
      throw new Error(`Clip collection batch merge persistence mismatch: ${JSON.stringify(afterMerge)}`)
    }
    const mergedSelection = merged.selections[0]
    if (merged.selections.length !== 1 || mergedSelection?.startSeconds !== 1 || mergedSelection.endSeconds !== 5) {
      throw new Error(`Clip collection batch merge interval mismatch: ${JSON.stringify(merged)}`)
    }
    const expectedTags = new Set(['人物', '烟火', '采访'])
    if (merged.tags.length !== expectedTags.size || merged.tags.some((tag) => !expectedTags.has(tag)) || merged.isFavorite || merged.isArchived) {
      throw new Error(`Clip collection batch merge metadata mismatch: ${JSON.stringify(merged)}`)
    }
    if (!mergedSelection.evidenceIds.includes('batch-merge-evidence-1') || !mergedSelection.evidenceIds.includes('batch-merge-evidence-2')) {
      throw new Error(`Clip collection batch merge evidence mismatch: ${JSON.stringify(mergedSelection)}`)
    }
    if (mergedSelection.evidenceIds.includes('batch-merge-evidence-extra')) {
      throw new Error(`Clip collection batch merge included an unselected range: ${JSON.stringify(mergedSelection)}`)
    }

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    const persistedAfterReload = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const reloadedMerged = persistedAfterReload.find((collection) => collection.id === merged.id)
    if (!reloadedMerged || reloadedMerged.selections.length !== 1 || reloadedMerged.selections[0]?.endSeconds !== 5) {
      throw new Error(`Clip collection batch merge reload mismatch: ${JSON.stringify(persistedAfterReload)}`)
    }
    if (screenshotPath) {
      const status = page.getByRole('status').filter({ hasText: '显示 3 / 3 个选段集合' })
      await status.waitFor({ timeout: 10_000 }).catch(() => undefined)
      await page.locator('.vision-collections').scrollIntoViewIfNeeded()
      await page.locator('.vision-collections').hover()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }

    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection batch merge smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Batch Merge passed: ${JSON.stringify({ pageIdentity, originalCount: originals.length, mergedCount: 1, mergedTitle, selectedSourceSelectionCount: 2, mergedSelectionCount: reloadedMerged.selections.length, mergedRange: [reloadedMerged.selections[0]?.startSeconds, reloadedMerged.selections[0]?.endSeconds], previewVerified: true, tagsPreserved: true, originalsPreserved: true, persistedAfterReload: true, consoleErrors: session.errors.length, previewScreenshotPath: previewScreenshotPath ?? null, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
