import { access, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { connect } from '@lancedb/lancedb'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const fixtureCount = 20_000

function evidenceRow(index: number): Record<string, unknown> {
  return {
    id: `cancel-export-evidence-${index}`,
    source_id: 'cancel-export-source',
    video_path: mediaPath,
    file_name: basename(mediaPath),
    evidence_type: 'ocr',
    start_seconds: index,
    end_seconds: index + 0.8,
    text: `取消导出 Smoke 关键字 ${index}`,
    frame_id: `cancel-export-frame-${index}`,
    thumbnail_path: '',
    confidence: 0.9,
    box_xmin: 0,
    box_ymin: 0,
    box_xmax: 0,
    box_ymax: 0,
    source_fingerprint: `${mediaPath}:cancel-export-smoke`,
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
  await input.fill('取消导出 Smoke 关键字')
  await button.click()
  await page.waitForFunction(() => document.querySelectorAll('.vision-result-row').length > 0 || document.querySelector('[role="alert"]') !== null, undefined, { timeout: 30_000 })
  if (await page.locator('[role="alert"]').count() > 0) throw new Error(`Vision text search returned an error: ${await page.locator('[role="alert"]').textContent()}`)
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function waitForCancelledManifest(manifestPath: string, outputPath: string): Promise<{ taskId?: string; outputPath?: string; status?: string }> {
  const deadline = Date.now() + 15_000
  let lastTask: { taskId?: string; outputPath?: string; status?: string } | undefined
  while (Date.now() < deadline) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { tasks?: Array<{ taskId?: string; outputPath?: string; status?: string }> }
      lastTask = manifest.tasks?.find((item) => item.outputPath === outputPath)
      if (lastTask?.status === 'cancelled') return lastTask
    } catch {
      // Atomic manifest replacement can briefly make the file unavailable.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return lastTask ?? {}
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-search-export-cancel-user-data-'))
  const outputPath = join(userDataDirectory, 'cancelled-vision-results.json')
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

    await page.getByRole('button', { name: '导出 JSON', exact: true }).nth(1).click()
    const cancelButton = page.locator('[data-testid="task-center-cancel"]').first()
    await cancelButton.waitFor({ timeout: 30_000 })
    await cancelButton.click()
    await page.waitForFunction(async () => {
      const events = await window.aiv.getTaskCenterEvents()
      return events.some((event) => event.kind === 'vision-export' && ['cancelled', 'completed', 'failed'].includes(event.status))
    }, undefined, { timeout: 30_000 })

    const task = await waitForCancelledManifest(join(userDataDirectory, 'vision-search-exports.json'), outputPath)
    const taskCenterEvents = await page.evaluate(() => window.aiv.getTaskCenterEvents())
    const directoryEntries = await readdir(userDataDirectory)
    const outputPresent = await pathExists(outputPath)
    const assemblyPresent = directoryEntries.some((entry) => entry.startsWith('cancelled-vision-results.json.') && entry.endsWith('.assembling'))
    if (task?.status !== 'cancelled' || outputPresent || assemblyPresent) {
      throw new Error(`Vision export cancellation mismatch: ${JSON.stringify({ task, taskCenterEvents, outputPresent, assemblyPresent })}`)
    }

    if (session.errors.length > 0) throw new Error(`Renderer errors during vision export cancellation smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Search Export Cancel passed: ${JSON.stringify({ taskStatus: task.status, outputPresent, assemblyPresent, taskCenterCancelled: true })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
