import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-batch-export-'))
  const exportPath = join(userDataDirectory, 'clip-collections-backup.json')
  const prefix = `批量导出 Smoke ${Date.now()}`
  const titles = [`${prefix} 一号`, `${prefix} 二号`, `${prefix} 三号`]
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ titles: nextTitles }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: ['smoke', 'export'],
      sortMode: 'duration-desc',
      selections: [{
        sourceId: 'source-batch-export-smoke',
        videoPath: '/tmp/aivplayer-batch-export-smoke-missing.mp4',
        fileName: 'batch-export-smoke-missing.mp4',
        fingerprint: 'batch-export-smoke-fingerprint',
        durationSeconds: 30,
        startSeconds: index + 1,
        endSeconds: index + 6,
        evidenceIds: [`batch-export-evidence-${index + 1}`],
        text: `批量导出验证 ${index + 1}`,
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

    await app.evaluate(({ dialog }, filePath: string) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, exportPath)
    await page.getByRole('button', { name: '导出选中集合', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已导出 2 个选段集合' }).waitFor({ timeout: 10_000 })

    const exported = JSON.parse(await readFile(exportPath, 'utf8')) as { exportVersion?: number; collections?: Array<{ id: string; title: string; selections: unknown[] }> }
    if (exported.exportVersion !== 2 || exported.collections?.length !== 2 || exported.collections.some((collection) => !titles.includes(collection.title) || collection.selections.length !== 1)) {
      throw new Error(`Clip collection batch export payload mismatch: ${JSON.stringify(exported)}`)
    }

    await page.evaluate((ids) => Promise.all(ids.map((id) => window.aiv.deleteVisionClipCollection(id))), originals.map((collection) => collection.id))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByText('还没有保存的选段集合。', { exact: true }).waitFor({ timeout: 10_000 })

    await app.evaluate(({ dialog }, filePath: string) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
    }, exportPath)
    await page.getByRole('button', { name: '导入选段集合', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已导入 2 个选段集合' }).waitFor({ timeout: 10_000 })

    const imported = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (imported.length !== 2 || imported.some((collection) => !titles.includes(collection.title) || originals.some((original) => original.id === collection.id) || collection.selections.length !== 1)) {
      throw new Error(`Clip collection batch import persistence mismatch: ${JSON.stringify(imported)}`)
    }
    const importedTitles = imported.map((collection) => collection.title).sort()
    if (JSON.stringify(importedTitles) !== JSON.stringify(titles.slice(0, 2).sort())) throw new Error(`Clip collection batch import titles mismatch: ${JSON.stringify(importedTitles)}`)

    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection batch export smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Batch Export passed: ${JSON.stringify({ exportedCount: exported.collections.length, importedCount: imported.length, version: exported.exportVersion, newIds: true })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
