import { _electron as electron } from 'playwright'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min_360p.mp4'

async function main(): Promise<void> {
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-editing-playhead-home-'))
  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', sourceMediaPath],
    env: { ...process.env, HOME: smokeHomeDirectory }
  })

  try {
    const page = await app.firstWindow()
    const consoleErrors: string[] = []
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', (error) => consoleErrors.push(error.message))
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('video.video-surface', { timeout: 10_000 })
    await page.locator('.clip-editor-tool-button').click()
    await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 10_000 })

    const waveform = page.locator('[data-testid="editing-waveform-track"]')
    await waveform.waitFor({ timeout: 10_000 })
    const waveformBounds = await waveform.boundingBox()
    if (!waveformBounds || waveformBounds.width < 20) throw new Error(`Waveform track is not measurable: ${JSON.stringify(waveformBounds)}`)
    await page.mouse.click(waveformBounds.x + waveformBounds.width * 0.1, waveformBounds.y + waveformBounds.height / 2)
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="editing-playhead"]')?.getAttribute('aria-valuenow') ?? 0) > 4, null, { timeout: 10_000 })

    const track = page.locator('[data-testid="editing-track"]')
    const playhead = page.locator('[data-testid="editing-playhead"]')
    const trackBounds = await track.boundingBox()
    const playheadBounds = await playhead.boundingBox()
    if (!trackBounds || !playheadBounds) throw new Error(`Playhead is not measurable: ${JSON.stringify({ trackBounds, playheadBounds })}`)

    const targetRatio = 0.35
    const startX = playheadBounds.x + playheadBounds.width / 2
    const y = trackBounds.y + trackBounds.height / 2
    const targetX = trackBounds.x + trackBounds.width * targetRatio
    await page.mouse.move(startX, y)
    await page.mouse.down()
    await page.mouse.move(targetX, y, { steps: 8 })
    await page.mouse.up()

    const durationSeconds = await page.locator('video.video-surface').evaluate((video) => (video as HTMLVideoElement).duration)
    const expectedSeconds = durationSeconds * targetRatio
    await page.waitForFunction((expected) => {
      const value = Number(document.querySelector('[data-testid="editing-playhead"]')?.getAttribute('aria-valuenow') ?? NaN)
      return Number.isFinite(value) && Math.abs(value - (expected as number)) < 0.8
    }, expectedSeconds, { timeout: 10_000 })
    const finalSeconds = Number(await playhead.getAttribute('aria-valuenow'))
    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-editing-playhead.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })

    console.log('AIVPlayer Smoke Editing Playhead')
    console.log(`Media: ${sourceMediaPath}`)
    console.log(`Playhead drag: ${JSON.stringify({ durationSeconds, targetRatio, expectedSeconds, finalSeconds })}`)
    console.log(`Screenshot: ${screenshotPath}`)
    console.log(`Renderer errors: ${JSON.stringify(consoleErrors)}`)
    if (Math.abs(finalSeconds - expectedSeconds) >= 0.8 || consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
