import { _electron as electron } from 'playwright'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

async function waitForIssueCount(page: import('playwright').Page, count: number): Promise<void> {
  await page.waitForFunction((expected) => document.querySelectorAll('[data-testid="subtitle-qa-issue"]').length === expected, count, { timeout: 15_000 })
}

function parseSrtCueDurations(text: string): number[] {
  return [...text.matchAll(/\d{2}:\d{2}:(\d{2}),(\d{3})\s+-->\s+\d{2}:\d{2}:(\d{2}),(\d{3})/gu)].map((match) => {
    const start = Number(match[1]) + Number(match[2]) / 1000
    const end = Number(match[3]) + Number(match[4]) / 1000
    return Number((end - start).toFixed(3))
  })
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-subtitle-qa-repair-'))
  const mediaPath = join(smokeDirectory, 'subtitle-qa-repair-smoke.mp4')
  const subtitlePath = join(smokeDirectory, 'subtitle-qa-repair-smoke.srt')
  const outputSubtitlePath = join(smokeDirectory, 'qa-repaired.srt')
  const homeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-subtitle-qa-repair-home-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-subtitle-qa-repair-user-data-'))
  let app: Awaited<ReturnType<typeof electron.launch>> | null = null
  const errors: string[] = []

  try {
    await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourceMediaPath, '-t', '12', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', mediaPath])
    await writeFile(subtitlePath, [
      '1',
      '00:00:00,500 --> 00:00:00,700',
      '短句',
      '',
      '2',
      '00:00:01,200 --> 00:00:02,000',
      '重叠句',
      '',
      '3',
      '00:00:01,800 --> 00:00:03,200',
      '正常句',
      '',
      '4',
      '00:00:04,000 --> 00:00:11,500',
      '长句',
      ''
    ].join('\n'))

    app = await electron.launch({
      args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
      env: { ...process.env, HOME: homeDirectory }
    })
    const page = await app.firstWindow()
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
    await page.waitForLoadState('domcontentloaded')
    await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
    await page.waitForFunction(() => {
      const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
      return Boolean(video && Number.isFinite(video.duration) && video.duration >= 11.5)
    }, undefined, { timeout: 15_000 })
    await page.locator('.clip-editor-tool-button').click()
    await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 15_000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="editing-caption-track"] .editing-caption-item').length === 4, undefined, { timeout: 15_000 })

    const qa = page.locator('[data-testid="editing-subtitle-qa"]')
    await qa.locator('summary').click()
    await qa.locator('.editing-subtitle-qa-panel').waitFor({ state: 'visible', timeout: 10_000 })
    const initialIssueCount = await qa.locator('[data-testid="subtitle-qa-issue"]').count()
    if (initialIssueCount !== 3) throw new Error(`Unexpected initial subtitle QA repairable issue count: ${initialIssueCount}`)

    await qa.locator('[data-testid="subtitle-qa-repair"]').click()
    await waitForIssueCount(page, 0)
    const undo = page.locator('[data-testid="editing-undo"]')
    const redo = page.locator('[data-testid="editing-redo"]')
    if (await undo.isDisabled()) throw new Error('Undo was disabled after the batch subtitle QA repair')

    await undo.click()
    await waitForIssueCount(page, initialIssueCount)
    if (await redo.isDisabled()) throw new Error('Redo was disabled after undoing the subtitle QA repair')
    await redo.click()
    await waitForIssueCount(page, 0)

    await page.locator('[data-testid="editing-export"]').click()
    await page.locator('[data-testid="editing-export-target"]').waitFor({ timeout: 10_000 })
    const sourceMode = page.locator('.clip-export-mode-option').filter({ hasText: '原文字幕文件' })
    if (await sourceMode.isDisabled()) throw new Error('Repaired source subtitle export was unexpectedly disabled')
    await sourceMode.evaluate((element) => (element as HTMLButtonElement).click())
    await page.locator('input[aria-label="文件名"]').fill('qa-repaired.srt')
    await page.locator('[data-testid="editing-export-confirm"]').evaluate((element) => (element as HTMLButtonElement).click())
    await page.waitForFunction((path) => window.aiv.isMediaFileAvailable(path), outputSubtitlePath, { timeout: 15_000 })
    const exportedText = await readFile(outputSubtitlePath, 'utf8')
    const durations = parseSrtCueDurations(exportedText)
    if (durations.length !== 4 || durations[0] !== 0.4 || durations[1] !== 0.6 || durations[3] !== 7) {
      throw new Error(`Subtitle QA repair export kept unexpected durations: ${JSON.stringify({ durations, exportedText })}`)
    }
    if (!['短句', '重叠句', '正常句', '长句'].every((text) => exportedText.includes(text))) throw new Error(`Subtitle QA repair changed caption text: ${exportedText}`)
    if (errors.length > 0) throw new Error(`Renderer errors during subtitle QA repair smoke:\n${errors.join('\n')}`)
    console.log(`AIVPlayer Smoke Subtitle QA Repair passed: ${JSON.stringify({ initialIssueCount, repairedIssueCount: 0, undoRestored: true, redoRestored: true, exportedDurations: durations })}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(smokeDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(homeDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
