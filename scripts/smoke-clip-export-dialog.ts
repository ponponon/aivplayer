import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Downloads/下载.mp4'

async function main(): Promise<void> {
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-clip-export-home-'))

  const app = await electron.launch({
    args: ['out/main/index.js', mediaPath],
    env: {
      ...process.env,
      HOME: smokeHomeDirectory
    }
  })

  try {
    const page = await app.firstWindow()
    page.on('console', (message) => {
      console.log(`[renderer:${message.type()}] ${message.text()}`)
    })
    page.on('pageerror', (error) => {
      console.log(`[renderer:error] ${error.message}`)
    })

    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('#root', { timeout: 10_000 })
    await page.waitForTimeout(1_000)

    const hasVideo = await page.locator('video.video-surface').count()
    if (hasVideo === 0) {
      const bodyText = await page.locator('body').innerText()
      console.log(`Body text: ${bodyText}`)
      console.log('AIVPlayer Smoke Clip Export Dialog')
      console.log(`Media: ${mediaPath}`)
      console.log('Video surface: not found')
      process.exitCode = 1
      return
    }

    await page.locator('.clip-editor-tool-button').click()
    await page.locator('.clip-export-dialog').waitFor({ timeout: 10_000 })

    const dialogState = await page.evaluate(() => {
      const dialog = document.querySelector('.clip-export-dialog') as HTMLElement | null
      if (!dialog) {
        throw new Error('Clip export dialog is missing')
      }

      const lengthOptionCount = dialog.querySelectorAll('.clip-export-length-option').length
      const modeOptionCount = dialog.querySelectorAll('.clip-export-mode-option').length
      const disabledModeOptionCount = dialog.querySelectorAll('.clip-export-mode-option:disabled').length
      const rangeInputCount = dialog.querySelectorAll('.clip-editor-range').length
      const timeInputCount = dialog.querySelectorAll('.clip-editor-time-field input').length
      const previewVideoCount = dialog.querySelectorAll('.clip-editor-preview-video').length

      return {
        lengthOptionCount,
        modeOptionCount,
        disabledModeOptionCount,
        rangeInputCount,
        timeInputCount,
        previewVideoCount
      }
    })

    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-clip-export-dialog.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })

    console.log(`Clip export dialog state: ${JSON.stringify(dialogState)}`)
    console.log(`Clip export dialog screenshot: ${screenshotPath}`)

    if (dialogState.lengthOptionCount !== 3 || dialogState.modeOptionCount !== 3 || dialogState.rangeInputCount !== 2 || dialogState.timeInputCount !== 2 || dialogState.previewVideoCount !== 1) {
      process.exitCode = 1
    }
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
