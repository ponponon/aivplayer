import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const execFileAsync = promisify(execFile)
const sourceImagePath = process.argv[2] ?? '/Users/ponponon/Pictures/loopy.jpg'

async function createStaticVideo(outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-loop', '1', '-i', sourceImagePath,
    '-t', '12', '-vf', 'scale=640:-2,format=yuv420p',
    '-r', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputPath
  ], { maxBuffer: 4 * 1024 * 1024 })
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

async function runSmoke(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-similar-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-vision-similar-user-data-'))
  const mediaPath = join(smokeDirectory, 'similar-group-smoke.mp4')
  let app: ElectronApplication | null = null

  try {
    await createStaticVideo(mediaPath)
    const session = await launchPlayer(userDataDirectory, mediaPath)
    app = session.app
    const page = session.page
    await page.getByRole('tab', { name: '影视库搜索' }).click()
    await page.locator('.vision-panel').waitFor({ timeout: 10_000 })
    await page.waitForFunction(() => {
      const button = document.querySelector('.vision-intro > .vision-index-actions .vision-primary-action') as HTMLButtonElement | null
      return Boolean(button && !button.disabled)
    }, undefined, { timeout: 15_000 })

    await page.evaluate(() => {
      const smokeWindow = window as typeof window & { __visionSimilarProgress?: unknown }
      smokeWindow.__visionSimilarProgress = null
      window.aiv.onVisionIndexProgress((progress) => { smokeWindow.__visionSimilarProgress = progress })
    })
    await page.locator('.vision-intro > .vision-index-actions .vision-primary-action').click()
    await page.waitForFunction(() => {
      const progress = (window as typeof window & { __visionSimilarProgress?: { status?: string } }).__visionSimilarProgress
      return progress?.status === 'completed' || progress?.status === 'error' || progress?.status === 'cancelled'
    }, undefined, { timeout: 120_000 })

    const indexedStatus = await page.evaluate(() => window.aiv.getVisionStatus())
    if (indexedStatus.indexedFrameCount < 3) throw new Error(`Similar search smoke indexed too few frames: ${JSON.stringify(indexedStatus)}`)

    const searchInput = page.locator('.vision-text-search input')
    await searchInput.fill('similar-group-smoke')
    await page.locator('.vision-text-search .vision-search-button').click()
    await page.locator('.vision-result-row').first().waitFor({ timeout: 30_000 })

    const firstResult = await page.evaluate(() => window.aiv.searchVisionText({ query: 'similar-group-smoke', limit: 24, mode: 'hybrid' }).then((results) => results[0] ?? null))
    if (!firstResult) throw new Error('Similar search smoke did not produce a source result')
    const similarResults = await page.evaluate((result) => window.aiv.searchVisionSimilar({
      resultId: result.id,
      frameId: result.frameId,
      videoPath: result.videoPath,
      timestampSeconds: result.timestampSeconds,
      thumbnailPath: result.thumbnailPath,
      limit: 24
    }), firstResult)
    if (similarResults.length < 2 || similarResults.some((result) => result.id === firstResult.id)) {
      throw new Error(`Similar search IPC contract mismatch: ${JSON.stringify({ source: firstResult.id, similarCount: similarResults.length, similarIds: similarResults.map((result) => result.id) })}`)
    }

    await page.locator('.vision-result-similar-action').first().click()
    await page.locator('[data-testid="vision-similar-return"]').waitFor({ timeout: 30_000 })
    const groupCount = await page.locator('[data-testid="vision-similar-group"]').count()
    if (groupCount < 1) throw new Error(`Similar search UI did not render a multi-frame group: ${JSON.stringify({ groupCount, similarCount: similarResults.length })}`)
    await page.locator('[data-testid="vision-similar-return"]').click()
    await page.locator('.vision-text-search input').waitFor({ timeout: 10_000 })

    if (session.errors.length > 0) throw new Error(`Renderer errors during similar search smoke:\n${session.errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Vision Similar Search passed: ${JSON.stringify({ indexedFrames: indexedStatus.indexedFrameCount, sourceResultId: firstResult.id, similarCount: similarResults.length, groupCount })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(smokeDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
