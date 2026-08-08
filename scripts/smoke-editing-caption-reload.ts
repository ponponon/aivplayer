import { _electron as electron } from 'playwright'
import { copyFile, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

function srt(first: string, second: string, third: string): string {
  return [
    '1', '00:00:00,000 --> 00:00:02,000', first, '',
    '2', '00:00:04,000 --> 00:00:06,000', second, '',
    '3', '00:00:08,000 --> 00:00:10,000', third, ''
  ].join('\n')
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-caption-reload-'))
  const mediaPath = join(smokeDirectory, 'caption-reload-smoke.mp4')
  const subtitlePath = join(smokeDirectory, 'caption-reload-smoke.srt')
  const wordSidecarPath = join(smokeDirectory, 'caption-reload-smoke.json')
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-caption-reload-home-'))
  await copyFile(sourceMediaPath, mediaPath)
  let revisionMs = Date.now() + 2_000
  const writeSubtitle = async (first: string, second: string, third: string): Promise<void> => {
    await writeFile(subtitlePath, srt(first, second, third))
    revisionMs += 2_000
    await utimes(subtitlePath, new Date(revisionMs), new Date(revisionMs))
  }
  await writeSubtitle('原始字幕', '第二句', '第三句')
  await writeFile(wordSidecarPath, JSON.stringify({ transcription: [{ timestamps: { from: '00:00:00,000', to: '00:00:02,000' }, text: '原始字幕', tokens: [{ text: '原始字幕', timestamps: { from: '00:00:00,000', to: '00:00:02,000' } }] }] }))

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
    await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { captionSourceRevision?: string; scriptSegments?: unknown[] }>).some((project) => Boolean(project.captionSourceRevision) && project.scriptSegments?.length === 3), null, { timeout: 10_000 })
    const editButton = page.locator('[data-testid^="editing-script-edit-"]').first()
    const editTestId = await editButton.getAttribute('data-testid')
    if (!editTestId) throw new Error('Caption reload Smoke could not identify the script edit action')
    const editSegmentId = editTestId.replace('editing-script-edit-', '')
    const manualText = '手工修改且不能被静默覆盖'
    await editButton.click()
    await page.locator(`[data-testid="editing-script-input-${editSegmentId}"]`).fill(manualText)
    await page.locator(`[data-testid="editing-script-save-${editSegmentId}"]`).click()
    await page.waitForFunction((expected) => document.querySelector('.editing-script-text')?.textContent === expected, manualText, { timeout: 10_000 })

    await writeSubtitle('外部更新字幕', '外部更新第二句', '外部新增第三句')
    await reloadAndOpenEditor()
    await page.locator('[data-testid="editing-caption-reload-conflict"]').waitFor({ timeout: 10_000 })
    await page.locator('[data-testid="editing-caption-reload-preview"] summary').click()
    const previewText = await page.locator('[data-testid="editing-caption-reload-preview"]').textContent()
    const protectedText = await page.locator('.editing-script-text').first().textContent()
    const conflictScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-caption-reload-conflict.png')
    await page.screenshot({ path: conflictScreenshotPath, fullPage: false })
    if (!previewText?.includes('外部更新字幕') || protectedText !== manualText) throw new Error(`Caption reload conflict did not protect manual text: ${JSON.stringify({ previewText, protectedText })}`)

    await page.locator('[data-testid="editing-caption-reload-keep"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="editing-caption-reload-conflict"]') === null, null, { timeout: 10_000 })
    const keptText = await page.locator('.editing-script-text').first().textContent()

    await writeSubtitle('强制重载后的字幕', '强制重载第二句', '强制重载第三句')
    await reloadAndOpenEditor()
    await page.locator('[data-testid="editing-caption-reload-conflict"]').waitFor({ timeout: 10_000 })
    const forceBeforeText = await page.locator('.editing-script-text').first().textContent()
    await page.locator('[data-testid="editing-caption-reload-force"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="editing-caption-reload-conflict"]') === null, null, { timeout: 10_000 })
    await page.waitForFunction((expected) => document.querySelector('.editing-script-text')?.textContent === expected, '强制重载后的字幕', { timeout: 10_000 })
    const forceAfterText = await page.locator('.editing-script-text').first().textContent()
    const forceScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-caption-reload-force.png')
    await page.screenshot({ path: forceScreenshotPath, fullPage: false })
    const result = { previewIncludesIncoming: previewText?.includes('外部更新字幕') === true, protectedText: protectedText ?? '', keepPreserved: keptText === manualText, forceBeforeText: forceBeforeText ?? '', forceReplaced: forceAfterText === '强制重载后的字幕', conflictScreenshotPath, forceScreenshotPath, consoleErrors }
    console.log('AIVPlayer Smoke Editing Caption Reload')
    console.log(`Media: ${mediaPath}`)
    console.log(`Result: ${JSON.stringify(result)}`)
    if (!result.previewIncludesIncoming || !result.keepPreserved || !result.forceReplaced || result.forceBeforeText !== manualText || consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
