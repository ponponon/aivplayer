import { _electron as electron } from 'playwright'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

async function main(): Promise<void> {
  const homeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-waveform-home-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-waveform-user-data-'))
  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
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
      return Boolean(video && Number.isFinite(video.duration) && video.duration > 20)
    }, undefined, { timeout: 15_000 })

    const first = await page.evaluate(async (path) => window.aiv.extractMediaWaveform({ mediaPath: path, width: 1000, height: 48 }), mediaPath)
    const second = await page.evaluate(async (path) => window.aiv.extractMediaWaveform({ mediaPath: path, width: 1000, height: 48 }), mediaPath)
    if (!first.success || first.cacheHit || !first.generated || !first.dataUrl || second.cacheHit !== true || second.generated || second.dataUrl !== first.dataUrl) {
      throw new Error(`Waveform cache contract mismatch: ${JSON.stringify({ first: { success: first.success, cacheHit: first.cacheHit, generated: first.generated, bytes: first.dataUrl?.length }, second: { success: second.success, cacheHit: second.cacheHit, generated: second.generated, bytes: second.dataUrl?.length }, cacheKey: second.cacheKey })}`)
    }

    await page.locator('.clip-editor-tool-button').click()
    await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 15_000 })
    const track = page.locator('[data-testid="editing-waveform-track"]')
    await track.waitFor({ timeout: 15_000 })
    await track.locator('img').first().waitFor({ timeout: 15_000 })
    const screenshotPath = join(homeDirectory, 'aivplayer-smoke-waveform.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    const bounds = await track.boundingBox()
    if (!bounds || bounds.width < 20) throw new Error(`Waveform track is not measurable: ${JSON.stringify(bounds)}`)
    const targetSeconds = 30
    await page.mouse.click(bounds.x + bounds.width * (targetSeconds / 60), bounds.y + bounds.height / 2)
    await page.waitForFunction((target) => {
      const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
      return Boolean(video && Math.abs(video.currentTime - (target as number)) < 0.35)
    }, targetSeconds, { timeout: 10_000 })
    if (errors.length > 0) throw new Error(`Renderer errors during waveform smoke:\n${errors.join('\n')}`)
    console.log(`Waveform smoke passed: ${JSON.stringify({ firstCacheHit: first.cacheHit, secondCacheHit: second.cacheHit, cacheKey: second.cacheKey, targetSeconds, screenshotPath })}`)
  } finally {
    await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
