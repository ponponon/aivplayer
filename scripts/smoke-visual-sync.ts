import { _electron as electron } from 'playwright'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-visual-sync-'))
  const mediaPath = join(smokeDirectory, 'visual-sync-smoke.mp4')
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourceMediaPath, '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', mediaPath])
  await writeFile(join(smokeDirectory, 'visual-sync-smoke.srt'), ['1', '00:00:00,500 --> 00:00:01,500', '视觉同步 Smoke 字幕', ''].join('\n'))
  const homeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-visual-sync-home-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-visual-sync-user-data-'))
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
      return Boolean(video && Number.isFinite(video.duration) && video.duration >= 7.5)
    }, undefined, { timeout: 15_000 })
    await page.locator('.clip-editor-tool-button').click()
    await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 15_000 })
    await page.locator('[data-testid="editing-caption-track"] .editing-caption-item-button').first().click()
    await page.waitForFunction(() => {
      const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
      return Boolean(video && Math.abs(video.currentTime - 0.5) < 0.25)
    }, undefined, { timeout: 10_000 })
    const sync = page.locator('[data-testid="editing-caption-sync"]')
    await sync.locator('summary').click()
    await sync.locator('.editing-caption-sync-panel').waitFor({ state: 'visible', timeout: 10_000 })
    const caption = page.locator('[data-testid="editing-caption-track"] .editing-caption-item').first()
    const leftBefore = await caption.evaluate((element) => (element as HTMLElement).style.left)
    await page.locator('[data-testid="editing-caption-sync-right"]').click()
    await page.waitForFunction((before) => (document.querySelector('[data-testid="editing-caption-track"] .editing-caption-item') as HTMLElement | null)?.style.left !== before, leftBefore)
    const leftAfterNudge = await caption.evaluate((element) => (element as HTMLElement).style.left)
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((before) => (document.querySelector('[data-testid="editing-caption-track"] .editing-caption-item') as HTMLElement | null)?.style.left === before, leftBefore)
    const screenshotPath = join(homeDirectory, 'aivplayer-smoke-visual-sync.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    if (leftAfterNudge === leftBefore || errors.length > 0) throw new Error(`Visual sync regression: ${JSON.stringify({ leftBefore, leftAfterNudge, errors })}`)
    console.log(`Visual sync smoke passed: ${JSON.stringify({ selectedAtSeconds: 0.5, leftBefore, leftAfterNudge, undoRestored: true, screenshotPath })}`)
  } finally {
    await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
