import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { connect } from '@lancedb/lancedb'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const fixtureCount = 120

function evidenceRow(index: number): Record<string, unknown> {
  return {
    id: `full-export-evidence-${index}`,
    source_id: 'full-export-source',
    video_path: mediaPath,
    file_name: basename(mediaPath),
    evidence_type: 'ocr',
    start_seconds: index,
    end_seconds: index + 0.8,
    text: `全库导出 Smoke 关键字 ${index}`,
    frame_id: `full-export-frame-${index}`,
    thumbnail_path: '',
    confidence: 0.9,
    box_xmin: 0,
    box_ymin: 0,
    box_xmax: 0,
    box_ymax: 0,
    source_fingerprint: `${mediaPath}:full-export-smoke`,
    model_id: 'smoke-model',
    model_variant: 'smoke-variant',
    generated_at: 1_000 + index
  }
}

async function seedEvidence(userDataDirectory: string): Promise<void> {
  const databaseDirectory = join(userDataDirectory, 'library', 'vision', 'lancedb')
  await mkdir(databaseDirectory, { recursive: true })
  const database = await connect(databaseDirectory)
  await database.createTable('video_evidence', Array.from({ length: fixtureCount }, (_, index) => evidenceRow(index)))
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
  await input.fill('全库导出 Smoke 关键字')
  await button.click()
  await page.waitForFunction(() => {
    const resultCount = document.querySelectorAll('.vision-result-row').length
    const errorVisible = document.querySelector('[role="alert"]') !== null
    return resultCount > 0 || errorVisible
  }, undefined, { timeout: 30_000 })
  if (await page.locator('[role="alert"]').count() > 0) throw new Error(`Vision text search returned an error: ${await page.locator('[role="alert"]').textContent()}`)
  await page.locator('.vision-result-row').first().waitFor({ timeout: 30_000 })
}

async function readExportFile(filePath: string): Promise<string> {
  const deadline = Date.now() + 15_000
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      return await readFile(filePath, 'utf8')
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`导出文件不可读：${filePath}`)
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-search-full-export-user-data-'))
  const outputPath = join(userDataDirectory, 'full-vision-results.json')
  let app: ElectronApplication | null = null

  try {
    await seedEvidence(userDataDirectory)
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await page.getByRole('tab', { name: '影视库搜索' }).click()
    await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
    await app.evaluate(({ dialog }, filePath: string) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, outputPath)
    await waitForSearch(page)

    const currentCount = await page.locator('.vision-result-row').count()
    if (currentCount !== 24) throw new Error(`Vision current result window mismatch: ${JSON.stringify({ currentCount, expected: 24 })}`)
    await page.locator('.vision-result-row input[type="checkbox"]').first().check()
    const selectedCount = await page.locator('.vision-result-row input[type="checkbox"]:checked').count()
    if (selectedCount !== 1) throw new Error(`Vision current selection mismatch: ${JSON.stringify({ selectedCount })}`)

    await page.getByRole('button', { name: '导出 JSON', exact: true }).nth(1).click()
    const exported = JSON.parse(await readExportFile(outputPath)) as { exportVersion?: number; results?: unknown[] }
    const task = await page.waitForFunction(async () => {
      const events = await window.aiv.getTaskCenterEvents()
      return events.find((event) => event.kind === 'vision-export' && event.status === 'completed') ?? null
    }, undefined, { timeout: 15_000 })
    const completedTask = await task.jsonValue() as { status?: string; message?: string } | null
    if (completedTask?.status !== 'completed' || exported.exportVersion !== 1 || exported.results?.length !== fixtureCount) {
      throw new Error(`Vision full export mismatch: ${JSON.stringify({ completedTask, exportVersion: exported.exportVersion, exportedCount: exported.results?.length, selectedCount })}`)
    }

    if (session.errors.length > 0) throw new Error(`Renderer errors during vision full export smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Search Full Export passed: ${JSON.stringify({ currentCount, selectedCount, fullExportCount: exported.results.length, taskCompleted: true })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
