import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getAppCopy } from '../src/shared/i18n.ts'

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

function readShareState(page: any): Promise<{
  urlItemCount: number
  qrImageCount: number
  qrDataUrlCount: number
  hintCount: number
  viewportWidth: number
  dialogWidth: number
  dialogHeight: number
  dialogScrollHeight: number
  dialogClientHeight: number
  overflowCandidates: Array<{ selector: string; width: number; scrollWidth: number }>
}> {
  return page.evaluate(() => {
    const dialog = document.querySelector('.web-share-dialog') as HTMLElement | null
    if (!dialog) throw new Error('Web share dialog is missing')
    const images = [...document.querySelectorAll('.web-share-qr img')]
    const overflowCandidates = ['.modal-backdrop', '.web-share-dialog', '.web-share-url-box', '.web-share-url-item', '.web-share-url-preview', '.web-share-url-copy', '.web-share-url-actions'].flatMap((selector) => {
      const element = document.querySelector(selector)
      if (!element) return []
      return [{ selector, width: Math.round(element.getBoundingClientRect().width), scrollWidth: element.scrollWidth }]
    })
    return {
      urlItemCount: document.querySelectorAll('.web-share-url-item').length,
      qrImageCount: images.length,
      qrDataUrlCount: images.filter((image) => image.getAttribute('src')?.startsWith('data:image/png;base64,')).length,
      hintCount: document.querySelectorAll('.web-share-url-hint').length,
      viewportWidth: window.innerWidth,
      dialogWidth: dialog.getBoundingClientRect().width,
      dialogHeight: dialog.getBoundingClientRect().height,
      dialogScrollHeight: dialog.scrollHeight,
      dialogClientHeight: dialog.clientHeight,
      overflowCandidates
    }
  })
}

async function main(): Promise<void> {
  const mediaPath = getMediaArgument() ?? '/Users/ponponon/Music/aivplayer_test_video_1min.mp4'
  const appPath = getArgument('--app') ?? join(process.cwd(), 'release/mac-arm64/AIVPlayer.app/Contents/MacOS/AIVPlayer')
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-web-share-home-'))
  const smokeUserDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-web-share-user-data-'))
  const app = await electron.launch({
    executablePath: appPath,
    cwd: process.cwd(),
    args: [`--user-data-dir=${smokeUserDataDirectory}`, mediaPath],
    env: { ...process.env, HOME: smokeHomeDirectory }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForSelector('#root', { timeout: 10_000 })
    const settings = await page.evaluate(() => window.aiv.getAppSettings())
    const copy = getAppCopy(settings.ui.locale)
    const shareButton = page.getByRole('button', { name: copy.topbar.toggleWebShare })
    assertCondition(await shareButton.count() === 1, 'LAN Web share button is missing')
    await shareButton.click()
    await page.waitForSelector('.web-share-dialog', { timeout: 10_000 })
    await page.locator('.web-share-qr img').waitFor({ state: 'visible', timeout: 10_000 })

    const desktop = await readShareState(page)
    assertCondition(desktop.urlItemCount > 0, 'LAN Web share dialog has no URL item')
    assertCondition(desktop.qrImageCount === desktop.urlItemCount, 'Not every URL has a QR image')
    assertCondition(desktop.qrDataUrlCount === desktop.urlItemCount, 'QR images are not local PNG data URLs')
    assertCondition(desktop.hintCount === desktop.urlItemCount, 'Not every URL has a QR scan hint')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(250)
    const mobile = await readShareState(page)
    assertCondition(mobile.overflowCandidates.every((candidate) => candidate.scrollWidth <= candidate.width + 1), `Share dialog content overflows its own containers: ${JSON.stringify(mobile)}`)
    assertCondition(mobile.dialogHeight <= 844 - 16, `Share dialog is taller than the mobile viewport: ${JSON.stringify(mobile)}`)

    console.log(JSON.stringify({ status: 'WEB_SHARE_DIALOG_OK', desktop, mobile }))
  } finally {
    const page = await app.firstWindow().catch(() => null)
    await page?.evaluate(() => window.aiv.stopWebShare()).catch(() => undefined)
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
