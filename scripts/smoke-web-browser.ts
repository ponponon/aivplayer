import { _electron as electron } from 'playwright'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function getArgument(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('-') ? value : null
}

function getMediaArgument(): string | null {
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index]
    if (argument === '--app') {
      index += 1
      continue
    }
    if (argument && !argument.startsWith('-')) return argument
  }
  return null
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function main(): Promise<void> {
  const mediaPath = getMediaArgument() ?? '/Users/ponponon/Pictures/百万英镑.mp4'
  const appPath = getArgument('--app') ?? join(process.cwd(), 'release/mac-arm64/AIVPlayer.app/Contents/MacOS/AIVPlayer')
  const sourceSizeBytes = (await stat(mediaPath)).size
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-web-browser-home-'))
  const smokeUserDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-web-browser-user-data-'))
  const app = await electron.launch({
    executablePath: appPath,
    cwd: process.cwd(),
    args: [`--user-data-dir=${smokeUserDataDirectory}`, mediaPath],
    env: { ...process.env, HOME: smokeHomeDirectory }
  })

  try {
    const desktopPage = await app.firstWindow()
    await desktopPage.waitForSelector('#root', { timeout: 10_000 })
    const shareStatus = await desktopPage.evaluate(async () => {
      const files = await window.aiv.getInitialMediaFiles()
      return window.aiv.startWebShare({ filePaths: files.map((file) => file.path) })
    })
    assertCondition(shareStatus.urls.length > 0, 'Web share did not return an access URL')

    const accessUrl = new URL(shareStatus.urls[0]!)
    accessUrl.hostname = '127.0.0.1'
    const webPagePromise = app.waitForEvent('window', { timeout: 10_000 })
    await desktopPage.evaluate((url) => window.open(url, '_blank'), accessUrl.toString())
    const webPage = await webPagePromise
    const rangeRequests: string[] = []
    webPage.on('request', (request) => {
      if (request.url().includes('/media/')) {
        const range = request.headers().range
        if (range) rangeRequests.push(range)
      }
    })

    try {
      await webPage.goto(accessUrl.toString())
      await webPage.waitForSelector('video', { timeout: 10_000 })
      await webPage.waitForFunction(() => {
        const video = document.querySelector('video') as HTMLVideoElement | null
        return Boolean(video && video.readyState >= 1 && Number.isFinite(video.duration))
      }, undefined, { timeout: 15_000 })

      const initialState = await webPage.locator('video').evaluate((element) => {
        const video = element as HTMLVideoElement
        return {
          duration: video.duration,
          currentTime: video.currentTime,
          readyState: video.readyState
        }
      })
      assertCondition(initialState.duration > 5, `Browser did not load video metadata: ${JSON.stringify(initialState)}`)
      const rangesBeforeSeek = rangeRequests.length
      const targetTime = Math.max(1, initialState.duration - 5)
      await webPage.locator('video').evaluate((element, target) => new Promise<void>((resolve, reject) => {
        const video = element as HTMLVideoElement
        const timer = window.setTimeout(() => reject(new Error('Browser seek timed out')), 10_000)
        const done = (): void => {
          window.clearTimeout(timer)
          resolve()
        }
        video.addEventListener('seeked', done, { once: true })
        video.currentTime = target
      }), targetTime)

      const finalState = await webPage.locator('video').evaluate((element) => {
        const video = element as HTMLVideoElement
        return {
          duration: video.duration,
          currentTime: video.currentTime,
          readyState: video.readyState
        }
      })
      const seekRangeRequests = rangeRequests.slice(rangesBeforeSeek)
      assertCondition(Math.abs(finalState.currentTime - targetTime) < 0.5, `Browser seek landed at an unexpected time: ${JSON.stringify({ targetTime, finalState })}`)
      assertCondition(rangeRequests.length > 0, `Browser did not issue a media Range request: ${JSON.stringify(rangeRequests)}`)
      if (sourceSizeBytes > 64 * 1024 * 1024) {
        assertCondition(seekRangeRequests.length > 0, `Large-file browser seek did not issue a new media Range request: ${JSON.stringify(rangeRequests)}`)
      }

      console.log(JSON.stringify({
        status: 'WEB_BROWSER_SEEK_OK',
        pageTitle: await webPage.title(),
        sourceSizeBytes,
        durationSeconds: finalState.duration,
        targetTime,
        currentTime: finalState.currentTime,
        initialReadyState: initialState.readyState,
        finalReadyState: finalState.readyState,
        rangeMode: seekRangeRequests.length > 0 ? 'seek-range' : 'initial-range-buffered',
        rangeRequests: seekRangeRequests.length > 0 ? seekRangeRequests : rangeRequests
      }))
    } finally {
      await webPage.close().catch(() => undefined)
    }
  } finally {
    const desktopPage = await app.firstWindow().catch(() => null)
    await desktopPage?.evaluate(() => window.aiv.stopWebShare()).catch(() => undefined)
    await app.close().catch(() => undefined)
    await Promise.all([
      rm(smokeHomeDirectory, { recursive: true, force: true }),
      rm(smokeUserDataDirectory, { recursive: true, force: true })
    ])
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
