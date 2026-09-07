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
  await database.createTable('video_frames', sourcePaths.map((videoPath, index) => ({
    id: `frame-${index}`,
    video_path: videoPath,
    file_name: videoPath.split('/').pop() ?? `source-${index}.mp4`,
    timestamp_seconds: 3 + index,
    thumbnail_path: '',
    embedding: index === 0 ? [1, 0, 0] : [0.99, 0.1, 0],
    model_id: 'smoke-model',
    model_variant: 'smoke-variant',
    file_size_bytes: sourceStats[index]?.size ?? 0,
    file_mtime_ms: sourceStats[index]?.mtimeMs ?? 0
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
  const mediaDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-similar-media-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-similar-user-data-'))
  const firstPath = join(mediaDirectory, 'similar-first.mp4')
  const secondPath = join(mediaDirectory, 'similar-second.mp4')
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
    await page.locator('[data-testid="vision-similar-scan"]').click()
    const report = page.locator('[data-testid="vision-similar-report"]')
    await report.waitFor({ timeout: 30_000 })
    const groupCount = await report.locator('.vision-library-similar-group').count()
    const matchCount = await report.locator('.vision-library-similar-source').count()
    const reportText = await report.textContent()
    if (groupCount !== 1 || matchCount !== 2 || !reportText?.includes('视觉相似度')) {
      throw new Error(`Unexpected similar media report: ${JSON.stringify({ groupCount, matchCount, reportText })}`)
    }
    if (session.errors.length > 0) throw new Error(`Renderer errors during similar media smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Similar Media passed: ${JSON.stringify({ groupCount, matchCount, similarityCopyVerified: true, consoleErrors: session.errors.length })}`)
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
