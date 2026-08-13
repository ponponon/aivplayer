import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-batch-duplicate-'))
  const prefix = `批量复制 Smoke ${Date.now()}`
  const titles = [`${prefix} 一号`, `${prefix} 二号`, `${prefix} 三号`]
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ titles: nextTitles }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: ['smoke', 'batch'],
      sortMode: 'source-time',
      selections: [{
        sourceId: 'source-batch-duplicate-smoke',
        videoPath: '/tmp/aivplayer-batch-duplicate-smoke-missing.mp4',
        fileName: 'batch-duplicate-smoke-missing.mp4',
        fingerprint: 'batch-duplicate-smoke-fingerprint',
        durationSeconds: 30,
        startSeconds: index + 1,
        endSeconds: index + 5,
        evidenceIds: [`batch-duplicate-evidence-${index + 1}`],
        text: `批量复制验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { titles })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)

    for (const title of titles.slice(0, 2)) {
      const row = page.locator('.vision-collection').filter({ hasText: title }).first()
      await row.waitFor({ timeout: 10_000 })
      await row.getByRole('checkbox', { name: `选择集合：${title}`, exact: true }).check()
    }
    await page.getByRole('button', { name: '复制选中集合', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已复制 2 个集合' }).waitFor({ timeout: 10_000 })

    const afterCopy = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const duplicates = afterCopy.filter((collection) => collection.title.endsWith(' · 副本'))
    const persistedOriginals = originals.map((original) => afterCopy.find((collection) => collection.id === original.id))
    if (afterCopy.length !== 5 || duplicates.length !== 2 || persistedOriginals.some((collection, index) => collection?.title !== titles[index])) {
      throw new Error(`Clip collection batch duplicate persistence mismatch: ${JSON.stringify(afterCopy)}`)
    }
    if (duplicates.some((duplicate) => duplicate.id === originals[0]?.id || duplicate.id === originals[1]?.id)) {
      throw new Error(`Clip collection batch duplicate reused an original id: ${JSON.stringify(duplicates)}`)
    }
    if (duplicates[0]?.tags.join(',') !== 'smoke,batch' || duplicates[0]?.selections[0]?.evidenceIds.length !== 1) {
      throw new Error(`Clip collection batch duplicate did not preserve metadata: ${JSON.stringify(duplicates)}`)
    }

    const firstDuplicate = duplicates[0]
    if (!firstDuplicate) throw new Error('Clip collection batch duplicate did not create a first duplicate')
    await page.evaluate(({ collectionId }) => window.aiv.saveVisionClipCollection({
      id: collectionId,
      title: '批量副本已修改',
      selections: [{
        sourceId: 'source-batch-duplicate-smoke',
        videoPath: '/tmp/aivplayer-batch-duplicate-smoke-missing.mp4',
        fileName: 'batch-duplicate-smoke-missing.mp4',
        fingerprint: 'batch-duplicate-smoke-fingerprint',
        durationSeconds: 30,
        startSeconds: 20,
        endSeconds: 24,
        evidenceIds: ['batch-duplicate-evidence-20'],
        text: '批量复制验证 20',
        evidenceTypes: ['subtitle']
      }]
    }), { collectionId: firstDuplicate.id })
    const afterIndependentEdit = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const untouchedOriginal = afterIndependentEdit.find((collection) => collection.id === originals[0]?.id)
    if (untouchedOriginal?.title !== titles[0] || untouchedOriginal.selections[0]?.startSeconds !== 1) {
      throw new Error(`Clip collection batch duplicate independence mismatch: ${JSON.stringify(afterIndependentEdit)}`)
    }

    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection batch duplicate smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Batch Duplicate passed: ${JSON.stringify({ originalCount: originals.length, duplicateCount: duplicates.length, independent: true })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
