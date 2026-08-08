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
  const smokeUserDataDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-settings-user-data-'))

  const app = await electron.launch({
    args: [`--user-data-dir=${smokeUserDataDirectory}`, 'out/main/index.js'],
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

    await page.locator('[data-theme-control]').click()
    await page.waitForTimeout(250)

    const quickToggleThemeState = await page.evaluate(() => ({
      documentTheme: document.documentElement.dataset.theme,
      appTheme: document.querySelector('.app-shell')?.getAttribute('data-theme')
    }))

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

    const dialogHeightByTab: Record<string, number> = {}
    const aboutVisibilityByTab: Record<string, string> = {}
    const readDialogHeight = async (): Promise<number> => page.locator('.settings-dialog').evaluate((element) => Math.round(element.getBoundingClientRect().height))
    const readAboutDisplay = async (): Promise<string> => page.locator('#settings-section-about').evaluate((element) => window.getComputedStyle(element).display)
    dialogHeightByTab.general = await readDialogHeight()
    aboutVisibilityByTab.general = await readAboutDisplay()

    await page.locator('[data-settings-tab="interface"]').click()
    await page.waitForTimeout(500)
    dialogHeightByTab.interface = await readDialogHeight()
    aboutVisibilityByTab.interface = await readAboutDisplay()

    const themeSelect = page.locator('#settings-section-interface .settings-select')
    await themeSelect.selectOption('light')
    await page.waitForTimeout(250)

    const lightThemeState = await page.evaluate(() => ({
      documentTheme: document.documentElement.dataset.theme,
      appTheme: document.querySelector('.app-shell')?.getAttribute('data-theme'),
      appBackground: window.getComputedStyle(document.body).backgroundColor
    }))

    await page.locator('[data-settings-tab="video"]').click()
    await page.waitForTimeout(500)
    dialogHeightByTab.video = await readDialogHeight()
    aboutVisibilityByTab.video = await readAboutDisplay()

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

    await page.locator('[data-settings-tab="subtitles"]').click()
    await page.waitForTimeout(500)
    dialogHeightByTab.subtitles = await readDialogHeight()
    aboutVisibilityByTab.subtitles = await readAboutDisplay()

    const cachePanelState = await page.evaluate(() => {
      const panel = document.querySelector('#settings-section-subtitles') as HTMLElement | null
      const cachePanel = panel?.querySelector('.settings-cache-management') as HTMLElement | null
      return {
        display: panel ? window.getComputedStyle(panel).display : 'missing',
        cachePanel: cachePanel ? 'present' : 'missing',
        cacheButtons: cachePanel?.querySelectorAll('.settings-cache-actions button').length ?? 0
      }
    })

    const ttsStatus = page.locator('[data-testid="settings-tts-status"]')
    const initialTtsStatus = await ttsStatus.textContent()
    await page.locator('[data-testid="settings-tts-executable-path"]').fill('/tmp/aivplayer-smoke-tts')
    await page.locator('[data-testid="settings-tts-voice"]').fill('SmokeVoice')
    await page.waitForTimeout(350)
    const ttsSettingsState = await page.evaluate(async () => {
      const settings = await window.aiv.getAppSettings()
      return { executablePath: settings.tts.executablePath, voice: settings.tts.voice }
    })
    await page.locator('[data-testid="settings-tts-check-button"]').click()
    await page.waitForFunction((previousStatus) => {
      const status = document.querySelector('[data-testid="settings-tts-status"]')?.textContent?.trim() ?? ''
      return Boolean(status) && status !== previousStatus && !['检查中', 'Checking', '確認中', '확인 중'].some((label) => status.startsWith(label))
    }, initialTtsStatus, { timeout: 10_000 })
    const ttsStatusAfterCheck = await ttsStatus.textContent()

    await page.locator('[data-settings-tab="shortcuts"]').click()
    await page.waitForTimeout(250)
    dialogHeightByTab.shortcuts = await readDialogHeight()
    aboutVisibilityByTab.shortcuts = await readAboutDisplay()

    const settingsLayoutState = await page.evaluate(() => {
      const body = document.querySelector('.settings-body') as HTMLElement | null
      const grid = document.querySelector('.settings-grid') as HTMLElement | null
      return {
        bodyOverflow: body ? window.getComputedStyle(body).overflow : 'missing',
        gridOverflowY: grid ? window.getComputedStyle(grid).overflowY : 'missing',
        gridScrollbarGutter: grid ? window.getComputedStyle(grid).scrollbarGutter : 'missing'
      }
    })

    const shortcutCount = await page.locator('.settings-shortcut').count()
    const shortcutPanelState = await page.evaluate(() => {
      const panel = document.querySelector('#settings-section-shortcuts') as HTMLElement | null

      return {
        display: panel ? window.getComputedStyle(panel).display : 'missing',
        ariaHidden: panel?.getAttribute('aria-hidden') ?? 'missing'
      }
    })

    await page.locator('[data-settings-tab="about"]').click()
    await page.waitForTimeout(250)
    dialogHeightByTab.about = await readDialogHeight()
    const aboutPanelState = await page.evaluate(() => {
      const panel = document.querySelector('#settings-section-about') as HTMLElement | null
      const checkButton = panel?.querySelector('.settings-about-update-actions .settings-secondary-button') as HTMLButtonElement | null
      return {
        display: panel ? window.getComputedStyle(panel).display : 'missing',
        version: panel?.querySelector('.settings-about-value')?.textContent?.trim() ?? 'missing',
        checkButton: checkButton ? 'present' : 'missing',
        checkDisabled: checkButton?.disabled ?? true
      }
    })

    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-settings-dialog.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    const shortcutScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-settings-shortcuts.png')
    await page.screenshot({ path: shortcutScreenshotPath, fullPage: false })

    console.log(`Settings number styles: ${JSON.stringify(numberStyles)}`)
    console.log(`Quick theme toggle state: ${JSON.stringify(quickToggleThemeState)}`)
    console.log(`Light theme state: ${JSON.stringify(lightThemeState)}`)
    console.log(`Settings dialog heights: ${JSON.stringify(dialogHeightByTab)}`)
    console.log(`About visibility by tab: ${JSON.stringify(aboutVisibilityByTab)}`)
    console.log(`Settings layout state: ${JSON.stringify(settingsLayoutState)}`)
    console.log(`Video settings card height: ${JSON.stringify(videoCardHeight)}`)
    console.log(`Subtitle cache panel: ${JSON.stringify(cachePanelState)}`)
    console.log(`TTS settings state: ${JSON.stringify({ ...ttsSettingsState, initialTtsStatus, ttsStatusAfterCheck })}`)
    console.log(`Shortcut panel: ${JSON.stringify({ shortcutCount, ...shortcutPanelState })}`)
    console.log(`About settings panel: ${JSON.stringify(aboutPanelState)}`)
    console.log(`Settings dialog screenshot: ${screenshotPath}`)
    console.log(`Shortcut settings screenshot: ${shortcutScreenshotPath}`)

    if (
      numberStyles.length === 0 ||
      numberStyles.some((style) => style.textAlign !== 'right') ||
      quickToggleThemeState.documentTheme !== 'light' ||
      quickToggleThemeState.appTheme !== 'light' ||
      lightThemeState.documentTheme !== 'light' ||
      lightThemeState.appTheme !== 'light' ||
      lightThemeState.appBackground !== 'rgb(246, 244, 241)' ||
      Object.values(dialogHeightByTab).some((height) => height !== dialogHeightByTab.general) ||
      Object.entries(aboutVisibilityByTab).some(([tab, display]) => tab !== 'about' && display !== 'none') ||
      settingsLayoutState.bodyOverflow !== 'hidden' ||
      settingsLayoutState.gridOverflowY !== 'auto' ||
      settingsLayoutState.gridScrollbarGutter !== 'stable' ||
      !videoCardHeight ||
      videoCardHeight.alignItems !== 'start' ||
      videoCardHeight.clientHeight > videoCardHeight.scrollHeight + 1 ||
      cachePanelState.display !== 'grid' ||
      cachePanelState.cachePanel !== 'present' ||
      cachePanelState.cacheButtons !== 2 ||
      ttsSettingsState.executablePath !== '/tmp/aivplayer-smoke-tts' ||
      ttsSettingsState.voice !== 'SmokeVoice' ||
      ttsStatusAfterCheck === initialTtsStatus ||
      shortcutCount !== 9 ||
      shortcutPanelState.display !== 'grid' ||
      shortcutPanelState.ariaHidden !== 'false' ||
      aboutPanelState.display !== 'grid' ||
      aboutPanelState.version === 'missing' ||
      aboutPanelState.checkButton !== 'present'
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
