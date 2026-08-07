import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { access, appendFile, chmod, copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { connect } from '@lancedb/lancedb'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

type SmokeSession = {
  app: ElectronApplication
  page: Page
  errors: string[]
}

async function waitForFile(filePath: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await access(filePath)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  throw new Error(`Smoke marker was not created: ${filePath}`)
}

async function launchPlayer(userDataDirectory: string, mediaPath: string, tesseractPath: string, markerPath: string): Promise<SmokeSession> {
  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
    env: {
      ...process.env,
      HOME: userDataDirectory,
      AIVPLAYER_TESSERACT_PATH: tesseractPath,
      AIVPLAYER_TESSERACT_LANG: 'eng',
      AIVPLAYER_EVIDENCE_SMOKE_MARKER: markerPath
    }
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root', { timeout: 15_000 })
  await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
  return { app, page, errors }
}

async function installFakeTesseract(directory: string, markerPath: string): Promise<string> {
  const path = join(directory, 'fake-tesseract.sh')
  await writeFile(path, [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then',
    "  printf 'tesseract 5.0 smoke\\n'",
    '  exit 0',
    'fi',
    ': > "$AIVPLAYER_EVIDENCE_SMOKE_MARKER"',
    'sleep 1',
    "printf 'Smoke OCR text\\n'",
    ''
  ].join('\n'), 'utf8')
  await chmod(path, 0o755)
  await rm(markerPath, { force: true })
  return path
}

async function startOcr(page: Page, mediaPath: string): Promise<unknown> {
  return page.evaluate((path) => window.aiv.startMediaEvidenceTask({
    kind: 'ocr',
    mediaPath: path,
    inputHash: `smoke-input-${path}`,
    ranges: [{ startSeconds: 0.5, endSeconds: 1.5 }],
    maxRetries: 0
  }), mediaPath)
}

async function startOcrFromUi(page: Page): Promise<void> {
  await page.locator('.panel-tab').nth(4).click()
  const task = page.locator('[data-testid="vision-ocr-task"]')
  await task.waitFor({ timeout: 10_000 })
  const startButton = page.locator('[data-testid="vision-ocr-start-button"]')
  await startButton.waitFor({ timeout: 10_000 })
  await page.waitForFunction(() => !(document.querySelector('[data-testid="vision-ocr-start-button"]') as HTMLButtonElement | null)?.disabled, undefined, { timeout: 15_000 })
  await startButton.click()
  await page.locator('[data-testid="vision-ocr-task"][data-persistence-status="persisted"]').waitFor({ timeout: 20_000 })
}

async function searchOcrAndLocate(page: Page): Promise<{ evidenceId: string; currentTime: number }> {
  const searchInput = page.locator('.vision-text-search input')
  await searchInput.fill('Smoke OCR text')
  await page.locator('.vision-text-search .vision-search-button').click()
  const result = page.locator('.vision-result[data-evidence-type="ocr"]')
  await result.waitFor({ timeout: 30_000 })
  const evidenceId = await result.getAttribute('data-evidence-id')
  const matchedText = await result.locator('.vision-result-match').textContent()
  if (!evidenceId || matchedText?.trim() !== 'Smoke OCR text') throw new Error(`OCR search result mismatch: ${JSON.stringify({ evidenceId, matchedText })}`)
  await result.click()
  await page.waitForFunction(() => {
    const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
    return video !== null && video.currentTime >= 0.45 && video.currentTime <= 1.55
  }, undefined, { timeout: 15_000 })
  const currentTime = await page.locator('video.video-surface').evaluate((video) => (video as HTMLVideoElement).currentTime)
  return { evidenceId, currentTime }
}

async function seedVisualEvidence(userDataDirectory: string, mediaPath: string): Promise<void> {
  const database = await connect(join(userDataDirectory, 'library', 'vision', 'lancedb'))
  const table = await database.openTable('video_evidence')
  await table.add([{
    id: 'smoke-visual-evidence',
    source_id: 'smoke-source',
    video_path: mediaPath,
    file_name: 'stable.mp4',
    evidence_type: 'visual',
    start_seconds: 0,
    end_seconds: 1,
    text: '',
    frame_id: 'smoke-frame',
    thumbnail_path: '',
    confidence: null,
    source_fingerprint: 'smoke-visual-fingerprint',
    model_id: 'smoke-model',
    model_variant: 'v1',
    generated_at: Date.now()
  }])
}

async function readEvidenceRows(userDataDirectory: string): Promise<Array<Record<string, unknown>>> {
  const database = await connect(join(userDataDirectory, 'library', 'vision', 'lancedb'))
  const table = await database.openTable('video_evidence')
  return await table.query().toArray() as unknown as Array<Record<string, unknown>>
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-evidence-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-evidence-user-data-'))
  const stableMediaPath = join(smokeDirectory, 'stable.mp4')
  const staleMediaPath = join(smokeDirectory, 'stale.mp4')
  const markerPath = join(smokeDirectory, 'tesseract.started')
  await copyFile(sourceMediaPath, stableMediaPath)
  await copyFile(sourceMediaPath, staleMediaPath)
  const tesseractPath = await installFakeTesseract(smokeDirectory, markerPath)
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null

  try {
    const first = await launchPlayer(userDataDirectory, stableMediaPath, tesseractPath, markerPath)
    firstApp = first.app
    const capabilities = await first.page.evaluate(() => window.aiv.getMediaEvidenceCapabilities())
    if (!capabilities.ocr.available) throw new Error(`OCR capability is unavailable: ${JSON.stringify(capabilities)}`)

    await startOcrFromUi(first.page)
    const stablePersistenceStatus = await first.page.locator('[data-testid="vision-ocr-task"]').getAttribute('data-persistence-status')
    if (stablePersistenceStatus !== 'persisted') throw new Error(`Stable OCR persistence mismatch: ${stablePersistenceStatus}`)
    const locatedOcr = await searchOcrAndLocate(first.page)
    const screenshotPath = join(userDataDirectory, 'aivplayer-smoke-evidence-ocr.png')
    await first.page.screenshot({ path: screenshotPath, fullPage: false })
    await first.app.close()
    firstApp = null
    await seedVisualEvidence(userDataDirectory, stableMediaPath)

    await rm(markerPath, { force: true })
    const second = await launchPlayer(userDataDirectory, stableMediaPath, tesseractPath, markerPath)
    secondApp = second.app
    const stalePromise = startOcr(second.page, staleMediaPath)
    await waitForFile(markerPath)
    await appendFile(staleMediaPath, Buffer.from('changed-after-task-start'))
    const staleResult = await stalePromise as { status?: string; persistenceStatus?: string; persistedArtifactCount?: number }
    if (staleResult.status !== 'completed' || staleResult.persistenceStatus !== 'skipped-stale' || staleResult.persistedArtifactCount !== 0) {
      throw new Error(`Stale OCR persistence mismatch: ${JSON.stringify(staleResult)}`)
    }
    await second.app.close()
    secondApp = null

    const rows = await readEvidenceRows(userDataDirectory)
    const ocrRows = rows.filter((row) => row.evidence_type === 'ocr')
    const visualRows = rows.filter((row) => row.id === 'smoke-visual-evidence')
    if (ocrRows.length !== 1 || visualRows.length !== 1 || ocrRows[0]?.text !== 'Smoke OCR text' || ocrRows[0]?.video_path !== stableMediaPath || rows.some((row) => row.video_path === staleMediaPath)) {
      throw new Error(`Evidence table contents mismatch: ${JSON.stringify(rows)}`)
    }
    if (first.errors.length > 0 || second.errors.length > 0) throw new Error(`Renderer errors during evidence smoke: ${[...first.errors, ...second.errors].join('\n')}`)
    console.log(`Evidence task smoke passed: ${JSON.stringify({ capabilities, stablePersistence: stablePersistenceStatus, locatedOcr, stalePersistence: staleResult.persistenceStatus, evidenceRows: rows.length, ocrRows: ocrRows.length, visualRows: visualRows.length, screenshotPath })}`)
  } finally {
    await firstApp?.close().catch(() => undefined)
    await secondApp?.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
