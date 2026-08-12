import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { connect } from '@lancedb/lancedb'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

async function seedEvidence(userDataDirectory: string): Promise<void> {
  const databaseDirectory = join(userDataDirectory, 'library', 'vision', 'lancedb')
  await mkdir(databaseDirectory, { recursive: true })
  const database = await connect(databaseDirectory)
  const fileName = basename(mediaPath)
  await database.createTable('video_evidence', [
    {
      id: 'export-evidence-1',
      source_id: 'export-source',
      video_path: mediaPath,
      file_name: fileName,
      evidence_type: 'ocr',
      start_seconds: 1,
      end_seconds: 2,
      text: '视觉导出 Smoke 第一条',
      frame_id: 'export-frame-1',
      thumbnail_path: '',
      confidence: 0.9,
      box_xmin: 0,
      box_ymin: 0,
      box_xmax: 0,
      box_ymax: 0,
      source_fingerprint: `${mediaPath}:export-smoke`,
      model_id: 'smoke-model',
      model_variant: 'smoke-variant',
      generated_at: 1
    },
    {
      id: 'export-evidence-2',
      source_id: 'export-source',
      video_path: mediaPath,
      file_name: fileName,
      evidence_type: 'ocr',
      start_seconds: 3,
      end_seconds: 4,
      text: '视觉导出 Smoke 第二条',
      frame_id: 'export-frame-2',
      thumbnail_path: '',
      confidence: 0.8,
      box_xmin: 0,
      box_ymin: 0,
      box_xmax: 0,
      box_ymax: 0,
      source_fingerprint: `${mediaPath}:export-smoke`,
      model_id: 'smoke-model',
      model_variant: 'smoke-variant',
      generated_at: 2
    }
  ])
}

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
  await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
  return { app, page, errors }
}

async function waitForSearch(page: Page): Promise<void> {
  const input = page.locator('.vision-text-search input')
  const button = page.locator('.vision-text-search .vision-search-button')
  await input.fill('视觉导出 Smoke')
  await button.click()
  await page.waitForFunction(() => (document.querySelector('.vision-text-search .vision-search-button') as HTMLButtonElement | null)?.disabled === true, undefined, { timeout: 10_000 })
  await page.waitForFunction(() => (document.querySelector('.vision-text-search .vision-search-button') as HTMLButtonElement | null)?.disabled === false, undefined, { timeout: 30_000 })
  await page.locator('.vision-result-row').first().waitFor({ timeout: 30_000 })
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-search-export-user-data-'))
  const jsonPath = join(userDataDirectory, 'vision-results.json')
  const csvPath = join(userDataDirectory, 'vision-results.csv')
  let app: ElectronApplication | null = null

  try {
    await seedEvidence(userDataDirectory)
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await page.getByRole('tab', { name: '影视库搜索' }).click()
    await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
    await app.evaluate(({ dialog }, paths: string[]) => {
      let callIndex = 0
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths[Math.min(callIndex++, paths.length - 1)] })
    }, [jsonPath, csvPath])
    await waitForSearch(page)

    const exportJsonButton = page.getByRole('button', { name: '导出 JSON', exact: true }).first()
    await exportJsonButton.click()
    await page.waitForFunction((path) => window.aiv.readFileContent(path).then((text) => text.includes('"exportVersion": 1')), jsonPath, { timeout: 15_000 })
    const json = JSON.parse(await page.evaluate((path) => window.aiv.readFileContent(path), jsonPath)) as { exportVersion?: number; results?: Array<{ evidenceId?: string }> }
    if (json.exportVersion !== 1 || json.results?.length !== 2) throw new Error(`Vision JSON export mismatch: ${JSON.stringify(json)}`)

    await page.locator('.vision-result-row input[type="checkbox"]').first().check()
    await page.getByRole('button', { name: '导出 CSV', exact: true }).first().click()
    await page.waitForFunction((path) => window.aiv.readFileContent(path).then((text) => text.split('\n').length >= 3), csvPath, { timeout: 15_000 })
    const csv = await page.evaluate((path) => window.aiv.readFileContent(path), csvPath)
    const csvLines = csv.trim().split('\n')
    if (!csvLines[0]?.includes('evidence_id,evidence_type') || csvLines.length !== 2 || !csv.includes('export-evidence-1') || csv.includes('export-evidence-2')) {
      throw new Error(`Vision CSV selected export mismatch: ${JSON.stringify({ csvLines })}`)
    }

    if (session.errors.length > 0) throw new Error(`Renderer errors during vision search export smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Search Export passed: ${JSON.stringify({ jsonResultCount: json.results.length, csvSelectedCount: 1, jsonPath, csvPath })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
