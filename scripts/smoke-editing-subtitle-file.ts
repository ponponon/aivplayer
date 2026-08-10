import { _electron as electron } from 'playwright'
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
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
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-subtitle-file-'))
  const mediaPath = join(smokeDirectory, 'subtitle-file-smoke.mp4')
  const sourceSubtitlePath = join(smokeDirectory, 'subtitle-file-smoke.srt')
  const translatedSubtitlePath = join(smokeDirectory, 'subtitle-file-smoke.translated.srt')
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-subtitle-file-home-'))
  const uiTranslationOutputPath = join(smokeDirectory, 'pure-translation.srt')
  const ipcSourceOutputPath = join(smokeDirectory, 'pure-source.srt')
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
    const sourceMode = page.locator('.clip-export-mode-option').filter({ hasText: '原文字幕文件' })
    const translationMode = page.locator('.clip-export-mode-option').filter({ hasText: '译文字幕文件' })
    const sourceModeEnabled = !(await sourceMode.isDisabled())
    const translationModeEnabled = !(await translationMode.isDisabled())
    await sourceMode.click()
    const sourcePreview = await page.locator('.editing-export-target-preview').textContent()
    await translationMode.click()
    const translationPreview = await page.locator('.editing-export-target-preview').textContent()
    await page.locator('input[aria-label="文件名"]').fill('pure-translation.srt')
    await page.locator('[data-testid="editing-export-confirm"]').evaluate((element) => (element as HTMLButtonElement).click())
    await page.waitForFunction((path) => window.aiv.isMediaFileAvailable(path), uiTranslationOutputPath, { timeout: 10_000 })
    const uiTranslationText = await readFile(uiTranslationOutputPath, 'utf8')

    const ipcResult = await page.evaluate(async ({ sourcePath, targetPath }) => window.aiv.exportEditingSubtitleFile({
      mediaPath: sourcePath,
      kind: 'source',
      subtitleText: '1\r\n00:00:00,000 --> 00:00:00,500\r\n原文一\r\n',
      outputSubtitlePath: targetPath
    }), { sourcePath: mediaPath, targetPath: ipcSourceOutputPath })
    const ipcSourceStats = await stat(ipcSourceOutputPath).catch(() => null)
    const ipcSourceText = await readFile(ipcSourceOutputPath, 'utf8').catch(() => '')
    const result = {
      sourceModeEnabled,
      translationModeEnabled,
      sourcePreview,
      translationPreview,
      uiTranslationSuccess: uiTranslationText.includes('译文一') && uiTranslationText.includes('译文二') && !uiTranslationText.includes('原文'),
      ipcSourceSuccess: ipcResult.success,
      ipcSourceBytes: ipcSourceStats?.size ?? 0,
      ipcSourceText,
      consoleErrors
    }
    console.log('AIVPlayer Smoke Editing Subtitle File')
    console.log(`Media: ${mediaPath}`)
    console.log(`UI: ${JSON.stringify({ sourceModeEnabled, translationModeEnabled, sourcePreview, translationPreview })}`)
    console.log(`Export: ${JSON.stringify({ uiTranslationSuccess: result.uiTranslationSuccess, ipcSourceSuccess: result.ipcSourceSuccess, ipcSourceBytes: result.ipcSourceBytes, ipcSourceText })}`)
    console.log(`Console errors: ${JSON.stringify(consoleErrors)}`)

    if (!sourceModeEnabled || !translationModeEnabled || !sourcePreview?.endsWith('.srt') || !translationPreview?.endsWith('.srt')) process.exitCode = 1
    if (!result.uiTranslationSuccess || !result.ipcSourceSuccess || result.ipcSourceBytes <= 0 || !result.ipcSourceText.endsWith('\n') || result.consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
    await Promise.all([
      rm(smokeHomeDirectory, { recursive: true, force: true }),
      rm(smokeDirectory, { recursive: true, force: true })
    ])
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
