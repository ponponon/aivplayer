import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { connect } from '@lancedb/lancedb'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

async function seedObjectEvidence(userDataDirectory: string): Promise<void> {
  const databaseDirectory = join(userDataDirectory, 'library', 'vision', 'lancedb')
  await mkdir(databaseDirectory, { recursive: true })
  const database = await connect(databaseDirectory)
  const rows = [
    { id: 'object-condition-person-high', text: 'person', confidence: 0.92, frame_id: 'frame-person-high', start_seconds: 1 },
    { id: 'object-condition-person-low', text: 'person', confidence: 0.6, frame_id: 'frame-person-low', start_seconds: 2 },
    { id: 'object-condition-vehicle-high', text: 'vehicle', confidence: 0.95, frame_id: 'frame-vehicle-high', start_seconds: 3 }
  ].map((item) => ({
    id: item.id,
    source_id: 'object-condition-source',
    video_path: mediaPath,
    file_name: 'object-condition-search.mp4',
    evidence_type: 'object',
    start_seconds: item.start_seconds,
    end_seconds: item.start_seconds + 1,
    text: item.text,
    frame_id: item.frame_id,
    thumbnail_path: '',
    confidence: item.confidence,
    box_xmin: 10,
    box_ymin: 20,
    box_xmax: 100,
    box_ymax: 120,
    source_fingerprint: `${mediaPath}:object-condition-smoke`,
    model_id: 'smoke-object-model',
    model_variant: 'smoke-object-variant',
    generated_at: 1_000 + item.start_seconds
  }))
  await database.createTable('video_evidence', rows)
  const savedSearchPath = join(userDataDirectory, 'library', 'vision-saved-searches.json')
  await writeFile(savedSearchPath, `${JSON.stringify({
    schemaVersion: 1,
    searches: [{
      id: 'object-condition-saved-search',
      name: '全库物体条件 Smoke',
      query: 'person',
      mode: 'hybrid',
      evidenceTypes: ['object'],
      objectDetectionFilter: { labelQuery: 'person', minimumScore: 0.8, categoryLabels: ['person'] },
      createdAt: 1_000,
      updatedAt: 1_000
    }]
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

async function launchPlayer(userDataDirectory: string): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
    env: { ...process.env, HOME: userDataDirectory }
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
  return { app, page, errors }
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-object-condition-search-user-data-'))
  let app: ElectronApplication | null = null

  try {
    await seedObjectEvidence(userDataDirectory)
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    await session.page.getByRole('tab', { name: '影视库搜索' }).click()
    await session.page.locator('.vision-panel').waitFor({ timeout: 10_000 })
    const savedSearch = session.page.locator('.vision-saved-search-button').filter({ hasText: '全库物体条件 Smoke' })
    await savedSearch.waitFor({ timeout: 10_000 })
    await savedSearch.click()
    await session.page.locator('.vision-result-row').first().waitFor({ timeout: 30_000 })

    const visibleRows = await session.page.locator('.vision-result-row').count()
    const visibleTypes = await session.page.locator('.vision-result-row .vision-result').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-evidence-type')))
    const results = await session.page.evaluate(() => window.aiv.searchVisionText({
      query: 'person',
      limit: 24,
      mode: 'hybrid',
      evidenceTypes: ['object'],
      objectDetectionFilter: { labelQuery: 'person', minimumScore: 0.8, categoryLabels: ['person'] }
    }))
    if (visibleRows !== 1 || visibleTypes[0] !== 'object' || results.length !== 1 || results[0]?.evidenceId !== 'object-condition-person-high' || results[0]?.confidence !== 0.92) {
      throw new Error(`Object condition search mismatch: ${JSON.stringify({ visibleRows, visibleTypes, results })}`)
    }
    const savedSearchSummary = await savedSearch.textContent()
    if (!savedSearchSummary?.includes('person') || !savedSearchSummary.includes('80%')) throw new Error(`Saved object condition summary missing: ${savedSearchSummary}`)
    if (session.errors.length > 0) throw new Error(`Renderer errors during object condition search smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Object Condition Search passed: ${JSON.stringify({ visibleRows, matchedEvidenceId: results[0]?.evidenceId, labelQuery: 'person', minimumScore: 0.8, categoryLabels: ['person'] })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
