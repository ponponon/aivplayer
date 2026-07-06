import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const mediaPath = process.argv[2] ?? '/Users/ponponon/Downloads/下载.mp4'

async function main(): Promise<void> {
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-media-details-home-'))

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
      console.log('AIVPlayer Smoke Media Details Dialog')
      console.log(`Media: ${mediaPath}`)
      console.log('Video surface: not found')
      process.exitCode = 1
      return
    }

    await page.locator('.panel-switcher [role="tab"]').nth(2).click()
    await page.waitForFunction(() => {
      const button = document.querySelector('.info-card-more-button') as HTMLButtonElement | null
      return Boolean(button && !button.disabled)
    })

    await page.locator('.info-card-more-button').click()
    await page.locator('.media-details-dialog').waitFor({ timeout: 10_000 })

    const dialogState = await page.evaluate(() => {
      const dialog = document.querySelector('.media-details-dialog') as HTMLElement | null
      if (!dialog) {
        throw new Error('Media details dialog is missing')
      }

      const summaryItemCount = dialog.querySelectorAll('.media-details-summary-item').length
      const cardCount = dialog.querySelectorAll('.media-details-card').length
      const subcardCount = dialog.querySelectorAll('.media-details-subcard').length

      return {
        summaryItemCount,
        cardCount,
        subcardCount
      }
    })

    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-media-details-dialog.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })

    console.log(`Media details dialog state: ${JSON.stringify(dialogState)}`)
    console.log(`Media details dialog screenshot: ${screenshotPath}`)

    if (dialogState.summaryItemCount !== 4 || dialogState.cardCount < 2 || dialogState.subcardCount < 1) {
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
