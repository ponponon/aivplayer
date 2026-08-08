import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { access, appendFile, chmod, copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { connect } from '@lancedb/lancedb'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sourceMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'

type SmokeSession = {
  app: ElectronApplication
  page: Page
  errors: string[]
}

async function waitForFile(filePath: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await access(filePath)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  throw new Error(`Smoke marker was not created: ${filePath}`)
}

async function launchPlayer(userDataDirectory: string, mediaPath: string, tesseractPath: string, ttsPath: string, markerPath: string, ttsMarkerPath: string, translationBaseUrl: string): Promise<SmokeSession> {
  const app = await electron.launch({
    args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
    env: {
      ...process.env,
      HOME: userDataDirectory,
      AIVPLAYER_TESSERACT_PATH: tesseractPath,
      AIVPLAYER_TESSERACT_LANG: 'eng',
      AIVPLAYER_TTS_PATH: ttsPath,
      AIVPLAYER_TRANSLATION_BASE_URL: translationBaseUrl,
      AIVPLAYER_TRANSLATION_API_KEY: 'smoke',
      AIVPLAYER_TRANSLATION_MODEL: 'smoke-model',
      AIVPLAYER_EVIDENCE_SMOKE_MARKER: markerPath,
      AIVPLAYER_TTS_SMOKE_MARKER: ttsMarkerPath
    }
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root', { timeout: 15_000 })
  await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
  return { app, page, errors }
}

async function startFakeTranslationServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const summaryResponse = body.includes('必须只返回 JSON')
      response.writeHead(200, { 'content-type': 'application/json' })
      if (summaryResponse) {
        response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: 'Smoke old summary', overview: 'Smoke summary overview.', synopsis: 'Smoke summary synopsis.', keyPoints: ['Smoke summary point'], characters: [], themes: ['Smoke'], ending: '' }) } }] }))
        return
      }
      const ids = [...body.matchAll(/cue-\d+/g)].map((match) => match[0]).filter((id, index, values) => values.indexOf(id) === index)
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(ids.map((id) => ({ id, text: `Smoke translated ${id}` }))) } }] }))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fake translation server did not expose a port')
  return { server, baseUrl: `http://127.0.0.1:${address.port}/v1/chat/completions` }
}

async function installFakeTesseract(directory: string, markerPath: string): Promise<string> {
  const path = join(directory, 'fake-tesseract.sh')
  await writeFile(path, [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then',
    "  printf 'tesseract 5.0 smoke\\n'",
    '  exit 0',
    'fi',
    ': > "$AIVPLAYER_EVIDENCE_SMOKE_MARKER"',
    'sleep 1',
    "printf 'Smoke OCR text\\n'",
    ''
  ].join('\n'), 'utf8')
  await chmod(path, 0o755)
  await rm(markerPath, { force: true })
  return path
}

async function installFakeTts(directory: string, markerPath: string): Promise<string> {
  const path = join(directory, 'fake-tts.sh')
  await writeFile(path, [
    '#!/bin/sh',
    'if [ "$1" = "--version" ] || { [ "$1" = "-v" ] && [ "$2" = "?" ]; }; then',
    "  printf 'aivplayer fake tts 1.0\\n'",
    '  exit 0',
    'fi',
    'output=""',
    'while [ "$#" -gt 0 ]; do',
    '  case "$1" in',
    '    -o) output="$2"; shift 2 ;;',
    '    -v|--data-format) shift 2 ;;',
    '    *) shift ;;',
    '  esac',
    'done',
    '[ -n "$output" ] || exit 2',
    ': > "$AIVPLAYER_TTS_SMOKE_MARKER"',
    'ffmpeg -hide_banner -loglevel error -f lavfi -i sine=frequency=880:duration=0.35 -y "$output"',
    ''
  ].join('\n'), 'utf8')
  await chmod(path, 0o755)
  await rm(markerPath, { force: true })
  return path
}

async function startOcr(page: Page, mediaPath: string): Promise<unknown> {
  return page.evaluate((path) => window.aiv.startMediaEvidenceTask({
    kind: 'ocr',
    mediaPath: path,
    inputHash: `smoke-input-${path}`,
    ranges: [{ startSeconds: 0.5, endSeconds: 1.5 }],
    maxRetries: 0
  }), mediaPath)
}

async function startOcrFromUi(page: Page): Promise<void> {
  await page.locator('.panel-tab').nth(4).click()
  const task = page.locator('[data-testid="vision-ocr-task"]')
  await task.waitFor({ timeout: 10_000 })
  await page.locator('[data-testid="vision-ocr-start"]').fill('0.5')
  await page.locator('[data-testid="vision-ocr-end"]').fill('1.5')
  const startButton = page.locator('[data-testid="vision-ocr-start-button"]')
  await startButton.waitFor({ timeout: 10_000 })
  await page.waitForFunction(() => !(document.querySelector('[data-testid="vision-ocr-start-button"]') as HTMLButtonElement | null)?.disabled, undefined, { timeout: 15_000 })
  await startButton.click()
  await page.locator('[data-testid="vision-ocr-task"][data-persistence-status="persisted"]').waitFor({ timeout: 20_000 })
}

async function startTtsFromUi(page: Page): Promise<void> {
  const task = page.locator('[data-testid="vision-tts-task"]')
  await task.waitFor({ timeout: 10_000 })
  const saveOneDraft = async (text: string, start: string, end: string, draftText: string, expectedDraftCount: number, assertIdleBeforeSave: boolean): Promise<void> => {
    await page.locator('[data-testid="vision-tts-text"]').fill(text)
    await page.locator('[data-testid="vision-tts-start"]').fill(start)
    await page.locator('[data-testid="vision-tts-end"]').fill(end)
    const startButton = page.locator('[data-testid="vision-tts-start-button"]')
    await page.waitForFunction(() => !(document.querySelector('[data-testid="vision-tts-start-button"]') as HTMLButtonElement | null)?.disabled, undefined, { timeout: 15_000 })
    await startButton.click()
    await page.locator('[data-testid="vision-tts-audio"]').waitFor({ timeout: 20_000 })
    await page.waitForFunction(() => {
      const audio = document.querySelector('[data-testid="vision-tts-audio"]') as HTMLAudioElement | null
      return audio !== null && (audio.readyState >= 1 || audio.error !== null)
    }, undefined, { timeout: 20_000 })
    const audioState = await page.locator('[data-testid="vision-tts-audio"]').evaluate((element) => {
      const audio = element as HTMLAudioElement
      return { readyState: audio.readyState, error: audio.error?.message ?? null, networkState: audio.networkState }
    })
    if (audioState.error) throw new Error(`TTS audio protocol error: ${JSON.stringify(audioState)}`)
    if (assertIdleBeforeSave && await task.getAttribute('data-draft-status') !== 'idle') throw new Error('TTS draft appeared before explicit confirmation')
    await page.locator('[data-testid="vision-tts-draft-text"]').fill(draftText)
    await page.locator('[data-testid="vision-tts-save-draft-button"]').click()
    await page.waitForFunction(async (count) => (await window.aiv.listMediaEvidenceDrafts()).length === count, expectedDraftCount, { timeout: 15_000 })
    await page.locator('[data-testid="vision-tts-task"][data-draft-status="saved"]').waitFor({ timeout: 15_000 })
  }

  await saveOneDraft('Smoke TTS text', '0.5', '1.5', 'Smoke TTS confirmed draft', 1, true)
  await saveOneDraft('Smoke TTS second text', '2.0', '3.0', 'Smoke TTS second draft', 2, false)
  if (await page.locator('[data-testid="vision-ocr-task"]').getAttribute('data-persistence-status') !== 'persisted') throw new Error('TTS progress leaked into OCR task card')
}

async function saveReplacementTtsDraft(page: Page): Promise<string> {
  await page.locator('.panel-tab').nth(4).click()
  const task = page.locator('[data-testid="vision-tts-task"]')
  await task.waitFor({ timeout: 10_000 })
  await page.locator('[data-testid="vision-tts-text"]').fill('Smoke replacement source')
  await page.locator('[data-testid="vision-tts-start"]').fill('0.5')
  await page.locator('[data-testid="vision-tts-end"]').fill('1.5')
  await page.locator('[data-testid="vision-tts-start-button"]').click()
  await page.locator('[data-testid="vision-tts-audio"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(() => {
    const audio = document.querySelector('[data-testid="vision-tts-audio"]') as HTMLAudioElement | null
    return audio !== null && (audio.readyState >= 1 || audio.error !== null)
  }, undefined, { timeout: 20_000 })
  await page.locator('[data-testid="vision-tts-draft-text"]').fill('Smoke replacement draft')
  await page.locator('[data-testid="vision-tts-save-draft-button"]').click()
  await page.waitForFunction(async () => (await window.aiv.listMediaEvidenceDrafts()).length === 1, undefined, { timeout: 15_000 })
  const drafts = await page.evaluate(() => window.aiv.listMediaEvidenceDrafts())
  const draftId = drafts[0]?.id
  if (!draftId) throw new Error(`Replacement TTS draft was not saved: ${JSON.stringify(drafts)}`)
  return draftId
}

async function translateFormalSubtitleFromUi(page: Page, mediaPath: string, translationBaseUrl: string): Promise<void> {
  await page.locator('.panel-tab').nth(1).click()
  const sidecar = await page.evaluate((path) => window.aiv.resolveMediaSubtitleSidecar({ mediaPath: path }), mediaPath)
  if (!sidecar.success || !sidecar.subtitlePath) throw new Error(`Translation smoke source sidecar unavailable: ${JSON.stringify(sidecar)}`)
  const translatedResult = await page.evaluate((request) => window.aiv.translateAsrSubtitle(request), {
    mediaPath,
    subtitlePath: sidecar.subtitlePath,
    subtitleSrtPath: sidecar.subtitleSrtPath,
    sourceLanguage: 'auto',
    targetLanguage: 'zh' as const
  })
  if (!translatedResult.success || !translatedResult.subtitlePath) throw new Error(`Translation smoke generation failed: ${JSON.stringify(translatedResult)}`)
  await page.evaluate(async (baseUrl) => {
    const settings = await window.aiv.getAppSettings()
    await window.aiv.setAppSettings({ ...settings, asr: { ...settings.asr, translationBaseUrl: baseUrl, translationApiKey: 'smoke', translationModel: 'smoke-model' } })
  }, translationBaseUrl)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#root', { timeout: 15_000 })
  await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
  await page.locator('.panel-tab').nth(1).click()
  await page.waitForFunction(() => document.querySelectorAll('.subtitle-tools-row .subtitle-status.ready').length >= 2, undefined, { timeout: 20_000 })
}

async function summarizeFormalSubtitleFromUi(page: Page, mediaPath: string): Promise<void> {
  await page.locator('.panel-tab').nth(3).click()
  const sidecar = await page.evaluate((path) => window.aiv.resolveMediaSubtitleSidecar({ mediaPath: path }), mediaPath)
  if (!sidecar.success || !sidecar.subtitlePath) throw new Error(`Summary smoke source sidecar unavailable: ${JSON.stringify(sidecar)}`)
  const translated = await page.evaluate((request) => window.aiv.resolveTranslatedAsrSubtitleCache(request), {
    mediaPath,
    subtitlePath: sidecar.subtitlePath,
    subtitleSrtPath: sidecar.subtitleSrtPath,
    sourceLanguage: 'auto',
    targetLanguage: 'zh' as const
  })
  const summarySource = translated.success && translated.subtitlePath
    ? { subtitlePath: translated.subtitlePath, sourceLanguage: 'zh', sourceType: 'translated' as const }
    : { subtitlePath: sidecar.subtitlePath, sourceLanguage: 'auto', sourceType: 'raw' as const }
  const result = await page.evaluate((request) => window.aiv.summarizeAsrSubtitle(request), {
    mediaPath,
    ...summarySource,
    targetLanguage: 'zh' as const,
    mode: 'quick' as const
  })
  if (!result.success || !result.summary) throw new Error(`Summary smoke generation failed: ${JSON.stringify(result)}`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#root', { timeout: 15_000 })
  await page.locator('video.video-surface').waitFor({ timeout: 15_000 })
  await page.locator('.panel-tab').nth(3).click()
  await page.locator('.summary-article').waitFor({ timeout: 20_000 })
  const summaryText = await page.locator('.summary-article').textContent()
  if (!summaryText?.includes('Smoke old summary')) throw new Error(`Summary smoke content mismatch: ${summaryText}`)
}

async function assertTranslationClearedAfterFormalImport(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('.subtitle-tools-row .subtitle-status.ready').length < 2, undefined, { timeout: 20_000 })
  await page.locator('video.video-surface').evaluate((video) => {
    (video as HTMLVideoElement).currentTime = 0.7
    video.dispatchEvent(new Event('timeupdate'))
  })
  await page.waitForFunction(() => document.querySelector('.subtitle-overlay')?.textContent?.includes('Smoke replacement draft') === true, undefined, { timeout: 10_000 })
  const overlay = await page.locator('.subtitle-overlay').textContent()
  if (overlay?.includes('Smoke translated')) throw new Error(`Old translation remained after formal import: ${overlay}`)
}

async function assertSummaryClearedAfterFormalImport(page: Page): Promise<void> {
  await page.locator('.panel-tab').nth(3).click()
  await page.waitForFunction(() => document.querySelector('.summary-article') === null && document.querySelector('.summary-empty-state') !== null, undefined, { timeout: 20_000 })
  const summaryText = await page.locator('.summary-panel-content').textContent()
  if (summaryText?.includes('Smoke old summary')) throw new Error(`Old summary remained after formal import: ${summaryText}`)
}

function getFormalSubtitlePath(mediaPath: string, extension: 'vtt' | 'srt'): string {
  return `${mediaPath.replace(/\.[^./\\]+$/, '')}.${extension}`
}

async function importAndDeleteTtsDraft(page: Page, mediaPath: string): Promise<{ draftId: string; formalVttPath: string; formalSrtPath: string; cueCount: number }> {
  const drafts = await page.evaluate(() => window.aiv.listMediaEvidenceDrafts())
  if (drafts.length !== 2 || drafts.some((draft) => draft.mediaPath !== mediaPath || draft.cues.length !== 1)) throw new Error(`TTS draft list mismatch: ${JSON.stringify(drafts)}`)
  for (const draft of drafts) {
    await page.locator(`[data-testid="vision-tts-select-${draft.id}"]`).check()
  }
  const mergeButton = page.locator('[data-testid="vision-tts-merge-drafts-button"]')
  await mergeButton.waitFor({ timeout: 10_000 })
  await mergeButton.click()
  await page.waitForFunction(async () => (await window.aiv.listMediaEvidenceDrafts()).some((draft) => draft.cues.length === 2), undefined, { timeout: 15_000 })
  const draftsAfterMerge = await page.evaluate(() => window.aiv.listMediaEvidenceDrafts())
  const mergedDraft = draftsAfterMerge.find((draft) => draft.cues.length === 2)
  if (!mergedDraft || draftsAfterMerge.length !== 3) throw new Error(`Merged TTS draft mismatch: ${JSON.stringify(draftsAfterMerge)}`)
  const draftId = mergedDraft.id
  const formalVttPath = getFormalSubtitlePath(mediaPath, 'vtt')
  const formalSrtPath = getFormalSubtitlePath(mediaPath, 'srt')
  for (const path of [formalVttPath, formalSrtPath]) {
    try {
      await access(path)
      throw new Error(`Formal subtitle unexpectedly exists before import: ${path}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  const importButton = page.locator(`[data-testid="vision-tts-import-${draftId}"]`)
  await importButton.click()
  await page.waitForFunction((id) => document.querySelector(`[data-testid="vision-tts-draft-${id}"] [data-testid="vision-tts-import-${id}"]`) !== null, draftId, { timeout: 10_000 })
  await waitForFile(formalVttPath)
  await waitForFile(formalSrtPath)
  const importedVtt = await readFile(formalVttPath, 'utf8')
  const importedSrt = await readFile(formalSrtPath, 'utf8')
  if (!importedVtt.includes('00:00:00.500 --> 00:00:01.500') || !importedVtt.includes('00:00:02.000 --> 00:00:03.000') || !importedVtt.includes('Smoke TTS confirmed draft') || !importedVtt.includes('Smoke TTS second draft') || !importedSrt.includes('2\n00:00:02,000 --> 00:00:03,000\nSmoke TTS second draft')) throw new Error('Formal multi-cue subtitle content mismatch after import')

  await page.locator('video.video-surface').evaluate((video) => { (video as HTMLVideoElement).currentTime = 0.7 })
  await page.waitForFunction(() => document.querySelector('.subtitle-overlay')?.textContent?.includes('Smoke TTS confirmed draft') === true, undefined, { timeout: 10_000 })
  await page.locator('video.video-surface').evaluate((video) => { (video as HTMLVideoElement).currentTime = 2.5 })
  await page.waitForFunction(() => document.querySelector('.subtitle-overlay')?.textContent?.includes('Smoke TTS second draft') === true, undefined, { timeout: 10_000 })

  await importButton.click()
  const confirmImportButton = page.locator('[data-testid="vision-tts-confirm-import-button"]')
  await page.waitForFunction(() => !(document.querySelector('[data-testid="vision-tts-confirm-import-button"]') as HTMLButtonElement | null)?.disabled, undefined, { timeout: 10_000 })
  await confirmImportButton.click()
  await page.waitForFunction(() => document.querySelector('[data-testid="vision-tts-confirm-import-button"]') === null, undefined, { timeout: 10_000 })
  const overwrittenVtt = await readFile(formalVttPath, 'utf8')
  if (!overwrittenVtt.includes('Smoke TTS confirmed draft')) throw new Error('Formal subtitle content mismatch after overwrite confirmation')

  const draftsBeforeDelete = await page.evaluate(() => window.aiv.listMediaEvidenceDrafts())
  for (const draft of draftsBeforeDelete) {
    await page.locator(`[data-testid="vision-tts-delete-${draft.id}"]`).click()
    await page.waitForFunction((id) => document.querySelector(`[data-testid="vision-tts-draft-${id}"]`) === null, draft.id, { timeout: 10_000 })
  }
  await page.waitForFunction(() => document.querySelector('[data-testid="vision-tts-draft-list"]') === null, undefined, { timeout: 10_000 })
  const draftsAfterDelete = await page.evaluate(() => window.aiv.listMediaEvidenceDrafts())
  if (draftsAfterDelete.length !== 0) throw new Error(`TTS draft was not deleted: ${JSON.stringify(draftsAfterDelete)}`)
  return { draftId, formalVttPath, formalSrtPath, cueCount: mergedDraft.cues.length }
}

async function searchOcrAndLocate(page: Page): Promise<{ evidenceId: string; currentTime: number }> {
  const searchInput = page.locator('.vision-text-search input')
  await searchInput.fill('Smoke OCR text')
  await page.locator('.vision-text-search .vision-search-button').click()
  const result = page.locator('.vision-result[data-evidence-type="ocr"]')
  try {
    await result.waitFor({ timeout: 30_000 })
  } catch (error) {
    const diagnostic = await page.evaluate(() => window.aiv.searchVisionText({ query: 'Smoke OCR text', limit: 24, mode: 'hybrid' }))
    throw new Error(`OCR search result did not render: ${JSON.stringify({ diagnostic, error: error instanceof Error ? error.message : String(error) })}`)
  }
  const evidenceId = await result.getAttribute('data-evidence-id')
  const matchedText = await result.locator('.vision-result-match').textContent()
  if (!evidenceId || matchedText?.trim() !== 'Smoke OCR text') throw new Error(`OCR search result mismatch: ${JSON.stringify({ evidenceId, matchedText })}`)
  await result.click()
  await page.waitForFunction(() => {
    const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
    return video !== null && Math.abs(video.currentTime - 0.5) <= 0.1
  }, undefined, { timeout: 15_000 })
  const currentTime = await page.locator('video.video-surface').evaluate((video) => (video as HTMLVideoElement).currentTime)
  return { evidenceId, currentTime }
}

async function assertRestoredFormalSubtitle(page: Page, expectedText: string): Promise<void> {
  await page.waitForFunction(() => (document.querySelector('video.video-surface') as HTMLVideoElement | null)?.readyState !== undefined && (document.querySelector('video.video-surface') as HTMLVideoElement).readyState >= 1, undefined, { timeout: 20_000 })
  await page.locator('video.video-surface').evaluate((video) => {
    const element = video as HTMLVideoElement
    element.currentTime = 0.7
    element.dispatchEvent(new Event('timeupdate'))
  })
  await page.waitForFunction((text) => document.querySelector('.subtitle-overlay')?.textContent?.includes(text) === true, expectedText, { timeout: 20_000 })
}

async function assertNoSubtitleLeak(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelector('.subtitle-overlay')?.classList.contains('empty') === true, undefined, { timeout: 20_000 })
}

async function assertInvalidSubtitleNotice(page: Page, mediaPath: string): Promise<void> {
  await page.locator('.panel-tab').nth(1).click()
  const notice = page.locator('[data-testid="subtitle-asr-notice"].failed')
  try {
    await notice.waitFor({ timeout: 20_000 })
  } catch (error) {
    const diagnostic = await page.evaluate(async (path) => ({
      sidecar: await window.aiv.resolveMediaSubtitleSidecar({ mediaPath: path }).catch((reason: unknown) => ({ error: String(reason) })),
      notice: document.querySelector('[data-testid="subtitle-asr-notice"]')?.textContent ?? null,
      overlay: document.querySelector('.subtitle-overlay')?.textContent ?? null
    }), mediaPath)
    throw new Error(`Invalid sidecar notice did not render: ${JSON.stringify({ diagnostic, error: error instanceof Error ? error.message : String(error) })}`)
  }
  const message = await notice.textContent()
  if (!message?.includes('字幕文件无法解析')) throw new Error(`Invalid sidecar notice mismatch: ${message ?? '<empty>'}`)
  await assertNoSubtitleLeak(page)
}

async function seedVisualEvidence(userDataDirectory: string, mediaPath: string): Promise<void> {
  const database = await connect(join(userDataDirectory, 'library', 'vision', 'lancedb'))
  const table = await database.openTable('video_evidence')
  await table.add([{
    id: 'smoke-visual-evidence',
    source_id: 'smoke-source',
    video_path: mediaPath,
    file_name: 'stable.mp4',
    evidence_type: 'visual',
    start_seconds: 0,
    end_seconds: 1,
    text: '',
    frame_id: 'smoke-frame',
    thumbnail_path: '',
    confidence: null,
    source_fingerprint: 'smoke-visual-fingerprint',
    model_id: 'smoke-model',
    model_variant: 'v1',
    generated_at: Date.now()
  }])
}

async function readEvidenceRows(userDataDirectory: string): Promise<Array<Record<string, unknown>>> {
  const database = await connect(join(userDataDirectory, 'library', 'vision', 'lancedb'))
  const table = await database.openTable('video_evidence')
  return await table.query().toArray() as unknown as Array<Record<string, unknown>>
}

async function main(): Promise<void> {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-evidence-'))
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-evidence-user-data-'))
  const stableMediaPath = join(smokeDirectory, 'stable.mp4')
  const staleMediaPath = join(smokeDirectory, 'stale.mp4')
  const isolatedMediaPath = join(smokeDirectory, 'isolated.mp4')
  const invalidMediaPath = join(smokeDirectory, 'invalid.mp4')
  const invalidSubtitlePath = getFormalSubtitlePath(invalidMediaPath, 'vtt')
  const markerPath = join(smokeDirectory, 'tesseract.started')
  const ttsMarkerPath = join(smokeDirectory, 'tts.started')
  await copyFile(sourceMediaPath, stableMediaPath)
  await copyFile(sourceMediaPath, staleMediaPath)
  await copyFile(sourceMediaPath, isolatedMediaPath)
  await copyFile(sourceMediaPath, invalidMediaPath)
  await writeFile(invalidSubtitlePath, 'WEBVTT\n\n00:00:bad --> 00:00:01.000\nnot a valid cue\n', 'utf8')
  const tesseractPath = await installFakeTesseract(smokeDirectory, markerPath)
  const ttsPath = await installFakeTts(smokeDirectory, ttsMarkerPath)
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null
  let thirdApp: ElectronApplication | null = null
  let fourthApp: ElectronApplication | null = null
  const translationServer = await startFakeTranslationServer()

  try {
    const first = await launchPlayer(userDataDirectory, stableMediaPath, tesseractPath, ttsPath, markerPath, ttsMarkerPath, translationServer.baseUrl)
    firstApp = first.app
    const capabilities = await first.page.evaluate(() => window.aiv.getMediaEvidenceCapabilities())
    if (!capabilities.ocr.available || !capabilities.tts.available) throw new Error(`Evidence capability is unavailable: ${JSON.stringify(capabilities)}`)

    await startOcrFromUi(first.page)
    const stablePersistenceStatus = await first.page.locator('[data-testid="vision-ocr-task"]').getAttribute('data-persistence-status')
    if (stablePersistenceStatus !== 'persisted') throw new Error(`Stable OCR persistence mismatch: ${stablePersistenceStatus}`)
    await startTtsFromUi(first.page)
    const draftDirectory = join(userDataDirectory, 'evidence-drafts')
    const draftFiles = (await readdir(draftDirectory)).filter((fileName) => fileName.endsWith('.vtt'))
    if (draftFiles.length !== 2) throw new Error(`TTS draft file count mismatch: ${JSON.stringify(draftFiles)}`)
    const draftManifestFiles = (await readdir(draftDirectory)).filter((fileName) => fileName.endsWith('.json'))
    if (draftManifestFiles.length !== 2) throw new Error(`TTS draft manifest count mismatch: ${JSON.stringify(draftManifestFiles)}`)
    const draftContents = await Promise.all(draftFiles.map((fileName) => readFile(join(draftDirectory, fileName), 'utf8')))
    if (!draftContents.some((content) => content.includes('00:00:00.500 --> 00:00:01.500') && content.includes('Smoke TTS confirmed draft')) || !draftContents.some((content) => content.includes('00:00:02.000 --> 00:00:03.000') && content.includes('Smoke TTS second draft'))) {
      throw new Error(`TTS draft content mismatch: ${draftContents.join('\n---\n')}`)
    }
    const formalSubtitles = await importAndDeleteTtsDraft(first.page, stableMediaPath)
    await translateFormalSubtitleFromUi(first.page, stableMediaPath, translationServer.baseUrl)
    await summarizeFormalSubtitleFromUi(first.page, stableMediaPath)
    const replacementDraftId = await saveReplacementTtsDraft(first.page)
    const replacementImportButton = first.page.locator(`[data-testid="vision-tts-import-${replacementDraftId}"]`)
    await replacementImportButton.click()
    const confirmReplacementImportButton = first.page.locator('[data-testid="vision-tts-confirm-import-button"]')
    await first.page.waitForFunction(() => !(document.querySelector('[data-testid="vision-tts-confirm-import-button"]') as HTMLButtonElement | null)?.disabled, undefined, { timeout: 10_000 })
    await confirmReplacementImportButton.click()
    await first.page.waitForFunction(() => document.querySelector('[data-testid="vision-tts-confirm-import-button"]') === null, undefined, { timeout: 10_000 })
    const replacementVtt = await readFile(formalSubtitles.formalVttPath, 'utf8')
    if (!replacementVtt.includes('Smoke replacement draft')) throw new Error('Formal subtitle content mismatch after replacement import')
    await assertTranslationClearedAfterFormalImport(first.page)
    await assertSummaryClearedAfterFormalImport(first.page)
    await first.page.locator('.panel-tab').nth(4).click()
    await first.page.locator(`[data-testid="vision-tts-delete-${replacementDraftId}"]`).click()
    await first.page.waitForFunction((id) => document.querySelector(`[data-testid="vision-tts-draft-${id}"]`) === null, replacementDraftId, { timeout: 10_000 })
    await first.page.locator('.panel-tab').nth(4).click()
    const draftFilesAfterDelete = (await readdir(draftDirectory)).filter((fileName) => fileName.endsWith('.vtt') || fileName.endsWith('.json'))
    if (draftFilesAfterDelete.length !== 0) throw new Error(`TTS draft files remained after delete: ${JSON.stringify(draftFilesAfterDelete)}`)
    const locatedOcr = await searchOcrAndLocate(first.page)
    const screenshotPath = join(userDataDirectory, 'aivplayer-smoke-evidence-ocr.png')
    await first.page.screenshot({ path: screenshotPath, fullPage: false })
    await first.app.close()
    firstApp = null
    await seedVisualEvidence(userDataDirectory, stableMediaPath)

    await rm(markerPath, { force: true })
    const second = await launchPlayer(userDataDirectory, stableMediaPath, tesseractPath, ttsPath, markerPath, ttsMarkerPath, translationServer.baseUrl)
    secondApp = second.app
    await assertRestoredFormalSubtitle(second.page, 'Smoke replacement draft')
    await assertSummaryClearedAfterFormalImport(second.page)
    const stalePromise = startOcr(second.page, staleMediaPath)
    await waitForFile(markerPath)
    await appendFile(staleMediaPath, Buffer.from('changed-after-task-start'))
    const staleResult = await stalePromise as { status?: string; persistenceStatus?: string; persistedArtifactCount?: number }
    if (staleResult.status !== 'completed' || staleResult.persistenceStatus !== 'skipped-stale' || staleResult.persistedArtifactCount !== 0) {
      throw new Error(`Stale OCR persistence mismatch: ${JSON.stringify(staleResult)}`)
    }
    await second.app.close()
    secondApp = null

    const third = await launchPlayer(userDataDirectory, isolatedMediaPath, tesseractPath, ttsPath, markerPath, ttsMarkerPath, translationServer.baseUrl)
    thirdApp = third.app
    await assertNoSubtitleLeak(third.page)
    await third.app.close()
    thirdApp = null

    const fourth = await launchPlayer(userDataDirectory, invalidMediaPath, tesseractPath, ttsPath, markerPath, ttsMarkerPath, translationServer.baseUrl)
    fourthApp = fourth.app
    await assertInvalidSubtitleNotice(fourth.page, invalidMediaPath)
    await fourth.app.close()
    fourthApp = null

    const rows = await readEvidenceRows(userDataDirectory)
    const ocrRows = rows.filter((row) => row.evidence_type === 'ocr')
    const subtitleRows = rows.filter((row) => row.evidence_type === 'subtitle')
    const visualRows = rows.filter((row) => row.evidence_type === 'visual' && row.video_path === stableMediaPath)
    const subtitleTexts = new Set(subtitleRows.map((row) => row.text))
    if (ocrRows.length !== 1 || subtitleRows.length !== 1 || visualRows.length === 0 || ocrRows[0]?.text !== 'Smoke OCR text' || ocrRows[0]?.video_path !== stableMediaPath || !subtitleTexts.has('Smoke replacement draft') || rows.some((row) => row.video_path === staleMediaPath)) {
      throw new Error(`Evidence table contents mismatch: ${JSON.stringify({ rows, counts: { ocr: ocrRows.length, subtitle: subtitleRows.length, visual: visualRows.length } })}`)
    }
    if (first.errors.length > 0 || second.errors.length > 0 || third.errors.length > 0 || fourth.errors.length > 0) throw new Error(`Renderer errors during evidence smoke: ${[...first.errors, ...second.errors, ...third.errors, ...fourth.errors].join('\n')}`)
    console.log(`Evidence task smoke passed: ${JSON.stringify({ capabilities, stablePersistence: stablePersistenceStatus, ttsDrafts: draftFiles, formalSubtitles, restoredFormalSubtitle: true, staleSummaryCleared: true, isolatedMediaSubtitleLeak: false, invalidSubtitleNotice: true, locatedOcr, stalePersistence: staleResult.persistenceStatus, evidenceRows: rows.length, ocrRows: ocrRows.length, subtitleRows: subtitleRows.length, visualRows: visualRows.length, screenshotPath })}`)
  } finally {
    await firstApp?.close().catch(() => undefined)
    await secondApp?.close().catch(() => undefined)
    await thirdApp?.close().catch(() => undefined)
    await fourthApp?.close().catch(() => undefined)
    await new Promise<void>((resolve) => translationServer.server.close(() => resolve()))
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
