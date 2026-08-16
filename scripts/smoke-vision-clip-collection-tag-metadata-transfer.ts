import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-clip-collection-tag-metadata-transfer-'))
  const exportPath = join(userDataDirectory, 'tag-metadata-backup.json')
  const prefix = `标签目录传输 Smoke ${Date.now()}`
  const titles = [`传输海边 ${prefix}`, `传输采访 ${prefix}`, `传输项目 ${prefix}`]
  const tags = ['海边', '采访', '项目']
  let app: ElectronApplication | null = null

  try {
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await openVisionPanel(page)

    const originals = await page.evaluate(({ nextTitles, nextTags }) => Promise.all(nextTitles.map((title, index) => window.aiv.saveVisionClipCollection({
      title,
      tags: [nextTags[index]!],
      sortMode: 'source-time',
      selections: [{
        sourceId: 'source-tag-metadata-transfer-smoke',
        videoPath: '/tmp/aivplayer-tag-metadata-transfer-smoke-missing.mp4',
        fileName: 'tag-metadata-transfer-smoke-missing.mp4',
        fingerprint: `tag-metadata-transfer-smoke-${index}`,
        durationSeconds: 48,
        startSeconds: index + 1,
        endSeconds: index + 9,
        evidenceIds: [`tag-metadata-transfer-evidence-${index + 1}`],
        text: `标签目录传输验证 ${index + 1}`,
        evidenceTypes: ['subtitle']
      }]
    }))), { nextTitles: titles, nextTags: tags })
    const seaside = await page.evaluate(() => window.aiv.updateVisionClipCollectionTagMetadata({ tag: '海边', parentTag: '项目', color: '#AABBCC', textColor: '#101010', note: '外景素材标签', isFavorite: true }))
    if (!seaside.success) throw new Error(`Unable to prepare seaside metadata: ${seaside.message}`)
    const interview = await page.evaluate(() => window.aiv.updateVisionClipCollectionTagMetadata({ tag: '采访', color: '#112233', note: '对话素材标签' }))
    if (!interview.success) throw new Error(`Unable to prepare interview metadata: ${interview.message}`)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openVisionPanel(page)
    await page.getByRole('button', { name: '导出标签目录', exact: true }).waitFor({ timeout: 10_000 })

    await app.evaluate(({ dialog }, filePath: string) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, exportPath)
    await page.getByRole('button', { name: '导出标签目录', exact: true }).click()
    await page.getByText('已导出 2 个标签的元数据', { exact: true }).waitFor({ timeout: 10_000 })
    const exportedManifest = JSON.parse(await readFile(exportPath, 'utf8')) as { exportVersion: number; metadata: Array<Record<string, unknown>> }
    if (exportedManifest.exportVersion !== 1 || exportedManifest.metadata.length !== 2) throw new Error(`Tag metadata export manifest mismatch: ${JSON.stringify(exportedManifest)}`)
    await writeFile(exportPath, JSON.stringify({ ...exportedManifest, metadata: [...exportedManifest.metadata, { tag: '不存在', parentTag: '', color: '', textColor: '', note: '应该跳过', isFavorite: true }] }, null, 2))

    const changed = await page.evaluate(() => window.aiv.updateVisionClipCollectionTagMetadata({ tag: '海边', parentTag: '', color: '#000000', textColor: '#ffffff', note: '临时修改', isFavorite: false }))
    if (!changed.success) throw new Error(`Unable to change metadata before import: ${changed.message}`)
    const changedInterview = await page.evaluate(() => window.aiv.updateVisionClipCollectionTagMetadata({ tag: '采访', color: '#334455', note: '本地采访修改', isFavorite: false }))
    if (!changedInterview.success) throw new Error(`Unable to change interview metadata before import: ${changedInterview.message}`)
    await app.evaluate(({ dialog }, filePath: string) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
    }, exportPath)
    await page.getByRole('button', { name: '导入标签目录', exact: true }).click()
    await page.getByRole('dialog', { name: '导入标签目录预览' }).waitFor({ timeout: 10_000 })
    await page.getByRole('combobox', { name: '导入冲突处理: 海边' }).selectOption('overwrite')
    await page.getByRole('combobox', { name: '导入冲突处理: 采访' }).selectOption('keep-local')
    await page.getByRole('button', { name: '应用导入', exact: true }).click()
    await page.getByText('已导入 1 个标签元数据，跳过 2 个标签', { exact: true }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '海边 · 1 个集合', exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('textarea[aria-label="备注"]') as HTMLTextAreaElement | null)?.value === '外景素材标签')

    const metadata = await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())
    const seasideMetadata = metadata.find((item) => item.tag === '海边')
    if (!seasideMetadata || seasideMetadata.parentTag !== '项目' || seasideMetadata.color !== '#aabbcc' || seasideMetadata.textColor !== '#101010' || seasideMetadata.note !== '外景素材标签' || !seasideMetadata.isFavorite) throw new Error(`Imported seaside metadata mismatch: ${JSON.stringify(seasideMetadata)}`)
    const interviewMetadata = metadata.find((item) => item.tag === '采访')
    if (!interviewMetadata || interviewMetadata.color !== '#334455' || interviewMetadata.note !== '本地采访修改' || interviewMetadata.isFavorite) throw new Error(`Keep-local interview metadata mismatch: ${JSON.stringify(interviewMetadata)}`)
    if (metadata.some((item) => item.tag === '不存在')) throw new Error(`Unused metadata should be skipped: ${JSON.stringify(metadata)}`)
    const storedCollections = await page.evaluate(() => window.aiv.listVisionClipCollections())
    const originalTagShape = originals.map((collection) => ({ id: collection.id, tags: collection.tags })).sort((left, right) => left.id.localeCompare(right.id))
    const storedTagShape = storedCollections.map((collection) => ({ id: collection.id, tags: collection.tags })).sort((left, right) => left.id.localeCompare(right.id))
    if (JSON.stringify(storedTagShape) !== JSON.stringify(originalTagShape)) throw new Error(`Metadata transfer should not change collection tags: ${JSON.stringify(storedTagShape)}`)
    if (screenshotPath) {
      await page.locator('.vision-collection-tag-manager').scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }
    const changedAgain = await page.evaluate(() => window.aiv.updateVisionClipCollectionTagMetadata({ tag: '海边', note: '再次本地修改' }))
    if (!changedAgain.success) throw new Error(`Unable to prepare skip decision: ${changedAgain.message}`)
    await page.getByRole('button', { name: '导入标签目录', exact: true }).click()
    await page.getByRole('dialog', { name: '导入标签目录预览' }).waitFor({ timeout: 10_000 })
    await page.getByRole('combobox', { name: '导入冲突处理: 海边' }).selectOption('skip')
    await page.getByRole('combobox', { name: '导入冲突处理: 采访' }).selectOption('keep-local')
    await page.getByRole('button', { name: '应用导入', exact: true }).click()
    await page.getByText('已导入 0 个标签元数据，跳过 3 个标签', { exact: true }).waitFor({ timeout: 10_000 })
    const skippedMetadata = await page.evaluate(() => window.aiv.listVisionClipCollectionTagMetadata())
    if (skippedMetadata.find((item) => item.tag === '海边')?.note !== '再次本地修改') throw new Error(`Skip decision should preserve local metadata: ${JSON.stringify(skippedMetadata)}`)
    if (session.errors.length > 0) throw new Error(`Renderer errors during clip collection tag metadata transfer smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Clip Collection Tag Metadata Transfer passed: ${JSON.stringify({ exportedCount: exportedManifest.metadata.length, importedCount: 1, skippedCount: 2, overwriteApplied: true, keepLocalApplied: true, skipApplied: true, unusedSkipped: true, tagsUnchanged: true, screenshotPath: screenshotPath ?? null })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
