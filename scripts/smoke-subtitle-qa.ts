import { _electron as electron } from 'playwright'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-subtitle-qa-'))
  const mediaPath = join(smokeDirectory, 'subtitle-qa-smoke.mp4')
  const subtitlePath = join(smokeDirectory, 'subtitle-qa-smoke.srt')
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourceMediaPath, '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', mediaPath])
  await writeFile(subtitlePath, [
    '1',
    '00:00:00,500 --> 00:00:00,700',
    '短',
    '',
    '2',
    '00:00:00,600 --> 00:00:02,000',
    'hello hello',
    '',
    '3',
    '00:00:02,400 --> 00:00:03,400',
    '你好 !!!',
    '',
    '4',
    '00:00:03,600 --> 00:00:04,600',
    '�',
    ''
  ].join('\n'))
  const homeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-subtitle-qa-home-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-subtitle-qa-user-data-'))
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
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="editing-caption-track"] .editing-caption-item').length === 4, undefined, { timeout: 15_000 })

    const qa = page.locator('[data-testid="editing-subtitle-qa"]')
    await qa.locator('summary').click()
    await qa.locator('.editing-subtitle-qa-panel').waitFor({ state: 'visible', timeout: 10_000 })
    const issueCount = await qa.locator('[data-testid="subtitle-qa-issue"]').count()
    if (issueCount < 4) throw new Error(`Subtitle QA issue count is too small: ${issueCount}`)
    const screenshotPath = join(homeDirectory, 'aivplayer-smoke-subtitle-qa.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })

    await qa.locator('[data-testid="subtitle-qa-issue"]').first().click()
    await page.waitForFunction((target) => {
      const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
      return Boolean(video && Math.abs(video.currentTime - (target as number)) < 0.25)
    }, 0.5, { timeout: 10_000 })
    if (errors.length > 0) throw new Error(`Renderer errors during subtitle QA smoke:\n${errors.join('\n')}`)
    console.log(`Subtitle QA smoke passed: ${JSON.stringify({ issueCount, screenshotPath, seekTargetSeconds: 0.5 })}`)
  } finally {
    await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
