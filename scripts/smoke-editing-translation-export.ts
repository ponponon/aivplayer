import { _electron as electron } from 'playwright'
import { copyFile, mkdtemp, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

function makeSrt(texts: readonly string[]): string {
  return texts.map((text, index) => {
    const start = String(index * 2).padStart(2, '0')
    return `${index + 1}\n00:00:${start},000 --> 00:00:${String(index * 2 + 1).padStart(2, '0')},000\n${text}\n`
  }).join('\n')
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-translation-export-'))
  const mediaPath = join(smokeDirectory, 'translation-export-smoke.mp4')
  const sourceSubtitlePath = join(smokeDirectory, 'translation-export-smoke.srt')
  const translatedSubtitlePath = join(smokeDirectory, 'translation-export-smoke.translated.srt')
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-translation-export-home-'))
  const outputVideoPath = join(smokeDirectory, 'translation-only-output.mp4')
  await copyFile(sourceMediaPath, mediaPath)
  await writeFile(sourceSubtitlePath, makeSrt(['原文一', '原文二']))
  await writeFile(translatedSubtitlePath, makeSrt(['译文一', '译文二']))

  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', mediaPath],
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
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="editing-caption-item-"]').length === 4, null, { timeout: 10_000 })

    await page.locator('[data-testid="editing-export"]').click()
    await page.locator('[data-testid="editing-export-target"]').waitFor({ timeout: 10_000 })
    const translationMode = page.locator('.clip-export-mode-option').filter({ hasText: '仅译文字幕' })
    const translationModeEnabled = !(await translationMode.isDisabled())
    await translationMode.click()
    const selectedTranslationMode = await translationMode.getAttribute('aria-pressed')
    const translationPreview = await page.locator('.editing-export-target-preview').textContent()
    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-translation-export.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    await page.locator('.editing-export-confirm-cancel').click()

    const exportResult = await page.evaluate(async ({ sourcePath, targetPath }) => window.aiv.exportMediaTimeline({
      mediaPath: sourcePath,
      clips: [{ mediaPath: sourcePath, startSeconds: 0, endSeconds: 1 }],
      mode: 'translation-subtitle',
      subtitleText: '1\n00:00:00,000 --> 00:00:00,500\n译文一\n\n2\n00:00:00,500 --> 00:00:01,000\n译文二\n',
      outputVideoPath: targetPath
    }), { sourcePath: mediaPath, targetPath: outputVideoPath })
    const outputStats = exportResult.success ? await stat(outputVideoPath).catch(() => null) : null
    const subtitleText = exportResult.subtitleSrtPath ? await page.evaluate((path) => window.aiv.readFileContent(path), exportResult.subtitleSrtPath) : ''
    const result = {
      translationModeEnabled,
      selectedTranslationMode,
      translationPreview,
      exportSuccess: exportResult.success,
      outputBytes: outputStats?.size ?? 0,
      subtitlePath: exportResult.subtitleSrtPath ?? '',
      subtitleText,
      consoleErrors
    }
    console.log('AIVPlayer Smoke Translation Export')
    console.log(`Media: ${mediaPath}`)
    console.log(`UI: ${JSON.stringify({ translationModeEnabled, selectedTranslationMode, translationPreview })}`)
    console.log(`Export: ${JSON.stringify({ success: exportResult.success, outputBytes: outputStats?.size ?? 0, subtitlePath: exportResult.subtitleSrtPath ?? '', subtitleText })}`)
    console.log(`Screenshot: ${screenshotPath}`)
    console.log(`Console errors: ${JSON.stringify(consoleErrors)}`)

    if (!translationModeEnabled || selectedTranslationMode !== 'true' || !translationPreview?.endsWith('-translation.mp4')) process.exitCode = 1
    if (!exportResult.success || !outputStats || outputStats.size <= 0 || !subtitleText.includes('译文一') || !subtitleText.includes('译文二') || subtitleText.includes('原文')) process.exitCode = 1
    if (result.consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
