import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { connect } from '@lancedb/lancedb'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const fixtureCount = 30

async function seedEvidence(userDataDirectory: string): Promise<void> {
  const databaseDirectory = join(userDataDirectory, 'library', 'vision', 'lancedb')
  await mkdir(databaseDirectory, { recursive: true })
  const database = await connect(databaseDirectory)
  const fileName = basename(mediaPath)
  const rows = Array.from({ length: fixtureCount }, (_, index) => ({
    id: `pagination-evidence-${index}`,
    source_id: 'pagination-source',
    video_path: mediaPath,
    file_name: fileName,
    evidence_type: 'ocr',
    start_seconds: index,
    end_seconds: index + 0.8,
    text: `视觉分页 Smoke 关键字 ${index}`,
    frame_id: '',
    thumbnail_path: '',
    confidence: 0.9,
    box_xmin: 0,
    box_ymin: 0,
    box_xmax: 0,
    box_ymax: 0,
    source_fingerprint: `${mediaPath}:pagination-smoke`,
    model_id: 'smoke-model',
    model_variant: 'smoke-variant',
    generated_at: 1_000 + index
  }))
  await database.createTable('video_evidence', rows)
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

async function search(page: Page): Promise<number> {
  const input = page.locator('.vision-text-search input')
  const button = page.locator('.vision-text-search .vision-search-button')
  await input.fill('视觉分页 Smoke 关键字')
  await button.click()
  await page.waitForFunction(() => (document.querySelector('.vision-text-search .vision-search-button') as HTMLButtonElement | null)?.disabled === true, undefined, { timeout: 10_000 })
  await page.waitForFunction(() => (document.querySelector('.vision-text-search .vision-search-button') as HTMLButtonElement | null)?.disabled === false, undefined, { timeout: 30_000 })
  await page.locator('.vision-result-row').first().waitFor({ timeout: 30_000 })
  return page.locator('.vision-result-row').count()
}

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-search-pagination-user-data-'))
  let app: ElectronApplication | null = null

  try {
    await seedEvidence(userDataDirectory)
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    await session.page.getByRole('tab', { name: '影视库搜索' }).click()
    await session.page.locator('.vision-panel').waitFor({ timeout: 10_000 })
    const initialCount = await search(session.page)
    if (initialCount !== 24) throw new Error(`Vision search initial page mismatch: ${JSON.stringify({ initialCount, expected: 24 })}`)

    await session.page.locator('.vision-result-row input[type="checkbox"]').first().check()
    const selectedBeforeLoadMore = await session.page.locator('.vision-result-row input[type="checkbox"]:checked').count()
    const loadMore = session.page.locator('.vision-results-load-more')
    await loadMore.waitFor({ timeout: 10_000 })
    await loadMore.click()
    await session.page.waitForFunction(() => document.querySelectorAll('.vision-result-row').length === 30, undefined, { timeout: 30_000 })
    const expandedCount = await session.page.locator('.vision-result-row').count()
    const selectedAfterLoadMore = await session.page.locator('.vision-result-row input[type="checkbox"]:checked').count()
    if (selectedAfterLoadMore !== selectedBeforeLoadMore) throw new Error(`Vision search selection was not preserved: ${JSON.stringify({ selectedBeforeLoadMore, selectedAfterLoadMore })}`)
    if (await session.page.locator('.vision-results-load-more').count() !== 0) throw new Error('Vision search load-more remained visible at the 100-result boundary fixture')

    if (session.errors.length > 0) throw new Error(`Renderer errors during vision search pagination smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Search Pagination passed: ${JSON.stringify({ initialCount, expandedCount, selectedBeforeLoadMore, selectedAfterLoadMore, loadMoreHidden: true })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
