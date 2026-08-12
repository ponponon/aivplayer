import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const execFileAsync = promisify(execFile)
const sourceImagePath = process.argv[2] ?? '/Users/ponponon/Pictures/loopy.jpg'
const batchEntries = [
  { labelId: 'custom-batch-a', name: '批量标签甲', query: 'a batch test character A' },
  { labelId: 'custom-batch-b', name: '批量标签乙', query: 'a batch test character B' },
  { labelId: 'custom-batch-target', name: '批量目标标签', query: 'a batch test target' }
] as const

async function createVideo(outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-loop', '1', '-i', sourceImagePath,
    '-t', '2', '-vf', 'scale=640:-2,format=yuv420p',
    '-r', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputPath
  ], { maxBuffer: 4 * 1024 * 1024 })
}

async function seedCatalog(userDataDirectory: string): Promise<void> {
  const catalogPath = join(userDataDirectory, 'library', 'vision-entity-catalog.json')
  await mkdir(join(userDataDirectory, 'library'), { recursive: true })
  await writeFile(catalogPath, JSON.stringify({
    schemaVersion: 2,
    updatedAt: 1,
    entries: batchEntries.map(({ labelId, name, query }) => ({
      labelId,
      kind: 'custom',
      defaultName: name,
      name,
      query,
      aliases: [],
      hidden: false,
      mergedInto: null
    }))
  }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
}

async function launchPlayer(userDataDirectory: string, mediaPath: string): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
    env: { ...process.env, HOME: userDataDirectory }
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  await page.waitForLoadState('domcontentloaded')
  await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
  return { app, page, errors }
}

async function openVisionPanel(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '影视库搜索' }).click()
  await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
  await page.locator('.vision-entity-catalog').waitFor({ timeout: 10_000 })
  await page.locator('.vision-entity-catalog-row .vision-entity-catalog-meta > strong').filter({ hasText: batchEntries[0].name }).waitFor({ timeout: 10_000 })
}

async function getBatchCatalog(page: Page): Promise<{ entries: Array<{ labelId: string; name: string; hidden: boolean; mergedInto: string | null }> }> {
  return page.evaluate(() => window.aiv.getVisionEntityCatalog())
}

async function selectBatchRows(page: Page): Promise<void> {
  for (const entry of batchEntries.slice(0, 2)) {
    await page.getByRole('checkbox', { name: `选择标签：${entry.name}`, exact: true }).check()
  }
  await page.getByText('已选择 2 个标签', { exact: true }).waitFor({ timeout: 5_000 })
}

async function runSmoke(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-entity-catalog-batch-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-entity-catalog-batch-user-data-'))
  const mediaPath = join(smokeDirectory, 'entity-catalog-batch.mp4')
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null

  try {
    await createVideo(mediaPath)
    await seedCatalog(userDataDirectory)

    const firstSession = await launchPlayer(userDataDirectory, mediaPath)
    firstApp = firstSession.app
    await openVisionPanel(firstSession.page)

    await selectBatchRows(firstSession.page)
    await firstSession.page.getByRole('button', { name: '批量隐藏' }).click()
    await firstSession.page.waitForFunction(() => {
      const names = ['批量标签甲', '批量标签乙']
      return names.every((name) => [...document.querySelectorAll('.vision-entity-catalog-row')].some((row) => row.classList.contains('is-hidden') && row.querySelector('.vision-entity-catalog-meta > strong')?.textContent?.trim() === name))
    }, undefined, { timeout: 5_000 })
    const hiddenCatalog = await getBatchCatalog(firstSession.page)
    const hiddenEntries = hiddenCatalog.entries.filter((entry) => entry.labelId === 'custom-batch-a' || entry.labelId === 'custom-batch-b')
    if (hiddenEntries.length !== 2 || hiddenEntries.some((entry) => !entry.hidden)) throw new Error(`批量隐藏未生效：${JSON.stringify(hiddenCatalog)}`)

    await selectBatchRows(firstSession.page)
    await firstSession.page.getByRole('button', { name: '批量显示' }).click()
    await firstSession.page.waitForFunction(() => {
      const names = ['批量标签甲', '批量标签乙']
      return names.every((name) => [...document.querySelectorAll('.vision-entity-catalog-row')].some((row) => !row.classList.contains('is-hidden') && row.querySelector('.vision-entity-catalog-meta > strong')?.textContent?.trim() === name))
    }, undefined, { timeout: 5_000 })
    const shownCatalog = await getBatchCatalog(firstSession.page)
    const shownEntries = shownCatalog.entries.filter((entry) => entry.labelId === 'custom-batch-a' || entry.labelId === 'custom-batch-b')
    if (shownEntries.length !== 2 || shownEntries.some((entry) => entry.hidden)) throw new Error(`批量显示未生效：${JSON.stringify(shownCatalog)}`)

    await selectBatchRows(firstSession.page)
    await firstSession.page.getByRole('combobox', { name: '批量合并目标' }).selectOption('custom-batch-target')
    await firstSession.page.getByRole('button', { name: '批量合并' }).click()
    await firstSession.page.waitForFunction(() => {
      const rows = [...document.querySelectorAll('.vision-entity-catalog-row')]
      return ['批量标签甲', '批量标签乙'].every((name) => rows.some((row) => row.querySelector('.vision-entity-catalog-meta > strong')?.textContent?.trim() === name && row.textContent?.includes('已合并到：批量目标标签')))
    }, undefined, { timeout: 5_000 })
    const mergedCatalog = await getBatchCatalog(firstSession.page)
    const mergedEntries = mergedCatalog.entries.filter((entry) => entry.labelId === 'custom-batch-a' || entry.labelId === 'custom-batch-b')
    if (mergedEntries.length !== 2 || mergedEntries.some((entry) => entry.mergedInto !== 'custom-batch-target' || entry.hidden)) throw new Error(`批量合并未生效：${JSON.stringify(mergedCatalog)}`)

    const catalogPath = join(userDataDirectory, 'library', 'vision-entity-catalog.json')
    const persistedCatalog = JSON.parse(await readFile(catalogPath, 'utf8')) as { entries?: Array<{ labelId: string; mergedInto: string | null }> }
    const persistedEntries = (persistedCatalog.entries ?? []).filter((entry) => entry.labelId === 'custom-batch-a' || entry.labelId === 'custom-batch-b')
    if (persistedEntries.length !== 2 || persistedEntries.some((entry) => entry.mergedInto !== 'custom-batch-target')) throw new Error(`批量合并未写入目录文件：${JSON.stringify(persistedCatalog)}`)
    console.log(`Entity catalog batch actions persisted: ${JSON.stringify({ hiddenRestored: true, shownRestored: true, mergedEntries: mergedEntries.map((entry) => entry.labelId), target: 'custom-batch-target' })}`)

    await firstApp.close()
    firstApp = null
    const secondSession = await launchPlayer(userDataDirectory, mediaPath)
    secondApp = secondSession.app
    await openVisionPanel(secondSession.page)
    const restoredCatalog = await getBatchCatalog(secondSession.page)
    const restoredEntries = restoredCatalog.entries.filter((entry) => entry.labelId === 'custom-batch-a' || entry.labelId === 'custom-batch-b')
    if (restoredEntries.length !== 2 || restoredEntries.some((entry) => entry.hidden || entry.mergedInto !== 'custom-batch-target')) throw new Error(`重启后批量目录未恢复：${JSON.stringify(restoredCatalog)}`)

    const rendererErrors = [...firstSession.errors, ...secondSession.errors]
    if (rendererErrors.length > 0) throw new Error(`Renderer errors during entity catalog batch smoke:\n${rendererErrors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Entity Catalog Batch passed: ${JSON.stringify({ hidden: true, shown: true, merged: true, restartRestored: true })}`)
  } finally {
    if (secondApp) await secondApp.close().catch(() => undefined)
    if (firstApp) await firstApp.close().catch(() => undefined)
    await rm(smokeDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
