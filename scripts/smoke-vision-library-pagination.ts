import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from '@lancedb/lancedb'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const sourceCount = 101

async function seedSources(userDataDirectory: string): Promise<void> {
  const databaseDirectory = join(userDataDirectory, 'library', 'vision', 'lancedb')
  await mkdir(databaseDirectory, { recursive: true })
  const database = await connect(databaseDirectory)
  await database.createTable('video_sources', Array.from({ length: sourceCount }, (_, index) => ({
    id: `source-${String(index).padStart(3, '0')}`,
    video_path: `/smoke/media/source-${String(index).padStart(3, '0')}.mp4`,
    file_name: `source-${String(index).padStart(3, '0')}.mp4`,
    file_size_bytes: 1000 + index,
    file_mtime_ms: 1_000 + index,
    sample_interval_seconds: 3,
    subtitle_path: '',
    subtitle_size_bytes: 0,
    subtitle_mtime_ms: 0,
    frame_count: index + 1,
    model_id: 'smoke-model',
    model_variant: 'smoke-variant',
    indexed_at_ms: 2_000 + index
  })))
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

async function runSmoke(): Promise<void> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-library-pagination-'))
  let app: ElectronApplication | null = null

  try {
    await seedSources(userDataDirectory)
    const session = await launchPlayer(userDataDirectory)
    app = session.app
    const page = session.page
    await page.getByRole('tab', { name: '影视库搜索' }).click()
    const library = page.locator('.vision-library-sources')
    await library.waitFor({ timeout: 10_000 })
    await page.waitForFunction(() => document.querySelectorAll('.vision-library-source').length === 100, undefined, { timeout: 15_000 })
    const firstPageNames = await library.locator('.vision-library-source strong').allTextContents()
    if (firstPageNames.length !== 100 || firstPageNames[0] !== 'source-100.mp4' || firstPageNames.at(-1) !== 'source-001.mp4') {
      throw new Error(`Unexpected first source page: ${JSON.stringify({ count: firstPageNames.length, first: firstPageNames[0], last: firstPageNames.at(-1) })}`)
    }

    const loadMore = library.locator('.vision-library-load-more')
    await loadMore.click()
    await page.waitForFunction(() => document.querySelectorAll('.vision-library-source').length === 101, undefined, { timeout: 15_000 })
    const allNames = await library.locator('.vision-library-source strong').allTextContents()
    const duplicateNames = allNames.filter((name, index) => allNames.indexOf(name) !== index)
    if (allNames.length !== sourceCount || allNames.at(-1) !== 'source-000.mp4' || duplicateNames.length > 0) {
      throw new Error(`Source pagination produced duplicates or wrong tail: ${JSON.stringify({ count: allNames.length, last: allNames.at(-1), duplicateNames })}`)
    }
    if (await library.locator('.vision-library-load-more').count() !== 0) throw new Error('Load-more button remained after the final partial page')
    if (session.errors.length > 0) throw new Error(`Renderer errors during vision library pagination smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Library Pagination passed: ${JSON.stringify({ firstPage: 100, finalCount: allNames.length, duplicateNames })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
