import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-import-preview-'))
  const importPath = join(userDataDirectory, 'clip-collections-conflict-preview.json')
  const collectionTitle = `冲突集合 Smoke ${Date.now()}`
  const newCollectionTitle = `新增集合 Smoke ${Date.now()}`
  const previewScreenshot = '/private/tmp/aivplayer-collection-import-preview.png'
  const appliedScreenshot = '/private/tmp/aivplayer-collection-import-preview-applied.png'
  const historyScreenshot = '/private/tmp/aivplayer-collection-import-history.png'
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const localCollection = await page.evaluate((title) => window.aiv.saveVisionClipCollection({
      title,
      tags: ['smoke', 'local'],
      sortMode: 'duration-desc',
      selections: [{
        sourceId: 'source-import-preview-smoke',
        videoPath: '/tmp/aivplayer-import-preview-smoke-missing.mp4',
        fileName: 'import-preview-smoke-missing.mp4',
        fingerprint: 'import-preview-smoke-fingerprint',
        durationSeconds: 20,
        startSeconds: 2,
        endSeconds: 8,
        evidenceIds: ['import-preview-evidence-local'],
        text: '本地版本',
        evidenceTypes: ['subtitle']
      }]
    }), collectionTitle)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)

    const payload = {
      exportVersion: 2,
      collections: [
        {
          ...localCollection,
          tags: ['smoke', 'incoming'],
          selections: [{
            ...localCollection.selections[0],
            endSeconds: 10,
            evidenceIds: ['import-preview-evidence-incoming'],
            text: '导入版本'
          }]
        },
        {
          ...localCollection,
          id: 'incoming-new-collection-id',
          title: newCollectionTitle,
          tags: ['smoke', 'new'],
          selections: [{
            ...localCollection.selections[0],
            evidenceIds: ['import-preview-evidence-new'],
            text: '新增版本'
          }]
        }
      ]
    }
    await writeFile(importPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

    await app.evaluate(({ dialog }, filePath: string) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
    }, importPath)
    await page.getByRole('button', { name: '导入选段集合', exact: true }).click()

    const preview = page.locator('[role="dialog"]').filter({ hasText: '导入选段集合预览' })
    await preview.waitFor({ timeout: 10_000 })
    const conflictRow = preview.locator('[data-state="conflict"]')
    const newRow = preview.locator('[data-state="new"]')
    if (await conflictRow.count() !== 1 || await newRow.count() !== 1) throw new Error('Import preview did not classify conflict and new collection')
    if (!(await conflictRow.textContent())?.includes('1 个媒体源不可用') || !(await newRow.textContent())?.includes('1 个媒体源不可用')) throw new Error('Import preview did not report unavailable source files')
    const conflictDecision = conflictRow.locator('select')
    if (await conflictDecision.inputValue() !== 'keep-local') throw new Error('Import preview did not default conflicts to keep-local')
    const beforeApply = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (beforeApply.length !== 1 || beforeApply[0]?.tags.join('|') !== 'smoke|local') throw new Error(`Import preview mutated local state: ${JSON.stringify(beforeApply)}`)
    await preview.screenshot({ path: previewScreenshot })

    await conflictDecision.selectOption('overwrite')
    await preview.getByRole('button', { name: '确认导入', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '已导入 1 个集合，覆盖 1 个，跳过 0 个' }).waitFor({ timeout: 10_000 })
    const afterApply = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const overwritten = afterApply.find((collection) => collection.id === localCollection.id)
    const importedNew = afterApply.find((collection) => collection.title === newCollectionTitle)
    if (afterApply.length !== 2 || !overwritten || !importedNew || overwritten.tags.join('|') !== 'smoke|incoming' || overwritten.selections[0]?.endSeconds !== 10 || importedNew.selections[0]?.evidenceIds[0] !== 'import-preview-evidence-new') {
      throw new Error(`Import preview apply persistence mismatch: ${JSON.stringify(afterApply)}`)
    }
    await page.locator('.vision-collections').screenshot({ path: appliedScreenshot })

    const historyAfterApply = await page.evaluate(() => window.aiv.listVisionClipCollectionOperationHistory())
    const importOperation = historyAfterApply.find((operation) => operation.type === 'import' && operation.status === 'active')
    if (historyAfterApply.length !== 1 || !importOperation || importOperation.collectionIds.length !== 2) {
      throw new Error(`Import operation history mismatch after apply: ${JSON.stringify(historyAfterApply)}`)
    }
    const importDetail = await page.evaluate((operationId) => window.aiv.getVisionClipCollectionOperationHistoryDetail(operationId), importOperation.id)
    if (!importDetail || importDetail.beforeCollections.length !== 1 || importDetail.afterCollections.length !== 2) {
      throw new Error(`Import operation detail mismatch: ${JSON.stringify(importDetail)}`)
    }
    await page.locator('.vision-collection-operation-history').waitFor({ timeout: 10_000 })
    await page.locator('.vision-collection-operation-history').screenshot({ path: historyScreenshot })

    const undone = await page.evaluate((operationId) => window.aiv.undoVisionClipCollectionOperation(operationId), importOperation.id)
    if (!undone.success) throw new Error(`Import operation undo failed: ${JSON.stringify(undone)}`)
    const afterUndo = await page.evaluate(() => window.aiv.listVisionClipCollections())
    if (afterUndo.length !== 1 || afterUndo[0]?.id !== localCollection.id || afterUndo[0]?.tags.join('|') !== 'smoke|local') {
      throw new Error(`Import operation undo persistence mismatch: ${JSON.stringify(afterUndo)}`)
    }

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.locator('.vision-collection-operation-history').waitFor({ timeout: 10_000 })
    const redone = await page.evaluate((operationId) => window.aiv.redoVisionClipCollectionOperation(operationId), importOperation.id)
    if (!redone.success) throw new Error(`Import operation redo failed: ${JSON.stringify(redone)}`)
    const afterRedo = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const redoneOverwritten = afterRedo.find((collection) => collection.id === localCollection.id)
    const redoneNew = afterRedo.find((collection) => collection.title === newCollectionTitle)
    if (afterRedo.length !== 2 || !redoneOverwritten || !redoneNew || redoneOverwritten.tags.join('|') !== 'smoke|incoming' || redoneOverwritten.selections[0]?.endSeconds !== 10 || redoneNew.selections[0]?.evidenceIds[0] !== 'import-preview-evidence-new') {
      throw new Error(`Import operation redo persistence mismatch: ${JSON.stringify(afterRedo)}`)
    }

    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection import preview smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Import Preview passed: ${JSON.stringify({ beforeApplyCount: beforeApply.length, importedCount: 1, overwrittenCount: 1, afterApplyCount: afterApply.length, afterUndoCount: afterUndo.length, afterRedoCount: afterRedo.length, previewScreenshot, appliedScreenshot, historyScreenshot })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
