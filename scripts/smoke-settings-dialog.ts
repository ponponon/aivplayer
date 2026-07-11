import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { isAppLocale, type AppLocale } from '../src/shared/localization.ts'

function getArgValue(flag: string): string | null {
  const args = process.argv.slice(2)
  const directValueIndex = args.findIndex((arg) => arg === flag)
  if (directValueIndex >= 0) {
    return args[directValueIndex + 1] ?? null
  }

  const inlineValue = args.find((arg) => arg.startsWith(`${flag}=`))
  if (inlineValue) {
    return inlineValue.slice(flag.length + 1)
  }

  return null
}

async function main(): Promise<void> {
  const targetLocale = getArgValue('--locale')
  const resolvedLocale: AppLocale | null = targetLocale && isAppLocale(targetLocale) ? targetLocale : null
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-settings-home-'))

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

    let appSettings = await page.evaluate(() => window.aiv.getAppSettings())

    if (resolvedLocale && resolvedLocale !== appSettings.ui.locale) {
      await page.evaluate(async (locale: AppLocale) => {
        const current = await window.aiv.getAppSettings()

        await window.aiv.setAppSettings({
          ...current,
          ui: {
            ...current.ui,
            locale
          }
        })
      }, resolvedLocale)

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#root', { timeout: 10_000 })
      await page.waitForTimeout(1_000)
      appSettings = await page.evaluate(() => window.aiv.getAppSettings())
    }

    const openSettingsLabelByLocale: Record<string, string> = {
      'zh-CN': '打开设置',
      'en-US': 'Open settings',
      'ja-JP': '設定を開く',
      'ko-KR': '설정 열기'
    }
    const openSettingsLabel = openSettingsLabelByLocale[appSettings.ui.locale] ?? '打开设置'

    await page.getByRole('button', { name: openSettingsLabel }).click()
    await page.waitForSelector('.settings-dialog', { timeout: 10_000 })

    await page.locator('[data-settings-tab="interface"]').click()
    await page.waitForTimeout(500)

    await page.locator('[data-settings-tab="video"]').click()
    await page.waitForTimeout(500)

    const videoCardHeight = await page.evaluate(() => {
      const card = document.querySelector('#settings-section-video') as HTMLElement | null

      if (!card) {
        return null
      }

      return {
        clientHeight: card.clientHeight,
        scrollHeight: card.scrollHeight,
        alignItems: window.getComputedStyle(document.querySelector('.settings-grid') as HTMLElement).alignItems
      }
    })

    const numberStyles = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('.settings-number')) as HTMLInputElement[]

      return inputs.map((input) => {
        const style = window.getComputedStyle(input)

        return {
          value: input.value,
          textAlign: style.textAlign,
          maxWidth: style.maxWidth
        }
      })
    })

    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-settings-dialog.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })

    console.log(`Settings number styles: ${JSON.stringify(numberStyles)}`)
    console.log(`Video settings card height: ${JSON.stringify(videoCardHeight)}`)
    console.log(`Settings dialog screenshot: ${screenshotPath}`)

    if (
      numberStyles.length === 0 ||
      numberStyles.some((style) => style.textAlign !== 'right') ||
      !videoCardHeight ||
      videoCardHeight.alignItems !== 'start' ||
      videoCardHeight.clientHeight > videoCardHeight.scrollHeight + 1
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
