import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { connect } from '@lancedb/lancedb'
import { copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourcePath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

async function seedSources(userDataDirectory: string, sourcePaths: readonly string[]): Promise<void> {
  const databaseDirectory = join(userDataDirectory, 'library', 'vision', 'lancedb')
  await mkdir(databaseDirectory, { recursive: true })
  const sourceStats = await Promise.all(sourcePaths.map((path) => stat(path)))
  const database = await connect(databaseDirectory)
  await database.createTable('video_sources', sourcePaths.map((videoPath, index) => ({
    id: `source-${index}`,
    video_path: videoPath,
    file_name: videoPath.split('/').pop() ?? `source-${index}.mp4`,
    file_size_bytes: sourceStats[index]?.size ?? 0,
    file_mtime_ms: sourceStats[index]?.mtimeMs ?? 0,
    sample_interval_seconds: 3,
    subtitle_path: '',
    subtitle_size_bytes: 0,
    subtitle_mtime_ms: 0,
    frame_count: 1,
    model_id: 'smoke-model',
    model_variant: 'smoke-variant',
    indexed_at_ms: 2_000 + index
  })))
}

async function launchPlayer(userDataDirectory: string, mediaPath: string): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
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

async function main(): Promise<void> {
  const mediaDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-duplicate-media-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-duplicate-user-data-'))
  const firstPath = join(mediaDirectory, 'first-copy.mp4')
  const secondPath = join(mediaDirectory, 'second-copy.mp4')
  await copyFile(sourcePath, firstPath)
  await copyFile(sourcePath, secondPath)
  let app: ElectronApplication | null = null

  try {
    await seedSources(userDataDirectory, [firstPath, secondPath])
    const session = await launchPlayer(userDataDirectory, firstPath)
    app = session.app
    const page = session.page
    await page.getByRole('tab', { name: '影视库搜索' }).click()
    const library = page.locator('.vision-library-sources')
    await library.waitFor({ timeout: 10_000 })
    await page.locator('[data-testid="vision-duplicate-scan"]').click()
    const report = page.locator('[data-testid="vision-duplicate-report"]')
    await report.waitFor({ timeout: 30_000 })
    const groupCount = await report.locator('.vision-library-duplicate-group').count()
    const duplicateSourceCount = await report.locator('.vision-library-duplicate-source').count()
    if (groupCount !== 1 || duplicateSourceCount !== 2) throw new Error(`Unexpected duplicate report: ${JSON.stringify({ groupCount, duplicateSourceCount })}`)
    if (session.errors.length > 0) throw new Error(`Renderer errors during duplicate media smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Duplicate Media passed: ${JSON.stringify({ groupCount, duplicateSourceCount, consoleErrors: session.errors.length })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await Promise.all([
      rm(mediaDirectory, { recursive: true, force: true }),
      rm(userDataDirectory, { recursive: true, force: true })
    ])
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
