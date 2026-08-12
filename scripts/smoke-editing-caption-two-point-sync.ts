import { _electron as electron } from 'playwright'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

function srtTime(seconds: number): string {
  const wholeSeconds = Math.floor(seconds)
  const milliseconds = Math.round((seconds - wholeSeconds) * 1000)
  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
  const remainingSeconds = wholeSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-two-point-sync-'))
  const mediaPath = join(smokeDirectory, 'two-point-sync-smoke.mp4')
  const subtitlePath = join(smokeDirectory, 'two-point-sync-smoke.srt')
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-two-point-sync-user-data-'))
  const homeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-two-point-sync-home-'))
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourceMediaPath, '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', mediaPath])
  await writeFile(subtitlePath, [
    '1', `${srtTime(0.5)} --> ${srtTime(1.5)}`, '两点同步第一句', '',
    '2', `${srtTime(2.5)} --> ${srtTime(3.5)}`, '两点同步第二句', ''
  ].join('\n'))

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
    const openEditor = async (): Promise<void> => {
      await page.locator('.clip-editor-tool-button').click()
      await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 15_000 })
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="editing-caption-track"] .editing-caption-item-button').length >= 2, undefined, { timeout: 15_000 })
    }
    await openEditor()

    const captionButtons = page.locator('[data-testid="editing-caption-track"] .editing-caption-item-button')
    const firstCaption = page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '两点同步第一句' })
    const secondCaption = page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '两点同步第二句' })
    const firstBefore = await firstCaption.getAttribute('style')
    const secondBefore = await secondCaption.getAttribute('style')
    await captionButtons.filter({ hasText: '两点同步第一句' }).click()
    await captionButtons.filter({ hasText: '两点同步第二句' }).click({ modifiers: ['Meta'] })
    await page.locator('[data-testid="editing-caption-sync"] summary').click()
    await page.locator('[data-testid="editing-caption-multi-sync"]').waitFor({ timeout: 10_000 })
    await page.waitForFunction(() => document.querySelector('[data-testid="editing-selection-count"]')?.textContent?.includes('2') === true, undefined, { timeout: 10_000 })

    const setVideoTime = async (seconds: number): Promise<void> => {
      await page.locator('video.video-surface').evaluate((video, value) => {
        const media = video as HTMLVideoElement
        media.currentTime = value
        media.dispatchEvent(new Event('timeupdate'))
      }, seconds)
      await page.waitForFunction((expected) => document.querySelector('[data-testid="editing-time-readout"]')?.textContent?.includes(`00:0${expected}`) === true, seconds, { timeout: 10_000 })
    }
    await setVideoTime(4)
    await page.locator('[data-testid="editing-caption-sync-mark-start"]').click()
    await setVideoTime(7)
    await page.locator('[data-testid="editing-caption-sync-mark-end"]').click()
    await page.locator('[data-testid="editing-caption-sync-apply-multi"]').click()
    await page.waitForFunction(() => {
      const items = [...document.querySelectorAll<HTMLElement>('[data-testid^="editing-caption-item-"]')]
      return items.some((item) => item.textContent?.includes('两点同步第一句') && item.style.left.startsWith('50')) && items.some((item) => item.textContent?.includes('两点同步第二句') && item.style.left.startsWith('75'))
    }, undefined, { timeout: 10_000 })
    const firstAfter = await firstCaption.getAttribute('style')
    const secondAfter = await secondCaption.getAttribute('style')
    if (firstBefore === firstAfter || secondBefore === secondAfter) throw new Error(`Two-point sync did not move both captions: ${JSON.stringify({ firstBefore, firstAfter, secondBefore, secondAfter })}`)
    await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { captions?: Array<{ text?: string; startSeconds?: number }> }>).some((project) => project.captions?.some((caption) => caption.text === '两点同步第一句' && Math.abs((caption.startSeconds ?? 0) - 4) < 0.05) === true), undefined, { timeout: 10_000 })

    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction(({ first, second }) => {
      const items = [...document.querySelectorAll<HTMLElement>('[data-testid^="editing-caption-item-"]')]
      return items.some((item) => item.textContent?.includes('两点同步第一句') && item.getAttribute('style') === first) && items.some((item) => item.textContent?.includes('两点同步第二句') && item.getAttribute('style') === second)
    }, { first: firstBefore, second: secondBefore }, { timeout: 10_000 })
    await page.locator('[data-testid="editing-redo"]').click()
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('[data-testid^="editing-caption-item-"]')].some((item) => item.textContent?.includes('两点同步第一句') && item.style.left.startsWith('50')), undefined, { timeout: 10_000 })

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
    await openEditor()
    const restoredFirst = page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '两点同步第一句' })
    const restoredSecond = page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '两点同步第二句' })
    const restoredFirstStyle = await restoredFirst.getAttribute('style')
    const restoredSecondStyle = await restoredSecond.getAttribute('style')
    if (restoredFirstStyle === firstBefore || restoredSecondStyle === secondBefore) throw new Error(`Two-point sync did not persist after reload: ${JSON.stringify({ restoredFirstStyle, restoredSecondStyle })}`)
    if (errors.length > 0) throw new Error(`Renderer errors during two-point sync smoke:\n${errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Editing Caption Two-Point Sync passed: ${JSON.stringify({ sourceRange: '0.5-3.5', targetRange: '4-7', undoRestored: true, redoRestored: true, reloadPersisted: true })}`)
  } finally {
    await app.close().catch(() => undefined)
    await rm(smokeDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(homeDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
