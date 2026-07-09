import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { getAppCopy } from '../src/shared/i18n.ts'

const expectedSubtitleSettings = {
  fontSizePx: 21,
  lineHeight: 'relaxed',
  displayMode: 'source',
  targetLanguage: 'zh'
} as const

async function main(): Promise<void> {
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-subtitle-settings-home-'))

  const app = await electron.launch({
    args: ['out/main/index.js'],
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

    const initialSettings = await page.evaluate(() => window.aiv.getAppSettings())
    const copy = getAppCopy(initialSettings.ui.locale)

    await page.evaluate(async () => {
      const current = await window.aiv.getAppSettings()

      await window.aiv.setAppSettings({
        ...current,
        subtitles: {
          ...current.subtitles,
          ...expectedSubtitleSettings
        }
      })
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#root', { timeout: 10_000 })
    await page.waitForTimeout(1_000)

    const persistedSettings = await page.evaluate(() => window.aiv.getAppSettings())

    await page.getByRole('button', { name: copy.topbar.openSettings }).click()
    await page.waitForSelector('.settings-dialog', { timeout: 10_000 })
    await page.locator('[data-settings-tab="subtitles"]').click()
    await page.waitForTimeout(500)

    const dialogState = await page.evaluate(() => {
      const dialog = document.querySelector('.settings-dialog')
      const inputs = Array.from(document.querySelectorAll('.settings-number')) as HTMLInputElement[]
      const selects = Array.from(document.querySelectorAll('.settings-select')) as HTMLSelectElement[]

      return {
        hasDialog: Boolean(dialog),
        numberValues: inputs.map((input) => input.value),
        selectValues: selects.map((select) => select.value)
      }
    })

    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-subtitle-settings.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })

    console.log(`Subtitle settings: ${JSON.stringify(persistedSettings.subtitles)}`)
    console.log(`Expected subtitle settings: ${JSON.stringify(expectedSubtitleSettings)}`)
    console.log(`Subtitle dialog state: ${JSON.stringify(dialogState)}`)
    console.log(`Subtitle settings screenshot: ${screenshotPath}`)

    if (persistedSettings.subtitles.fontSizePx !== 21) {
      process.exitCode = 1
    }

    if (persistedSettings.subtitles.lineHeight !== 'relaxed') {
      process.exitCode = 1
    }

    if (persistedSettings.subtitles.displayMode !== 'source') {
      process.exitCode = 1
    }

    if (persistedSettings.subtitles.targetLanguage !== 'zh') {
      process.exitCode = 1
    }

    if (!dialogState.hasDialog || !dialogState.numberValues.includes('21')) {
      process.exitCode = 1
    }

    if (
      !dialogState.selectValues.includes('relaxed') ||
      !dialogState.selectValues.includes('source') ||
      !dialogState.selectValues.includes('zh')
    ) {
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
