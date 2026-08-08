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
  const translationPath = join(smokeDirectory, 'sidecar-paths-smoke.zh-CN.srt')
  const translationAlternatePath = join(smokeDirectory, 'sidecar-paths-smoke.zh-CN.VTT')
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-sidecar-paths-home-'))
  await copyFile(sourceMediaPath, mediaPath)
  await writeFile(sourceEmptyPath, '')
  await writeFile(sourcePath, makeVtt('初始跨设备原文'))
  await writeFile(translationEmptyPath, '')
  await writeFile(translationPath, makeVtt('初始跨设备译文'))
  await writeFile(translationAlternatePath, makeVtt('初始跨设备备用译文'))

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

    const readStoredProject = async (): Promise<{ captionSourceRevision?: string; captionSourceRevisions?: Record<string, { source: number | null; translation: number | null }>; captionSourcePaths?: Record<string, { source: string | null; translation: string | null }>; captions: Array<{ text: string; kind?: 'source' | 'translation' }> } | null> => page.evaluate(() => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { captionSourceRevision?: string; captionSourceRevisions?: Record<string, { source: number | null; translation: number | null }>; captionSourcePaths?: Record<string, { source: string | null; translation: string | null }>; captions: Array<{ text: string; kind?: 'source' | 'translation' }> }>)
      return entries[0] ?? null
    })

    await openEditor()
    const baseline = await readStoredProject()
    if (!baseline?.captionSourceRevision || !baseline.captionSourceRevisions || !baseline.captions.some((caption) => caption.text.includes('初始跨设备原文'))) throw new Error(`Sidecar path baseline was not loaded: ${JSON.stringify(baseline)}`)

    const revisionMs = Date.now() + 5_000
    await writeFile(sourcePath, makeVtt('更新跨设备原文'))
    await writeFile(translationPath, makeVtt('更新跨设备译文'))
    await writeFile(translationAlternatePath, makeVtt('更新跨设备备用译文'))
    await utimes(sourcePath, new Date(revisionMs), new Date(revisionMs))
    await utimes(translationPath, new Date(revisionMs + 1_000), new Date(revisionMs + 1_000))
    await utimes(translationAlternatePath, new Date(revisionMs + 2_000), new Date(revisionMs + 2_000))

    await page.reload()
    await openEditor()
    await page.locator('[data-testid="editing-caption-reload-conflict"]').waitFor({ timeout: 10_000 })
    const sidecarDetails = page.locator('[data-testid="editing-caption-reload-sidecar-paths"]')
    await sidecarDetails.locator('summary').click()
    const sidecarSource = sidecarDetails.locator('.editing-caption-reload-sidecar-source').first()
    const selectedSourcePath = await sidecarSource.locator('small[data-testid^="editing-caption-reload-sidecar-selected-"][data-testid$="-source"] code').textContent()
    const selectedTranslationPath = await sidecarSource.locator('small[data-testid^="editing-caption-reload-sidecar-selected-"][data-testid$="-translation"] code').textContent()
    const candidateRows = await sidecarSource.locator('small').count()
    const conflictRows = await page.locator('[data-testid="editing-caption-reload-conflict"] .editing-caption-reload-row').count()
    const ambiguity = page.locator('[data-testid^="editing-caption-reload-sidecar-ambiguity-"]').first()
    const ambiguityCount = await page.locator('[data-testid^="editing-caption-reload-sidecar-ambiguity-"]').count()
    const ambiguityText = await ambiguity.textContent()
    const alternateTranslationButton = sidecarSource.locator('button[data-testid^="editing-caption-reload-select-sidecar-"][data-testid$="-translation-1"]')
    if (await alternateTranslationButton.count() !== 1) throw new Error('Alternate translation candidate button was not rendered')
    const alternateTranslationCandidatePath = await alternateTranslationButton.locator('code').textContent()
    if (!alternateTranslationCandidatePath) throw new Error('Alternate translation candidate path was empty')
    await alternateTranslationButton.click()
    await page.locator('[data-testid="editing-caption-reload-conflict"]').waitFor({ state: 'detached', timeout: 10_000 })
    await page.waitForFunction((expectedPath) => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { captionSourcePaths?: Record<string, { translation: string | null }> }>)
      return Object.values(entries[0]?.captionSourcePaths ?? {})[0]?.translation === expectedPath
    }, alternateTranslationCandidatePath, { timeout: 10_000 })
    const selectedProject = await readStoredProject()
    const sourceId = Object.keys(baseline.captionSourceRevisions)[0] ?? ''
    const selectedCandidatePath = selectedProject?.captionSourcePaths?.[sourceId]?.translation ?? null
    const selectedCandidateText = selectedProject?.captions.find((caption) => caption.text.includes('更新跨设备备用译文'))?.text ?? null
    const selectedCandidateRevision = selectedProject?.captionSourceRevisions?.[sourceId]?.translation ?? null
    await page.locator('[data-testid="editing-undo"]').click()
    await page.waitForFunction((expectedText) => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { captions: Array<{ text: string }> }>)
      return entries[0]?.captions.some((caption) => caption.text.includes(expectedText)) ?? false
    }, '初始跨设备译文', { timeout: 10_000 })
    const undoneProject = await readStoredProject()
    const undoPreferredPath = undoneProject?.captionSourcePaths?.[sourceId]?.translation ?? null
    const undoCaptionText = undoneProject?.captions.find((caption) => caption.kind === 'translation')?.text ?? null
    await page.locator('[data-testid="editing-redo"]').click()
    await page.waitForFunction((expectedPath) => {
      const entries = Object.values(JSON.parse(localStorage.getItem('aivplayer.editing-projects.v1') ?? '{}') as Record<string, { captionSourcePaths?: Record<string, { translation: string | null }> }>)
      return Object.values(entries[0]?.captionSourcePaths ?? {})[0]?.translation === expectedPath
    }, alternateTranslationCandidatePath, { timeout: 10_000 })
    const redoneProject = await readStoredProject()
    const redoPreferredPath = redoneProject?.captionSourcePaths?.[sourceId]?.translation ?? null
    const redoCaptionText = redoneProject?.captions.find((caption) => caption.text.includes('更新跨设备备用译文'))?.text ?? null
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
      ambiguityCount,
      ambiguityText,
      selectedCandidatePath,
      alternateTranslationCandidatePath,
      selectedCandidateText,
      selectedCandidateRevision,
      undoPreferredPath,
      undoCaptionText,
      redoPreferredPath,
      redoCaptionText,
      screenshotPath,
      consoleErrors
    }
    console.log('AIVPlayer Smoke Editing Sidecar Paths')
    console.log(JSON.stringify(result))
    if (result.selectedSourcePath?.toLowerCase() !== sourcePath.toLowerCase() || result.selectedTranslationPath?.toLowerCase() !== translationPath.toLowerCase() || result.candidateRows < 6 || result.conflictRows !== 2 || result.ambiguityCount !== 1 || !result.ambiguityText?.includes('2') || result.selectedCandidatePath?.toLowerCase() !== result.alternateTranslationCandidatePath.toLowerCase() || result.selectedCandidateText !== '更新跨设备备用译文' || result.selectedCandidateRevision === null || result.undoPreferredPath?.toLowerCase() === result.alternateTranslationCandidatePath.toLowerCase() || result.undoCaptionText !== '初始跨设备译文' || result.redoPreferredPath?.toLowerCase() !== result.alternateTranslationCandidatePath.toLowerCase() || result.redoCaptionText !== '更新跨设备备用译文' || result.consoleErrors.length > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
