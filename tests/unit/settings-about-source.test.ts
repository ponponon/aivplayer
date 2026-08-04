import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('settings about and update controls', () => {
  it('keeps About as a UI-only settings tab', () => {
    const modelSource = readSource('src/renderer/src/app/settings-dialog-model.ts')
    const dialogSource = readSource('src/renderer/src/app/settings-dialog.tsx')
    const sharedSettingsSource = readSource('src/shared/app-settings.ts')

    expect(modelSource).toContain("export type SettingsTabId = AppSettingsSectionId | 'about'")
    expect(modelSource).toContain("{ id: 'about'")
    expect(dialogSource).toContain("if (sectionId !== 'about')")
    expect(sharedSettingsSource).toContain("lastSettingsSectionId: AppSettingsSectionId")
    expect(sharedSettingsSource).not.toContain("AppSettingsSectionId = 'general' | 'interface' | 'video' | 'subtitles' | 'capture' | 'shortcuts' | 'about'")
  })

  it('renders About details and the complete manual update flow', () => {
    const sectionSource = readSource('src/renderer/src/app/settings-sections/about.tsx')
    const overlaySource = readSource('src/renderer/src/app/app-overlays.tsx')
    const controllerSource = readSource('src/renderer/src/app/use-app-controller.ts')
    const cssSource = readSource('src/renderer/src/styles/player/settings-about.css')

    expect(sectionSource).toContain('copy.aboutDialog.license')
    expect(sectionSource).toContain('updateState.currentVersion')
    expect(sectionSource).toContain('copy.settingsDialog.about.checkForUpdates')
    expect(sectionSource).toContain('copy.update.restartAction')
    expect(sectionSource).toContain('onCheckForUpdate')
    expect(sectionSource).toContain('onInstallUpdate')
    expect(overlaySource).toContain('appUpdateState={app.appUpdateState}')
    expect(controllerSource).toContain('useAppUpdater()')
    expect(controllerSource).toContain('checkForAppUpdate: updater.check')
    expect(controllerSource).toContain('installAppUpdate: updater.install')
    expect(cssSource).toContain('.settings-about-update')
    expect(cssSource).toContain('.settings-about-progress')
  })

  it('covers the About tab in the settings smoke flow', () => {
    const smokeSource = readSource('scripts/smoke-settings-dialog.ts')

    expect(smokeSource).toContain('[data-settings-tab="about"]')
    expect(smokeSource).toContain('#settings-section-about')
    expect(smokeSource).toContain('aboutPanelState.checkButton')
  })

  it('provides the About tab copy in every supported locale', () => {
    for (const locale of ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']) {
      const source = readSource(`src/shared/i18n/locales/${locale}.ts`)
      expect(source).toContain('about:')
      expect(source).toContain('checkForUpdates:')
      expect(source).toContain('updateDisabled:')
    }
  })
})
