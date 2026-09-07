import { _electron as electron } from 'playwright'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourcePath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const screenshotPath = '/private/tmp/aivplayer-playback-comparison.png'

async function main(): Promise<void> {
  const mediaDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-playback-comparison-media-'))
  const homeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-playback-comparison-home-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-playback-comparison-user-data-'))
  const primaryPath = join(mediaDirectory, 'primary.mp4')
  const secondaryPath = join(mediaDirectory, 'secondary.mp4')
  await copyFile(sourcePath, primaryPath)
  await copyFile(sourcePath, secondaryPath)

  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', primaryPath, secondaryPath],
    env: { ...process.env, HOME: homeDirectory }
  })
  const errors: string[] = []

  try {
    const page = await app.firstWindow()
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.waitForLoadState('domcontentloaded')
    await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
    await page.waitForFunction(() => {
      const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
      const toggle = document.querySelector('[data-testid="playback-comparison-toggle"]') as HTMLButtonElement | null
      return Boolean(video && video.readyState >= 1 && video.duration > 0 && toggle && !toggle.disabled)
    }, undefined, { timeout: 20_000 })

    const toggle = page.locator('[data-testid="playback-comparison-toggle"]')
    await toggle.click()
    await page.locator('[data-testid="playback-comparison"]').waitFor({ timeout: 10_000 })
    const target = page.locator('[data-testid="playback-comparison-target"]')
    await target.click()
    await page.getByRole('listbox').waitFor({ timeout: 5_000 })
    const optionCount = await page.getByRole('option').count()
    const selectedTarget = await target.getAttribute('data-select-value')
    if (optionCount !== 1 || selectedTarget !== secondaryPath) throw new Error(`Comparison target mismatch: ${JSON.stringify({ optionCount, selectedTarget, secondaryPath })}`)
    await page.getByRole('option').first().click()

    const secondary = page.locator('[data-testid="playback-comparison-secondary"]')
    await secondary.waitFor({ timeout: 10_000 })
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-testid="playback-comparison-secondary"]') as HTMLVideoElement | null
      return Boolean(video && video.readyState >= 1 && video.duration > 0)
    }, undefined, { timeout: 20_000 })

    await page.locator('.stage').hover()
    const playbackButton = page.locator('[data-testid="playback-toggle"]')
    const primaryPaused = await page.locator('video.video-surface').evaluate((video) => (video as HTMLVideoElement).paused)
    if (primaryPaused) await playbackButton.click()
    await page.waitForFunction(() => {
      const primary = document.querySelector('video.video-surface') as HTMLVideoElement | null
      const secondaryVideo = document.querySelector('[data-testid="playback-comparison-secondary"]') as HTMLVideoElement | null
      return Boolean(primary && secondaryVideo && !primary.paused && !secondaryVideo.paused && Math.abs(primary.currentTime - secondaryVideo.currentTime) < 0.35)
    }, undefined, { timeout: 10_000 })

    const seekTarget = 5
    await page.locator('input.timeline').evaluate((input, targetSeconds) => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(input, String(targetSeconds))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, seekTarget)
    await page.waitForFunction((targetSeconds) => {
      const primary = document.querySelector('video.video-surface') as HTMLVideoElement | null
      const secondaryVideo = document.querySelector('[data-testid="playback-comparison-secondary"]') as HTMLVideoElement | null
      return Boolean(primary && secondaryVideo && Math.abs(primary.currentTime - targetSeconds) < 0.4 && Math.abs(primary.currentTime - secondaryVideo.currentTime) < 0.35)
    }, seekTarget, { timeout: 10_000 })

    await page.screenshot({ path: screenshotPath, fullPage: false })
    await playbackButton.click()
    await page.waitForFunction(() => {
      const primary = document.querySelector('video.video-surface') as HTMLVideoElement | null
      const secondaryVideo = document.querySelector('[data-testid="playback-comparison-secondary"]') as HTMLVideoElement | null
      return Boolean(primary?.paused && secondaryVideo?.paused)
    }, undefined, { timeout: 10_000 })

    await toggle.click()
    await page.waitForFunction(() => !document.querySelector('[data-testid="playback-comparison"]'), undefined, { timeout: 10_000 })
    if (errors.length > 0) throw new Error(`Renderer errors during playback comparison smoke:\n${errors.join('\n')}`)

    console.log(`AIVPlayer Smoke Playback Comparison passed: ${JSON.stringify({ optionCount, selectedTarget, synchronizedPlayback: true, synchronizedSeek: true, synchronizedPause: true, screenshotPath, consoleErrors: errors.length })}`)
  } finally {
    await app.close().catch(() => undefined)
    await Promise.all([
      rm(mediaDirectory, { recursive: true, force: true }),
      rm(homeDirectory, { recursive: true, force: true }),
      rm(userDataDirectory, { recursive: true, force: true })
    ])
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
