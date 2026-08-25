import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const firstMediaPath = process.argv[2] ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
const secondMediaPath = process.argv[3] ?? '/Users/ponponon/Pictures/12688023_3840_2160_30fps.mp4'

async function waitForWindowClose(application: ElectronApplication): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (application.windows().length === 0) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Main window did not close: ${application.windows().length} window(s) remain`)
}

async function waitForMediaPath(page: Page, mediaPath: string): Promise<void> {
  await page.waitForFunction(
    (path) => window.aiv.getInitialMediaFiles().then((files) => files.some((file) => file.path === path)),
    mediaPath,
    { timeout: 15_000 }
  )
}

async function runSmoke(): Promise<void> {
  if (process.platform !== 'darwin') {
    console.log('AIVPlayer Smoke Window Reopen skipped: macOS only')
    return
  }

  const userDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-window-reopen-user-data-'))
  let application: ElectronApplication | null = null

  try {
    application = await electron.launch({
      args: ['--no-sandbox', '--in-process-gpu', `--user-data-dir=${userDataDirectory}`, 'out/main/index.js', firstMediaPath],
      env: { ...process.env, HOME: userDataDirectory }
    })

    let page = await application.firstWindow()
    await page.waitForSelector('#root', { timeout: 15_000 })
    await page.waitForTimeout(500)

    await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close() })
    await waitForWindowClose(application)

    await application.evaluate(({ app }, filePath) => {
      app.emit('open-file', { preventDefault() {} }, filePath)
    }, secondMediaPath)

    page = await application.firstWindow()
    await page.waitForSelector('#root', { timeout: 15_000 })
    await waitForMediaPath(page, secondMediaPath)

    console.log(`AIVPlayer Smoke Window Reopen passed: ${JSON.stringify({ closedWindowCount: 0, reopenedMediaPath: secondMediaPath })}`)
  } finally {
    if (application) await application.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
