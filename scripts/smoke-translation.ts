import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'

type TranslationRequest = {
  messages?: Array<{ content?: string }>
}

type TranslationProgress = {
  stage: string
  percent: number | null
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

function startMockTranslationServer(): Promise<{
  url: string
  close: () => Promise<void>
  setResponseDelay: (delayMs: number) => void
  waitForNextRequest: () => Promise<void>
}> {
  let responseDelayMs = 0
  let requestCount = 0
  let observedRequestCount = 0
  let requestWaiter: (() => void) | null = null
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404)
      response.end()
      return
    }

    const payload = JSON.parse(await readRequestBody(request)) as TranslationRequest
    const segments = JSON.parse(payload.messages?.[1]?.content ?? '[]') as Array<{ id: string; text: string }>
    requestCount += 1
    requestWaiter?.()
    requestWaiter = null

    if (responseDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelayMs))
    }

    if (response.destroyed) {
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
        url: `http://127.0.0.1:${address.port}/v1/chat/completions`,
        setResponseDelay: (delayMs) => {
          responseDelayMs = delayMs
        },
        waitForNextRequest: () => {
          if (requestCount > observedRequestCount) {
            observedRequestCount = requestCount
            return Promise.resolve()
          }

          return new Promise<void>((waitResolve) => {
            requestWaiter = () => {
              observedRequestCount = requestCount
              waitResolve()
            }
          })
        },
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()))
          })
      })
    })
  })
}

const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-translation-home-'))
const smokeUserDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-translation-user-data-'))
const subtitleDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-translation-subtitles-'))
const mockServer = await startMockTranslationServer()
const app = await electron.launch({
  args: [`--user-data-dir=${smokeUserDataDirectory}`, 'out/main/index.js'],
  env: {
    ...process.env,
    HOME: smokeHomeDirectory,
    AIVPLAYER_ASR_CACHE_DIR: join(smokeUserDataDirectory, 'asr-cache')
  }
})

try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root', { timeout: 10_000 })

  await page.evaluate(async (translationBaseUrl) => {
    const current = await window.aiv.getAppSettings()

    await window.aiv.setAppSettings({
      ...current,
      ui: {
        ...current.ui,
        locale: 'zh-CN'
      },
      asr: {
        ...current.asr,
        translationBaseUrl,
        translationModel: 'mock-model',
        translationApiKey: 'mock-key'
      }
    })
  }, mockServer.url)

  const sourceSubtitlePath = join(subtitleDirectory, 'demo.vtt')
  await writeFile(
    sourceSubtitlePath,
    [
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:01.000',
      'hello world',
      '',
      '00:00:01.000 --> 00:00:02.000',
      'technology'
    ].join('\n')
  )

  await page.evaluate(() => {
    const state = window as typeof window & { __aivTranslationProgress?: TranslationProgress[] }
    state.__aivTranslationProgress = []
    window.aiv.onAsrJobProgress((progress) => state.__aivTranslationProgress?.push(progress))
  })

  const translationResult = await page.evaluate(
    (subtitlePath) =>
      window.aiv.translateAsrSubtitle({
        subtitlePath,
        sourceLanguage: 'en',
        targetLanguage: 'zh'
      }),
    sourceSubtitlePath
  )
  const progress = await page.evaluate(() => {
    const state = window as typeof window & { __aivTranslationProgress?: TranslationProgress[] }
    return state.__aivTranslationProgress ?? []
  })

  if (!translationResult.success || !translationResult.subtitlePath || !progress.some((item) => item.stage === 'completed')) {
    throw new Error(`Unexpected translation result: ${JSON.stringify({ translationResult, progress })}`)
  }

  const translatedText = await readFile(translationResult.subtitlePath, 'utf8')
  if (!translatedText.includes('中文：hello world')) {
    throw new Error(`Translated subtitle did not contain the expected text: ${translatedText}`)
  }

  const canceledSubtitlePath = join(subtitleDirectory, 'cancel.vtt')
  await writeFile(
    canceledSubtitlePath,
    ['WEBVTT', '', '00:00:00.000 --> 00:00:01.000', 'cancel me'].join('\n')
  )
  mockServer.setResponseDelay(1_000)
  const pendingTranslation = page.evaluate(
    (subtitlePath) =>
      window.aiv.translateAsrSubtitle({
        subtitlePath,
        sourceLanguage: 'en',
        targetLanguage: 'zh'
      }),
    canceledSubtitlePath
  )
  await mockServer.waitForNextRequest()
  await page.evaluate(() => window.aiv.cancelAsrTranslation())
  const canceledResult = await pendingTranslation

  if (!canceledResult.canceled || canceledResult.success) {
    throw new Error(`Unexpected cancellation result: ${JSON.stringify(canceledResult)}`)
  }

  console.log(`Translation result: ${JSON.stringify(translationResult)}`)
  console.log(`Translation progress: ${JSON.stringify(progress)}`)
  console.log(`Cancellation result: ${JSON.stringify(canceledResult)}`)
} finally {
  await app.close()
  await mockServer.close()
  await rm(smokeHomeDirectory, { recursive: true, force: true })
  await rm(smokeUserDataDirectory, { recursive: true, force: true })
  await rm(subtitleDirectory, { recursive: true, force: true })
}
