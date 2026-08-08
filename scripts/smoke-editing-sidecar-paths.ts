import { _electron as electron } from 'playwright'
import { copyFile, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

function makeVtt(text: string): string {
  return `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n${text}\n`
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-sidecar-paths-'))
  const mediaPath = join(smokeDirectory, 'sidecar-paths-smoke.mp4')
  const sourceEmptyPath = join(smokeDirectory, 'sidecar-paths-smoke.SRT')
  const sourcePath = join(smokeDirectory, 'sidecar-paths-smoke.VTT')
  const translationEmptyPath = join(smokeDirectory, 'sidecar-paths-smoke.translated.SRT')
  const translationPath = join(smokeDirectory, 'sidecar-paths-smoke.zh-CN.VTT')
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-sidecar-paths-home-'))
  await copyFile(sourceMediaPath, mediaPath)
  await writeFile(sourceEmptyPath, '')
  await writeFile(sourcePath, makeVtt('初始跨设备原文'))
  await writeFile(translationEmptyPath, '')
  await writeFile(translationPath, makeVtt('初始跨设备译文'))

  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${smokeHomeDirectory}`, 'out/main/index.js', mediaPath],
    env: { ...process.env, HOME: smokeHomeDirectory }
  })

  try {
    const page = await app.firstWindow()
    const consoleErrors: string[] = []
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', (error) => consoleErrors.push(error.message))

    const openEditor = async (): Promise<void> => {
      await page.waitForLoadState('domcontentloaded')
      await page.waitForSelector('video.video-surface', { timeout: 10_000 })
      if (await page.locator('[data-testid="editing-timeline"]').count() === 0) await page.locator('.clip-editor-tool-button').click()
      await page.locator('[data-testid="editing-timeline"]').waitFor({ timeout: 10_000 })
      await page.locator('[data-testid^="editing-script-row-"]').first().waitFor({ timeout: 10_000 })
    }

    const readStoredProject = async (): Promise<{ captionSourceRevision?: string; captionSourceRevisions?: Record<string, { source: number | null; translation: number | null }>; captions: Array<{ text: string }> } | null> => page.evaluate(() => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { captionSourceRevision?: string; captionSourceRevisions?: Record<string, { source: number | null; translation: number | null }>; captions: Array<{ text: string }> }>)
      return entries[0] ?? null
    })

    await openEditor()
    const baseline = await readStoredProject()
    if (!baseline?.captionSourceRevision || !baseline.captionSourceRevisions || !baseline.captions.some((caption) => caption.text.includes('初始跨设备原文'))) throw new Error(`Sidecar path baseline was not loaded: ${JSON.stringify(baseline)}`)

    const revisionMs = Date.now() + 5_000
    await writeFile(sourcePath, makeVtt('更新跨设备原文'))
    await writeFile(translationPath, makeVtt('更新跨设备译文'))
    await utimes(sourcePath, new Date(revisionMs), new Date(revisionMs))
    await utimes(translationPath, new Date(revisionMs + 1_000), new Date(revisionMs + 1_000))

    await page.reload()
    await openEditor()
    await page.locator('[data-testid="editing-caption-reload-conflict"]').waitFor({ timeout: 10_000 })
    const sidecarDetails = page.locator('[data-testid="editing-caption-reload-sidecar-paths"]')
    await sidecarDetails.locator('summary').click()
    const sidecarSource = sidecarDetails.locator('.editing-caption-reload-sidecar-source').first()
    const selectedSourcePath = await sidecarSource.locator('small').nth(0).locator('code').textContent()
    const selectedTranslationPath = await sidecarSource.locator('small').nth(1).locator('code').textContent()
    const candidateRows = await sidecarSource.locator('small').count()
    const conflictRows = await page.locator('[data-testid="editing-caption-reload-conflict"] .editing-caption-reload-row').count()
    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-sidecar-paths.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    const result = {
      baselineSourceRevision: baseline.captionSourceRevisions[Object.keys(baseline.captionSourceRevisions)[0] ?? '']?.source ?? null,
      selectedSourcePath,
      selectedTranslationPath,
      expectedSourcePath: sourcePath,
      expectedTranslationPath: translationPath,
      candidateRows,
      conflictRows,
      screenshotPath,
      consoleErrors
    }
    console.log('AIVPlayer Smoke Editing Sidecar Paths')
    console.log(JSON.stringify(result))
    if (result.selectedSourcePath?.toLowerCase() !== sourcePath.toLowerCase() || result.selectedTranslationPath?.toLowerCase() !== translationPath.toLowerCase() || result.candidateRows < 4 || result.conflictRows !== 2 || result.consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
