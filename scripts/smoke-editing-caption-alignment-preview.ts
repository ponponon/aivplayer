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
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-caption-alignment-'))
  const mediaPath = join(smokeDirectory, 'caption-alignment-smoke.mp4')
  const subtitlePath = join(smokeDirectory, 'caption-alignment-smoke.srt')
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-caption-alignment-user-data-'))
  const homeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-caption-alignment-home-'))
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourceMediaPath, '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', mediaPath])
  await writeFile(subtitlePath, [
    '1', `${srtTime(0.5)} --> ${srtTime(1.5)}`, '视觉锚点第一句', '',
    '2', `${srtTime(2.5)} --> ${srtTime(3.5)}`, '视觉锚点第二句', ''
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
    const firstCaption = page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '视觉锚点第一句' })
    const secondCaption = page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '视觉锚点第二句' })
    const firstBefore = await firstCaption.getAttribute('style')
    const secondBefore = await secondCaption.getAttribute('style')
    await captionButtons.filter({ hasText: '视觉锚点第一句' }).click()
    await captionButtons.filter({ hasText: '视觉锚点第二句' }).click({ modifiers: ['Meta'] })
    const sync = page.locator('[data-testid="editing-caption-sync"]')
    await sync.locator('summary').click()
    await page.locator('[data-testid="editing-caption-multi-sync"]').waitFor({ timeout: 10_000 })

    await page.locator('video.video-surface').evaluate((video) => {
      const media = video as HTMLVideoElement
      media.currentTime = 4
      media.dispatchEvent(new Event('timeupdate'))
    })
    await page.waitForFunction(() => document.querySelector('[data-testid="editing-time-readout"]')?.textContent?.includes('00:04') === true, undefined, { timeout: 10_000 })
    await page.locator('[data-testid="editing-caption-alignment-generate"]').click()
    const candidate = page.locator('[data-testid="editing-caption-alignment-preview"]')
    await candidate.locator('.editing-caption-sync-candidate-details').waitFor({ timeout: 10_000 })
    const candidateText = await candidate.textContent()
    const applyButton = page.locator('[data-testid="editing-caption-alignment-apply"]')
    if (!candidateText?.includes('当前播放头') || !candidateText.includes('人工视觉锚点') || !(await applyButton.isEnabled())) {
      throw new Error(`Alignment candidate evidence mismatch: ${JSON.stringify({ candidateText, applyEnabled: await applyButton.isEnabled() })}`)
    }
    await applyButton.click()
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('[data-testid^="editing-caption-item-"]')].some((item) => item.textContent?.includes('视觉锚点第一句') && item.style.left.startsWith('50')) && [...document.querySelectorAll<HTMLElement>('[data-testid^="editing-caption-item-"]')].some((item) => item.textContent?.includes('视觉锚点第二句') && item.style.left.startsWith('75')), undefined, { timeout: 10_000 })
    const firstAfter = await firstCaption.getAttribute('style')
    const secondAfter = await secondCaption.getAttribute('style')
    if (firstBefore === firstAfter || secondBefore === secondAfter) throw new Error(`Alignment candidate did not apply: ${JSON.stringify({ firstBefore, firstAfter, secondBefore, secondAfter })}`)

    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction(({ first, second }) => {
      const items = [...document.querySelectorAll<HTMLElement>('[data-testid^="editing-caption-item-"]')]
      return items.some((item) => item.textContent?.includes('视觉锚点第一句') && item.getAttribute('style') === first) && items.some((item) => item.textContent?.includes('视觉锚点第二句') && item.getAttribute('style') === second)
    }, { first: firstBefore, second: secondBefore }, { timeout: 10_000 })
    await page.locator('[data-testid="editing-redo"]').click()
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('[data-testid^="editing-caption-item-"]')].some((item) => item.textContent?.includes('视觉锚点第一句') && item.style.left.startsWith('50')), undefined, { timeout: 10_000 })

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
    await openEditor()
    const restoredFirst = page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '视觉锚点第一句' })
    const restoredSecond = page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '视觉锚点第二句' })
    const restoredFirstStyle = await restoredFirst.getAttribute('style')
    const restoredSecondStyle = await restoredSecond.getAttribute('style')
    if (restoredFirstStyle === firstBefore || restoredSecondStyle === secondBefore) throw new Error(`Alignment candidate did not persist after reload: ${JSON.stringify({ restoredFirstStyle, restoredSecondStyle })}`)
    if (errors.length > 0) throw new Error(`Renderer errors during alignment preview smoke:\n${errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Editing Caption Alignment Preview passed: ${JSON.stringify({ sourceRange: '0.5-3.5', targetAnchor: 4, evidence: 'current-playhead', confidence: 'manual-visual-anchor', undoRestored: true, redoRestored: true, reloadPersisted: true })}`)
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
