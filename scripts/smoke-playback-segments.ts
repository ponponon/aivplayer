import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron, type Page } from 'playwright'
import { getAppCopy } from '../src/shared/i18n.ts'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

async function seekVideo(page: Page, seconds: number): Promise<void> {
  await page.locator('video.video-surface').evaluate((video, target) => {
    const element = video as HTMLVideoElement
    element.currentTime = target as number
    element.dispatchEvent(new Event('timeupdate'))
  }, seconds)
  await page.waitForFunction((target) => {
    const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
    return Boolean(video && Math.abs(video.currentTime - target) < 0.2)
  }, seconds, { timeout: 10_000 })
}

async function main(): Promise<void> {
  const homeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-playback-segments-home-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-playback-segments-user-data-'))
  const app = await electron.launch({
    args: ['--no-sandbox', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
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

    const firstFilmstrip = await page.evaluate(async (path) => window.aiv.extractMediaFilmstrip({ mediaPath: path, timestampsSeconds: [5, 12], width: 240, quality: 6 }), mediaPath)
    if (firstFilmstrip.frames.length !== 2 || firstFilmstrip.generatedFrameCount !== 2 || firstFilmstrip.cacheHit) {
      throw new Error(`Trickplay first extraction mismatch: ${JSON.stringify({ frameCount: firstFilmstrip.frames.length, generatedFrameCount: firstFilmstrip.generatedFrameCount, cacheHit: firstFilmstrip.cacheHit, cacheKey: firstFilmstrip.cacheKey })}`)
    }
    const secondFilmstrip = await page.evaluate(async (path) => window.aiv.extractMediaFilmstrip({ mediaPath: path, timestampsSeconds: [5, 12], width: 240, quality: 6 }), mediaPath)
    if (secondFilmstrip.frames.length !== 2 || secondFilmstrip.generatedFrameCount !== 0 || !secondFilmstrip.cacheHit) {
      throw new Error(`Trickplay cache reuse mismatch: ${JSON.stringify({ frameCount: secondFilmstrip.frames.length, generatedFrameCount: secondFilmstrip.generatedFrameCount, cacheHit: secondFilmstrip.cacheHit, cacheKey: secondFilmstrip.cacheKey })}`)
    }
    const timeline = page.locator('input.timeline')
    const timelineBox = await timeline.boundingBox()
    if (!timelineBox || timelineBox.width < 8) throw new Error(`Timeline is not measurable for trickplay hover: ${JSON.stringify(timelineBox)}`)
    await timeline.hover({ position: { x: Math.min(timelineBox.width - 4, Math.max(4, timelineBox.width / 2)), y: Math.max(1, timelineBox.height / 2) } })
    await page.locator('.timeline-trickplay-preview img').waitFor({ timeout: 15_000 })
    console.log(`Playback trickplay cache reused: ${JSON.stringify({ firstGenerated: firstFilmstrip.generatedFrameCount, secondGenerated: secondFilmstrip.generatedFrameCount, cacheKey: secondFilmstrip.cacheKey })}`)

    const settings = await page.evaluate(() => window.aiv.getAppSettings())
    const copy = getAppCopy(settings.ui.locale)
    await page.locator('.segment-control > summary').click()
    await seekVideo(page, 5)
    await page.getByRole('button', { name: copy.controls.setSegmentStart }).click()
    await seekVideo(page, 12)
    await page.getByRole('button', { name: copy.controls.setSegmentEnd }).click()
    await page.locator('.segment-name-input').fill('Smoke segment')
    await page.locator('.segment-color-field select').selectOption('cyan')
    await page.getByRole('button', { name: copy.controls.saveSegment }).click()
    await page.locator('.timeline-segment-marker').waitFor({ timeout: 10_000 })

    const saved = await page.evaluate(async () => Object.values((await window.aiv.getAppSettings()).playback.segmentsByFingerprint).flat())
    if (saved.length !== 1 || saved[0]?.name !== 'Smoke segment' || saved[0]?.color !== 'cyan' || Math.abs(saved[0].startSeconds - 5) > 0.3 || Math.abs(saved[0].endSeconds - 12) > 0.3) {
      throw new Error(`Playback segment persistence mismatch: ${JSON.stringify(saved)}`)
    }
    console.log(`Playback segment saved: ${JSON.stringify(saved[0])}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
    await page.locator('.timeline-segment-marker').waitFor({ timeout: 10_000 })
    await page.locator('.segment-control > summary').click()
    await page.locator('.segment-list-remove').click()
    await page.waitForFunction(async () => Object.values((await window.aiv.getAppSettings()).playback.segmentsByFingerprint).flat().length === 0, undefined, { timeout: 10_000 })
    if (errors.length > 0) throw new Error(`Renderer errors during playback segment smoke:\n${errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Playback Segments passed for ${mediaPath}`)
  } finally {
    await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
