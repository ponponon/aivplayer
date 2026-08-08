import { _electron as electron } from 'playwright'
import { copyFile, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

function formatSrtTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const wholeSeconds = Math.floor(seconds % 60)
  const milliseconds = Math.round((seconds - Math.floor(seconds)) * 1000)
  return `00:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`
}

function makeSrt(texts: readonly string[]): string {
  return texts.map((text, index) => {
    const startSeconds = index * 2
    return `${index + 1}\n${formatSrtTime(startSeconds)} --> ${formatSrtTime(startSeconds + 1.5)}\n${text}\n`
  }).join('\n')
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-orphan-translation-'))
  const mediaPath = join(smokeDirectory, 'orphan-translation-smoke.mp4')
  const subtitlePath = join(smokeDirectory, 'orphan-translation-smoke.srt')
  const translatedSubtitlePath = join(smokeDirectory, 'orphan-translation-smoke.translated.srt')
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-orphan-translation-home-'))
  await copyFile(sourceMediaPath, mediaPath)
  let revisionMs = Date.now() + 2_000
  const writeSidecar = async (path: string, texts: readonly string[]): Promise<void> => {
    await writeFile(path, makeSrt(texts))
    revisionMs += 2_000
    await utimes(path, new Date(revisionMs), new Date(revisionMs))
  }
  await writeSidecar(subtitlePath, ['原始字幕 1', '原始字幕 2', '原始字幕 3'])
  await writeSidecar(translatedSubtitlePath, ['原始译文 1', '原始译文 2', '原始译文 3'])

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

    const openEditor = async (): Promise<void> => {
      await page.locator('.clip-editor-tool-button').click()
      await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 10_000 })
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="editing-script-list"] .editing-script-row').length === 3, null, { timeout: 10_000 })
    }
    const reloadAndOpenEditor = async (): Promise<void> => {
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForSelector('video.video-surface', { timeout: 10_000 })
      await page.waitForTimeout(700)
      await openEditor()
    }

    await openEditor()
    await writeSidecar(subtitlePath, ['外部字幕 1', '外部字幕 2'])
    await writeSidecar(translatedSubtitlePath, ['外部译文 1', '外部译文 2'])
    await reloadAndOpenEditor()
    await page.locator('[data-testid="editing-caption-reload-conflict"]').waitFor({ timeout: 10_000 })
    await page.locator('[data-testid="editing-caption-reload-preview"] summary').click()

    const preview = page.locator('[data-testid="editing-caption-reload-preview"]')
    const translationRow = preview.locator('.editing-caption-reload-row').filter({ hasText: '原始译文 3' })
    await translationRow.locator('[data-testid^="editing-caption-reload-keep-current-"]').click()
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="editing-caption-reload-conflict"] .editing-caption-reload-row')).every((row) => !row.textContent?.includes('原始译文 3')) && Array.from(document.querySelectorAll('[data-testid="editing-caption-reload-conflict"] .editing-caption-reload-row')).some((row) => row.textContent?.includes('原始字幕 3')), null, { timeout: 10_000 })
    const sourceRow = preview.locator('.editing-caption-reload-row').filter({ hasText: '原始字幕 3' })
    await sourceRow.locator('[data-testid^="editing-caption-reload-remove-"]').click()
    await page.waitForTimeout(300)
    const beforeReloadState = await page.evaluate(() => ({
      captions: Array.from(document.querySelectorAll('[data-testid^="editing-caption-item-"]')).map((item) => ({ text: item.textContent, className: item.getAttribute('class') })),
      scripts: Array.from(document.querySelectorAll('[data-testid^="editing-script-row-"]')).map((row) => ({ text: row.textContent, className: row.getAttribute('class') }))
    }))
    const beforeReloadSourceCaptionCount = beforeReloadState.captions.filter((caption) => caption.text?.includes('原始字幕 3')).length
    const beforeReloadTranslationCaptionCount = beforeReloadState.captions.filter((caption) => caption.text?.includes('原始译文 3')).length
    const beforeReloadScript = beforeReloadState.scripts.find((script) => script.text?.replace(/\s+/g, '').includes('原始字幕3'))
    if (beforeReloadSourceCaptionCount !== 0 || beforeReloadTranslationCaptionCount !== 1 || !beforeReloadScript?.className?.includes('is-deleted')) throw new Error(`Orphan translation state was not materialized: ${JSON.stringify(beforeReloadState)}`)

    const orphanNoticeBeforeReload = await page.locator('[data-testid="editing-caption-orphan-notice"]').textContent()
    const orphanCaptionBeforeReload = page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '原始译文 3' })
    const orphanClassBeforeReload = await orphanCaptionBeforeReload.getAttribute('class')
    const orphanAttributeBeforeReload = await orphanCaptionBeforeReload.getAttribute('data-editing-orphan-translation')
    await reloadAndOpenEditor()
    const sourceCaptionCountAfterReload = await page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '原始字幕 3' }).count()
    const translationCaptionAfterReload = page.locator('[data-testid^="editing-caption-item-"]').filter({ hasText: '原始译文 3' })
    const translationCaptionCountAfterReload = await translationCaptionAfterReload.count()
    const scriptClassAfterReload = await page.locator('[data-testid^="editing-script-row-"]').filter({ hasText: '原始字幕3' }).getAttribute('class')
    const orphanNoticeAfterReload = await page.locator('[data-testid="editing-caption-orphan-notice"]').textContent()
    const orphanClassAfterReload = await translationCaptionAfterReload.getAttribute('class')
    const orphanAttributeAfterReload = await translationCaptionAfterReload.getAttribute('data-editing-orphan-translation')
    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-orphan-translation.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    const result = { sourceCaptionCountAfterReload, translationCaptionCountAfterReload, scriptClassAfterReload: scriptClassAfterReload ?? '', orphanNoticeBeforeReload: orphanNoticeBeforeReload ?? '', orphanNoticeAfterReload: orphanNoticeAfterReload ?? '', orphanClassBeforeReload: orphanClassBeforeReload ?? '', orphanClassAfterReload: orphanClassAfterReload ?? '', orphanAttributeBeforeReload, orphanAttributeAfterReload, screenshotPath, consoleErrors }
    console.log('AIVPlayer Smoke Orphan Translation')
    console.log(`Media: ${mediaPath}`)
    console.log(`Result: ${JSON.stringify(result)}`)
    if (result.sourceCaptionCountAfterReload !== 0 || result.translationCaptionCountAfterReload !== 1 || !result.scriptClassAfterReload.includes('is-deleted') || !result.orphanNoticeBeforeReload || !result.orphanNoticeAfterReload || !result.orphanClassBeforeReload.includes('is-orphan-translation') || !result.orphanClassAfterReload.includes('is-orphan-translation') || result.orphanAttributeBeforeReload !== 'true' || result.orphanAttributeAfterReload !== 'true' || consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
