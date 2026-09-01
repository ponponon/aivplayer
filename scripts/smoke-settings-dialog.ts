import { selectAppOption } from './smoke-select.ts'
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
    const settingsPanelVisibilityByTab: Record<string, Array<{ id: string; display: string; ariaHidden: string | null; role: string | null }>> = {}
    const readDialogHeight = async (): Promise<number> => page.locator('.settings-dialog').evaluate((element) => Math.round(element.getBoundingClientRect().height))
    const readAboutDisplay = async (): Promise<string> => page.locator('#settings-section-about').evaluate((element) => window.getComputedStyle(element).display)
    const readSettingsPanelVisibility = async (): Promise<Array<{ id: string; display: string; ariaHidden: string | null; role: string | null }>> => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-settings-section]')).map((element) => ({
      id: element.dataset.settingsSection ?? 'missing',
      display: window.getComputedStyle(element).display,
      ariaHidden: element.getAttribute('aria-hidden'),
      role: element.getAttribute('role')
    })))
    dialogHeightByTab.general = await readDialogHeight()
    aboutVisibilityByTab.general = await readAboutDisplay()
    settingsPanelVisibilityByTab.general = await readSettingsPanelVisibility()

    const autoUpdateToggle = page.locator('#settings-section-general .setting-toggle').first().locator('input')
    const autoUpdateInitiallyEnabled = await autoUpdateToggle.isChecked()
    await autoUpdateToggle.uncheck()
    await page.waitForTimeout(350)
    const autoUpdateDisabled = await page.evaluate(async () => (await window.aiv.getAppSettings()).ui.autoUpdate)
    await autoUpdateToggle.check()
    await page.waitForTimeout(350)
    const autoUpdateReenabled = await page.evaluate(async () => (await window.aiv.getAppSettings()).ui.autoUpdate)
    const autoUpdateToggleStyles = await page.evaluate(() => {
      const input = document.querySelector('#settings-section-general .setting-toggle input') as HTMLInputElement | null
      if (!input) return null
      const style = window.getComputedStyle(input)
      return {
        width: style.width,
        height: style.height,
        borderRadius: style.borderRadius,
        appearance: style.appearance,
        backgroundColor: style.backgroundColor
      }
    })
    const generalScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-settings-general.png')
    await page.screenshot({ path: generalScreenshotPath, fullPage: false })

    await page.locator('[data-settings-tab="ai"]').click()
    await page.waitForTimeout(500)
    dialogHeightByTab.ai = await readDialogHeight()
    aboutVisibilityByTab.ai = await readAboutDisplay()
    settingsPanelVisibilityByTab.ai = await readSettingsPanelVisibility()

    const aiLayoutState = await page.evaluate(() => {
      const grid = document.querySelector('[data-settings-section="ai"]') as HTMLElement | null
      const settingsGrid = document.querySelector('.settings-grid') as HTMLElement | null
      if (!grid || !settingsGrid) return null

      const visibleChildren = Array.from(grid.children)
        .filter((element) => window.getComputedStyle(element).display !== 'none')
        .map((element) => element as HTMLElement)
      const gaps = visibleChildren.slice(1).map((element, index) => Math.round(element.getBoundingClientRect().top - visibleChildren[index].getBoundingClientRect().bottom))

      return {
        alignContent: window.getComputedStyle(grid).alignContent,
        settingsGridAlignContent: window.getComputedStyle(settingsGrid).alignContent,
        visibleChildren: visibleChildren.length,
        maxGap: gaps.length > 0 ? Math.max(...gaps) : 0,
        gaps
      }
    })
    const aiServiceInitialState = await page.evaluate(async () => ({
      providerCount: (await window.aiv.getAppSettings()).ai.providers.length,
      managedRouteMode: (await window.aiv.getAppSettings()).ai.managedTranslationRouteMode,
      managementCards: document.querySelectorAll('.ai-service-management-card').length,
      tableRows: document.querySelectorAll('.ai-service-table-row:not(.ai-service-table-header)').length,
      tableRadius: window.getComputedStyle(document.querySelector('.ai-service-table') as HTMLElement).borderRadius,
      providerDialogs: document.querySelectorAll('[data-ai-service-provider-dialog]').length,
      currentStrip: document.querySelectorAll('.ai-service-current-strip').length,
      addButton: document.querySelector('.ai-service-add-button') ? 'present' : 'missing'
    }))
    const managedRouteSelect = page.locator('[data-settings-section="ai"] .settings-select')
    const managedRouteSelectCount = await managedRouteSelect.count()
    const nativeSelectCount = await page.locator('select').count()
    await managedRouteSelect.click()
    await page.locator('.app-select-menu').waitFor({ state: 'visible', timeout: 5_000 })
    const managedRouteMenuState = await page.evaluate(() => {
      const menu = document.querySelector('.app-select-menu') as HTMLElement | null
      return {
        menuCount: document.querySelectorAll('.app-select-menu').length,
        optionCount: menu?.querySelectorAll('[role="option"]').length ?? 0,
        position: menu ? window.getComputedStyle(menu).position : 'missing',
        zIndex: menu ? window.getComputedStyle(menu).zIndex : 'missing'
      }
    })
    const managedRouteMenuScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-settings-route-menu.png')
    await page.waitForTimeout(200)
    await page.screenshot({ path: managedRouteMenuScreenshotPath, fullPage: false })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    const managedRouteMenuClosed = await page.locator('.app-select-menu').count() === 0
    await selectAppOption(page, managedRouteSelect, 'worker')
    await page.waitForTimeout(350)
    const managedRouteWorkerState = await page.evaluate(async () => (await window.aiv.getAppSettings()).ai.managedTranslationRouteMode)
    await selectAppOption(page, managedRouteSelect, 'domestic')
    await page.waitForTimeout(350)
    const managedRouteDomesticState = await page.evaluate(async () => (await window.aiv.getAppSettings()).ai.managedTranslationRouteMode)
    await page.locator('.ai-service-add-button').click()
    await page.waitForTimeout(250)
    const aiServiceEditorState = await page.evaluate(async () => ({
      providerCountAfterAdd: (await window.aiv.getAppSettings()).ai.providers.length,
      providerDialogsAfterAdd: document.querySelectorAll('[data-ai-service-provider-dialog]').length,
      editorTitle: document.querySelector('#ai-service-provider-dialog-title')?.textContent?.trim() ?? 'missing',
      firstFieldFocused: document.activeElement?.getAttribute('data-testid') === 'ai-service-provider-name'
    }))
    const aiServiceEditorScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-settings-ai-editor.png')
    await page.screenshot({ path: aiServiceEditorScreenshotPath, fullPage: false })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    const aiServiceEscapeState = await page.evaluate(async () => ({
      providerCountAfterEscape: (await window.aiv.getAppSettings()).ai.providers.length,
      providerDialogsAfterEscape: document.querySelectorAll('[data-ai-service-provider-dialog]').length
    }))
    await page.locator('.ai-service-add-button').click()
    await page.waitForTimeout(250)
    await page.locator('[data-ai-service-provider-dialog] .settings-secondary-button').last().click()
    await page.waitForTimeout(250)
    const aiServiceCancelState = await page.evaluate(async () => ({
      providerCountAfterCancel: (await window.aiv.getAppSettings()).ai.providers.length,
      providerDialogsAfterCancel: document.querySelectorAll('[data-ai-service-provider-dialog]').length
    }))
    const aiScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-settings-ai.png')
    await page.screenshot({ path: aiScreenshotPath, fullPage: false })

    await page.locator('[data-settings-tab="interface"]').click()
    await page.waitForTimeout(500)
    dialogHeightByTab.interface = await readDialogHeight()
    aboutVisibilityByTab.interface = await readAboutDisplay()
    settingsPanelVisibilityByTab.interface = await readSettingsPanelVisibility()
    const interfaceScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-settings-interface.png')
    await page.screenshot({ path: interfaceScreenshotPath, fullPage: false })

    const themeSelect = page.locator('#settings-section-interface .settings-select')
    await selectAppOption(page, themeSelect, 'light')
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
    settingsPanelVisibilityByTab.video = await readSettingsPanelVisibility()

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
    settingsPanelVisibilityByTab.subtitles = await readSettingsPanelVisibility()

    const settingsGrid = page.locator('.settings-grid')
    const settingsGridBeforeScroll = await settingsGrid.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop
    }))
    const settingsGridBox = await settingsGrid.boundingBox()
    if (settingsGridBox) {
      await page.mouse.move(
        settingsGridBox.x + settingsGridBox.width / 2,
        settingsGridBox.y + settingsGridBox.height / 2
      )
      await page.mouse.wheel(0, 600)
    }
    await page.waitForTimeout(100)
    const settingsGridAfterScroll = await settingsGrid.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop
    }))
    const settingsScrollScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-settings-scroll.png')
    await page.screenshot({ path: settingsScrollScreenshotPath, fullPage: false })

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
    const ttsLayoutState = await page.evaluate(() => {
      const provider = document.querySelector('.settings-tts-provider') as HTMLElement | null
      if (!provider) return null
      const children = Array.from(provider.children) as HTMLElement[]
      const gaps = children.slice(1).map((child, index) => Math.round(child.getBoundingClientRect().top - children[index].getBoundingClientRect().bottom))
      const style = window.getComputedStyle(provider)
      return { display: style.display, rowGap: style.rowGap, gaps }
    })

    await page.locator('[data-settings-tab="shortcuts"]').click()
    await page.waitForTimeout(250)
    dialogHeightByTab.shortcuts = await readDialogHeight()
    aboutVisibilityByTab.shortcuts = await readAboutDisplay()
    settingsPanelVisibilityByTab.shortcuts = await readSettingsPanelVisibility()

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
    settingsPanelVisibilityByTab.about = await readSettingsPanelVisibility()
    const aboutPanelState = await page.evaluate(() => {
      const panel = document.querySelector('#settings-section-about') as HTMLElement | null
      const checkButton = panel?.querySelector('.settings-about-update-actions .settings-secondary-button') as HTMLButtonElement | null
      const officialWebsiteButton = panel?.querySelector('.settings-about-website-button') as HTMLButtonElement | null
      return {
        display: panel ? window.getComputedStyle(panel).display : 'missing',
        version: panel?.querySelector('.settings-about-value')?.textContent?.trim() ?? 'missing',
        checkButton: checkButton ? 'present' : 'missing',
        officialWebsiteButton: officialWebsiteButton ? 'present' : 'missing',
        checkDisabled: checkButton?.disabled ?? true
      }
    })

    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-settings-dialog.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    const shortcutScreenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-settings-shortcuts.png')
    await page.screenshot({ path: shortcutScreenshotPath, fullPage: false })

    console.log(`Settings number styles: ${JSON.stringify(numberStyles)}`)
    console.log(`Automatic update toggle: ${JSON.stringify({ autoUpdateInitiallyEnabled, autoUpdateDisabled, autoUpdateReenabled, styles: autoUpdateToggleStyles })}`)
    console.log(`Quick theme toggle state: ${JSON.stringify(quickToggleThemeState)}`)
    console.log(`Light theme state: ${JSON.stringify(lightThemeState)}`)
    console.log(`Settings dialog heights: ${JSON.stringify(dialogHeightByTab)}`)
    console.log(`AI settings layout state: ${JSON.stringify(aiLayoutState)}`)
    console.log(`AI service configuration state: ${JSON.stringify({ initial: aiServiceInitialState, routeWorker: managedRouteWorkerState, routeDomestic: managedRouteDomesticState, afterAdd: aiServiceEditorState, afterEscape: aiServiceEscapeState, afterCancel: aiServiceCancelState, nativeSelectCount, managedRouteMenuState, managedRouteMenuClosed })}`)
    console.log(`AI service route menu screenshot: ${managedRouteMenuScreenshotPath}`)
    console.log(`AI service editor screenshot: ${aiServiceEditorScreenshotPath}`)
    console.log(`Settings panel visibility: ${JSON.stringify(settingsPanelVisibilityByTab)}`)
    console.log(`About visibility by tab: ${JSON.stringify(aboutVisibilityByTab)}`)
    console.log(`Settings layout state: ${JSON.stringify(settingsLayoutState)}`)
    console.log(`Settings scroll state: ${JSON.stringify({ before: settingsGridBeforeScroll, after: settingsGridAfterScroll })}`)
    console.log(`Settings scroll screenshot: ${settingsScrollScreenshotPath}`)
    console.log(`Video settings card height: ${JSON.stringify(videoCardHeight)}`)
    console.log(`Subtitle cache panel: ${JSON.stringify(cachePanelState)}`)
    console.log(`TTS settings state: ${JSON.stringify({ ...ttsSettingsState, initialTtsStatus, ttsStatusAfterCheck })}`)
    console.log(`TTS layout state: ${JSON.stringify(ttsLayoutState)}`)
    console.log(`Shortcut panel: ${JSON.stringify({ shortcutCount, ...shortcutPanelState })}`)
    console.log(`About settings panel: ${JSON.stringify(aboutPanelState)}`)
    console.log(`General settings screenshot: ${generalScreenshotPath}`)
    console.log(`AI settings screenshot: ${aiScreenshotPath}`)
    console.log(`Interface settings screenshot: ${interfaceScreenshotPath}`)
    console.log(`Settings dialog screenshot: ${screenshotPath}`)
    console.log(`Shortcut settings screenshot: ${shortcutScreenshotPath}`)

    if (
      numberStyles.length === 0 ||
      autoUpdateInitiallyEnabled !== true ||
      autoUpdateDisabled !== false ||
      autoUpdateReenabled !== true ||
      !autoUpdateToggleStyles ||
      autoUpdateToggleStyles.width !== '36px' ||
      autoUpdateToggleStyles.height !== '20px' ||
      autoUpdateToggleStyles.borderRadius === '0px' ||
      numberStyles.some((style) => style.textAlign !== 'right') ||
      quickToggleThemeState.documentTheme !== 'light' ||
      quickToggleThemeState.appTheme !== 'light' ||
      lightThemeState.documentTheme !== 'light' ||
      lightThemeState.appTheme !== 'light' ||
      lightThemeState.appBackground !== 'rgb(246, 244, 241)' ||
      Object.values(dialogHeightByTab).some((height) => height !== dialogHeightByTab.general) ||
      Object.entries(aboutVisibilityByTab).some(([tab, display]) => tab !== 'about' && display !== 'none') ||
      !aiLayoutState ||
      aiLayoutState.alignContent !== 'start' ||
      aiLayoutState.settingsGridAlignContent !== 'start' ||
      aiLayoutState.visibleChildren !== 2 ||
      aiLayoutState.maxGap > 20 ||
      aiServiceInitialState.managementCards !== 1 ||
      aiServiceInitialState.managedRouteMode !== 'auto' ||
      managedRouteWorkerState !== 'worker' ||
      managedRouteDomesticState !== 'domestic' ||
      managedRouteSelectCount === 0 ||
      nativeSelectCount !== 0 ||
      managedRouteMenuState.menuCount !== 1 ||
      managedRouteMenuState.optionCount < 3 ||
      managedRouteMenuState.position !== 'fixed' ||
      managedRouteMenuState.zIndex === 'auto' ||
      !managedRouteMenuClosed ||
      aiServiceInitialState.tableRows !== aiServiceInitialState.providerCount ||
      !aiServiceInitialState.tableRadius ||
      aiServiceInitialState.tableRadius === '0px' ||
      aiServiceInitialState.providerDialogs !== 0 ||
      aiServiceInitialState.currentStrip !== 1 ||
      aiServiceInitialState.addButton !== 'present' ||
      aiServiceEditorState.providerCountAfterAdd !== aiServiceInitialState.providerCount ||
      aiServiceEditorState.providerDialogsAfterAdd !== 1 ||
      aiServiceEditorState.editorTitle === 'missing' ||
      aiServiceEditorState.firstFieldFocused !== true ||
      aiServiceEscapeState.providerCountAfterEscape !== aiServiceInitialState.providerCount ||
      aiServiceEscapeState.providerDialogsAfterEscape !== 0 ||
      aiServiceCancelState.providerCountAfterCancel !== aiServiceInitialState.providerCount ||
      aiServiceCancelState.providerDialogsAfterCancel !== 0 ||
      Object.entries(settingsPanelVisibilityByTab).some(([tab, panels]) => {
        const visiblePanels = panels.filter((panel) => panel.display !== 'none')
        return visiblePanels.length !== 1 ||
          visiblePanels[0]?.id !== tab ||
          visiblePanels[0]?.ariaHidden !== 'false' ||
          (tab === 'ai' && visiblePanels[0]?.role !== 'tabpanel')
      }) ||
      settingsLayoutState.bodyOverflow !== 'hidden' ||
      settingsLayoutState.gridOverflowY !== 'auto' ||
      settingsLayoutState.gridScrollbarGutter !== 'stable' ||
      settingsGridBeforeScroll.clientHeight >= settingsGridBeforeScroll.scrollHeight ||
      settingsGridAfterScroll.scrollTop <= settingsGridBeforeScroll.scrollTop ||
      !videoCardHeight ||
      videoCardHeight.alignItems !== 'start' ||
      videoCardHeight.clientHeight > videoCardHeight.scrollHeight + 1 ||
      cachePanelState.display !== 'grid' ||
      cachePanelState.cachePanel !== 'present' ||
      cachePanelState.cacheButtons !== 2 ||
      ttsSettingsState.executablePath !== '/tmp/aivplayer-smoke-tts' ||
      ttsSettingsState.voice !== 'SmokeVoice' ||
      ttsStatusAfterCheck === initialTtsStatus ||
      !ttsLayoutState ||
      ttsLayoutState.display !== 'grid' ||
      ttsLayoutState.rowGap !== '12px' ||
      ttsLayoutState.gaps.some((gap) => gap <= 0) ||
      shortcutCount !== 9 ||
      shortcutPanelState.display !== 'grid' ||
      shortcutPanelState.ariaHidden !== 'false' ||
      aboutPanelState.display !== 'grid' ||
      aboutPanelState.version === 'missing' ||
      aboutPanelState.checkButton !== 'present' ||
      aboutPanelState.officialWebsiteButton !== 'present'
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
