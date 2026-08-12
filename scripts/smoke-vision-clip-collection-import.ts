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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-import-'))
  const exportPath = join(userDataDirectory, 'clip-collection-backup.json')
  const collectionTitle = `导入集合 Smoke ${Date.now()}`
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const original = await page.evaluate((title) => window.aiv.saveVisionClipCollection({
      title,
      tags: ['smoke', 'backup'],
      sortMode: 'duration-desc',
      selections: [{
        sourceId: 'source-import-smoke',
        videoPath: '/tmp/aivplayer-import-smoke-missing.mp4',
        fileName: 'import-smoke-missing.mp4',
        fingerprint: 'import-smoke-fingerprint',
        durationSeconds: 20,
        startSeconds: 2,
        endSeconds: 8,
        evidenceIds: ['import-evidence-1'],
        text: '导入验证选段',
        evidenceTypes: ['subtitle']
      }]
    }), collectionTitle)

    await app.evaluate(({ dialog }, filePath: string) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, exportPath)
    const exported = await page.evaluate((collectionId) => window.aiv.exportVisionClipCollection({ collectionId, format: 'json' }), original.id)
    if (!exported.success) throw new Error(`Clip collection export setup failed: ${JSON.stringify(exported)}`)
    const exportText = await readFile(exportPath, 'utf8')
    if (!exportText.includes('import-evidence-1')) throw new Error('Clip collection export fixture did not contain the selection')

    const deleted = await page.evaluate((collectionId) => window.aiv.deleteVisionClipCollection(collectionId), original.id)
    if (!deleted || (await page.evaluate(() => window.aiv.listVisionClipCollections())).length !== 0) throw new Error('Clip collection export fixture was not isolated')

    await app.evaluate(({ dialog }, filePath: string) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
    }, exportPath)
    await page.getByRole('button', { name: '导入选段集合', exact: true }).click()

    const importedRow = page.locator('.vision-collection').filter({ hasText: collectionTitle })
    await importedRow.waitFor({ timeout: 10_000 })
    const imported = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (imported.length !== 1 || imported[0]?.id === original.id || imported[0]?.selections.length !== 1) {
      throw new Error(`Clip collection import persistence mismatch: ${JSON.stringify(imported)}`)
    }
    await importedRow.locator('.vision-collection-missing').waitFor({ timeout: 10_000 })
    const importedSelection = imported[0]?.selections[0]
    if (importedSelection?.startSeconds !== 2 || importedSelection.endSeconds !== 8 || importedSelection.evidenceIds[0] !== 'import-evidence-1') {
      throw new Error(`Clip collection import selection mismatch: ${JSON.stringify(importedSelection)}`)
    }

    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection import smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Import passed: ${JSON.stringify({ importedCount: imported.length, newCollectionId: imported[0]?.id, missingSourceNotice: true })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
