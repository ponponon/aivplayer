import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { getRecommendedWhisperModelManifest } from '../src/main/ai/asr-models.ts'
import { getWhisperModelDirectory } from '../src/main/ai/model-manager.ts'

type TranslationRequest = {
  messages?: Array<{ content?: string }>
}

type TranslationSmokeService = {
  mode: 'mock' | 'real'
  url: string
  model: string
  apiKey: string
  glossary: string
  setResponseDelay: (delayMs: number) => void
  setRejectRequests: (rejectRequests: boolean) => void
  close: () => Promise<void>
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

function startMockTranslationServer(): Promise<TranslationSmokeService> {
  let responseDelayMs = 0
  let rejectRequests = false
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404)
      response.end()
      return
    }

    const payload = JSON.parse(await readRequestBody(request)) as TranslationRequest
    const segments = JSON.parse(payload.messages?.[1]?.content ?? '[]') as Array<{ id: string; text: string }>

    if (responseDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelayMs))
    }

    if (response.destroyed) {
      return
    }

    if (rejectRequests) {
      response.writeHead(503, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'cache restore must not call the translation service' }))
      return
    }

    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(
                segments.map((segment) => ({
                  id: segment.id,
                  text: `中文：${segment.text}`
                }))
              )
            }
          }
        ]
      })
    )
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        reject(new Error('Mock translation server did not expose a TCP port.'))
        return
      }

      resolve({
        mode: 'mock',
        url: `http://127.0.0.1:${address.port}/v1/chat/completions`,
        model: 'player-smoke-model',
        apiKey: 'player-smoke-key',
        glossary: '',
        setResponseDelay: (delayMs) => {
          responseDelayMs = delayMs
        },
        setRejectRequests: (nextRejectRequests) => {
          rejectRequests = nextRejectRequests
        },
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()))
          })
      })
    })
  })
}

async function startTranslationSmokeService(): Promise<TranslationSmokeService> {
  const apiKey = process.env.AIVPLAYER_SMOKE_TRANSLATION_API_KEY?.trim()

  if (!apiKey) {
    return startMockTranslationServer()
  }

  const baseUrl = process.env.AIVPLAYER_SMOKE_TRANSLATION_BASE_URL?.trim()
  const model = process.env.AIVPLAYER_SMOKE_TRANSLATION_MODEL?.trim()
  const glossary = process.env.AIVPLAYER_SMOKE_TRANSLATION_GLOSSARY?.trim() ?? ''

  if (!baseUrl || !model) {
    throw new Error(
      'Real translation smoke requires AIVPLAYER_SMOKE_TRANSLATION_BASE_URL and AIVPLAYER_SMOKE_TRANSLATION_MODEL.'
    )
  }

  return {
    mode: 'real',
    url: baseUrl,
    model,
    apiKey,
    glossary,
    setResponseDelay: () => undefined,
    setRejectRequests: () => undefined,
    close: async () => undefined
  }
}

function getWhisperSubtitleOutputPaths(
  cacheDirectory: string,
  mediaPath: string,
  mediaMtimeMs: number,
  modelId: string
): { outputBase: string; subtitlePath: string; subtitleSrtPath: string } {
  const safeStem = basename(mediaPath, extname(mediaPath))
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'media'
  const cacheKey = createHash('sha1').update(`${mediaPath}:${mediaMtimeMs}:${modelId}`).digest('hex').slice(0, 12)
  const outputBase = join(cacheDirectory, 'subtitles', `${safeStem}-${modelId}-${cacheKey}`)

  return {
    outputBase,
    subtitlePath: `${outputBase}.vtt`,
    subtitleSrtPath: `${outputBase}.srt`
  }
}

function assertUnique<T extends { count: () => Promise<number> }>(locator: T, label: string): Promise<void> {
  return locator.count().then((count) => {
    if (count !== 1) {
      throw new Error(`${label} was expected once, received ${count}.`)
    }
  })
}

async function resetVideoToStart(page: any): Promise<void> {
  await page.evaluate(() => {
    const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
    if (!video) {
      throw new Error('Missing video surface while checking translated overlay')
    }
    video.pause()
    video.currentTime = 0
    video.dispatchEvent(new Event('timeupdate'))
  })
}

const mediaPath = process.argv.find((argument) => argument.endsWith('.mp4')) ?? '/Users/ponponon/Downloads/下载.mp4'
const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-translation-player-user-data-'))
const cacheDirectory = join(userDataDirectory, 'asr-cache')
const translationService = await startTranslationSmokeService()
const modelManifest = getRecommendedWhisperModelManifest()
const modelDirectory = getWhisperModelDirectory(userDataDirectory)
const mediaStat = await stat(mediaPath)
const subtitleCache = getWhisperSubtitleOutputPaths(
  cacheDirectory,
  mediaPath,
  mediaStat.mtimeMs,
  modelManifest.id
)

await mkdir(modelDirectory, { recursive: true })
await writeFile(join(modelDirectory, modelManifest.fileName), 'smoke model placeholder')
await mkdir(join(cacheDirectory, 'subtitles'), { recursive: true })
await writeFile(
  subtitleCache.subtitlePath,
  [
    'WEBVTT',
    '',
    '00:00:00.000 --> 00:00:01.500',
    'hello world',
    '',
    '00:00:01.500 --> 00:00:03.000',
    'technology'
  ].join('\n')
)
await writeFile(
  subtitleCache.subtitleSrtPath,
  ['1', '00:00:00,000 --> 00:00:01,500', 'hello world', '', '2', '00:00:01,500 --> 00:00:03,000', 'technology', ''].join('\n')
)
await writeFile(`${subtitleCache.outputBase}.json`, JSON.stringify({ result: { language: 'en' } }))

const launchPlayer = () =>
  electron.launch({
    args: [`--user-data-dir=${userDataDirectory}`, 'out/main/index.js', mediaPath],
    env: {
      ...process.env,
      AIVPLAYER_ASR_CACHE_DIR: cacheDirectory
    }
  })

const configureTranslation = async (page: any): Promise<void> => {
  const settings = await page.evaluate(() => window.aiv.getAppSettings())
  await page.evaluate(
    async ({
      current,
      translationBaseUrl,
      translationModel,
      translationApiKey,
      translationGlossary
    }: {
      current: any
      translationBaseUrl: string
      translationModel: string
      translationApiKey: string
      translationGlossary: string
    }) => {
      await window.aiv.setAppSettings({
        ...current,
        ui: {
          ...current.ui,
          locale: 'zh-CN'
        },
        asr: {
          ...current.asr,
          translationBaseUrl,
          translationModel,
          translationApiKey,
          translationGlossary: translationGlossary || null
        },
        subtitles: {
          ...current.subtitles,
          targetLanguage: 'zh',
          displayMode: 'source'
        }
      })
    },
    {
      current: settings,
      translationBaseUrl: translationService.url,
      translationModel: translationService.model,
      translationApiKey: translationService.apiKey,
      translationGlossary: translationService.glossary
    }
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#root', { timeout: 10_000 })
}

let app: Awaited<ReturnType<typeof launchPlayer>> | null = null

try {
  app = await launchPlayer()
  let page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('video.video-surface', { timeout: 10_000 })
  await configureTranslation(page)
  await page.waitForSelector('video.video-surface', { timeout: 10_000 })

  const asrTab = page.getByRole('tab', { name: 'ASR 面板' })
  await assertUnique(asrTab, 'ASR panel tab')
  await asrTab.click()
  const sourceReady = page.locator('.subtitle-status.ready')
  await sourceReady.waitFor({ state: 'visible', timeout: 10_000 })

  const englishTargetButton = page.getByRole('button', { name: '英语', exact: true })
  const chineseTargetButton = page.getByRole('button', { name: '中文', exact: true })
  await assertUnique(englishTargetButton, 'English target language button')
  await assertUnique(chineseTargetButton, 'Chinese target language button')
  await englishTargetButton.click()
  const englishTargetSettings = await page.evaluate(() => window.aiv.getAppSettings())
  if (englishTargetSettings.subtitles.targetLanguage !== 'en') {
    throw new Error(`Target language quick switch did not write English: ${englishTargetSettings.subtitles.targetLanguage}`)
  }
  await chineseTargetButton.click()
  const chineseTargetSettings = await page.evaluate(() => window.aiv.getAppSettings())
  if (chineseTargetSettings.subtitles.targetLanguage !== 'zh') {
    throw new Error(`Target language quick switch did not restore Chinese: ${chineseTargetSettings.subtitles.targetLanguage}`)
  }

  const translateButton = page.getByRole('button', { name: '翻译为中文' })
  await assertUnique(translateButton, 'translate button')
  translationService.setResponseDelay(350)
  await translateButton.click()

  if (translationService.mode === 'mock') {
    const cancelButton = page.getByRole('button', { name: '取消翻译' })
    await cancelButton.waitFor({ state: 'visible', timeout: 10_000 })
    if (await chineseTargetButton.isEnabled()) {
      throw new Error('Target language quick switch remained enabled during translation')
    }
  }
  const translatingScreenshot = join(tmpdir(), `aivplayer-smoke-translation-player-${Date.now()}.png`)
  await page.screenshot({ path: translatingScreenshot, fullPage: false })

  await resetVideoToStart(page)
  await page.waitForFunction(
    (mode: 'mock' | 'real') => {
      const text = document.querySelector('.subtitle-text')?.textContent?.trim() ?? ''
      return mode === 'mock' ? text.includes('中文：hello world') : Boolean(text && !text.includes('hello world'))
    },
    translationService.mode,
    { timeout: 10_000 }
  )
  const savedSettings = await page.evaluate(() => window.aiv.getAppSettings())
  if (savedSettings.subtitles.displayMode !== 'translation') {
    throw new Error(`Translation did not switch display mode: ${savedSettings.subtitles.displayMode}`)
  }

  await page.waitForTimeout(100)
  const translatedText = await page.locator('.subtitle-text').innerText()
  if (
    translationService.mode === 'mock'
      ? !translatedText.includes('中文：hello world')
      : translatedText.includes('hello world')
  ) {
    throw new Error(`Translated overlay text was not mounted: ${translatedText}`)
  }

  const glossaryTarget = translationService.glossary
    .split(/\r?\n/)
    .filter((line) => line.includes('='))
    .map((line) => line.slice(line.indexOf('=') + 1).trim())
    .find((target) => target.length > 0)
  if (translationService.mode === 'real' && glossaryTarget) {
    await page.evaluate(() => {
      const video = document.querySelector('video.video-surface') as HTMLVideoElement | null
      if (!video) {
        throw new Error('Missing video surface while checking glossary translation')
      }
      video.pause()
      video.currentTime = 1.7
      video.dispatchEvent(new Event('timeupdate'))
    })
    await page.waitForFunction(
      (target: string) => document.querySelector('.subtitle-text')?.textContent?.includes(target) ?? false,
      glossaryTarget,
      { timeout: 10_000 }
    )
    console.log(`Glossary overlay: ${await page.locator('.subtitle-text').innerText()}`)
  }

  const subtitleDisplayTrigger = page.locator('.subtitle-display-trigger')
  await assertUnique(subtitleDisplayTrigger, 'subtitle display controls trigger')
  await subtitleDisplayTrigger.click()
  const fontSizePreset = page.getByRole('button', { name: '18px', exact: true })
  const relaxedLineHeight = page.getByRole('button', { name: '宽松', exact: true })
  await assertUnique(fontSizePreset, '18px subtitle font preset')
  await assertUnique(relaxedLineHeight, 'relaxed subtitle line height')
  await fontSizePreset.click()
  await relaxedLineHeight.click()
  const subtitleDisplayState = await page.evaluate(() => {
    const overlay = document.querySelector('.subtitle-overlay') as HTMLElement | null
    const text = document.querySelector('.subtitle-text') as HTMLElement | null
    return {
      fontSize: overlay ? getComputedStyle(overlay).getPropertyValue('--subtitle-font-size').trim() : '',
      lineHeight: overlay ? getComputedStyle(overlay).getPropertyValue('--subtitle-line-height').trim() : '',
      renderedFontSize: text ? getComputedStyle(text).fontSize : ''
    }
  })
  const subtitleDisplaySettings = await page.evaluate(() => window.aiv.getAppSettings())
  if (
    subtitleDisplaySettings.subtitles.fontSizePx !== 18 ||
    subtitleDisplaySettings.subtitles.lineHeight !== 'relaxed' ||
    subtitleDisplayState.fontSize !== '18px' ||
    subtitleDisplayState.lineHeight !== '1.75' ||
    subtitleDisplayState.renderedFontSize !== '18px'
  ) {
    throw new Error(`Subtitle display controls did not apply: ${JSON.stringify({ subtitleDisplayState, subtitleDisplaySettings })}`)
  }
  await subtitleDisplayTrigger.click()

  await app.close()
  app = null
  translationService.setRejectRequests(true)
  translationService.setResponseDelay(0)

  app = await launchPlayer()
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('video.video-surface', { timeout: 10_000 })
  const restoredAsrTab = page.getByRole('tab', { name: 'ASR 面板' })
  await assertUnique(restoredAsrTab, 'restored ASR panel tab')
  await restoredAsrTab.click()
  await page.getByText('译文已就绪', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
  const restoredSettings = await page.evaluate(() => window.aiv.getAppSettings())
  if (restoredSettings.subtitles.displayMode !== 'translation') {
    throw new Error(`Cached translation did not restore display mode: ${restoredSettings.subtitles.displayMode}`)
  }

  await resetVideoToStart(page)
  await page.waitForFunction(
    (mode: 'mock' | 'real') => {
      const text = document.querySelector('.subtitle-text')?.textContent?.trim() ?? ''
      return mode === 'mock' ? text.includes('中文：hello world') : Boolean(text && !text.includes('hello world'))
    },
    translationService.mode,
    { timeout: 10_000 }
  )
  const restoredText = await page.locator('.subtitle-text').innerText()
  if (
    translationService.mode === 'mock' ? !restoredText.includes('中文：hello world') : restoredText.includes('hello world')
  ) {
    throw new Error(`Cached translated overlay text was not restored: ${restoredText}`)
  }

  console.log(`Player translation flow passed for: ${mediaPath}`)
  console.log(`Translated overlay: ${translatedText}`)
  console.log(`Restored overlay: ${restoredText}`)
  console.log(`In-progress screenshot: ${translatingScreenshot}`)
} finally {
  await app?.close()
  await translationService.close()
  await rm(userDataDirectory, { recursive: true, force: true })
}
