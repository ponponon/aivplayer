import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('cross-platform about dialog', () => {
  it('exposes the runtime platform and adds an in-app entry outside macOS', () => {
    const preloadSource = readSource('src/preload/index.ts')
    const headerSource = readSource('src/renderer/src/app/app-header.tsx')

    expect(preloadSource).toContain('platform: process.platform')
    expect(headerSource).toContain("window.aiv.platform === 'darwin'")
    expect(headerSource).toContain('setIsAboutDialogOpen(true)')
    expect(headerSource).toContain('<CircleQuestionMark size={17} />')
  })

  it('loads the packaged version and follows the shared dialog accessibility pattern', () => {
    const dialogSource = readSource('src/renderer/src/app/about-dialog.tsx')
    const releaseSource = readSource('src/shared/app-release.ts')
    const overlaySource = readSource('src/renderer/src/app/app-overlays.tsx')
    const playerCssSource = readSource('src/renderer/src/styles/player.css')
    const aboutCssSource = readSource('src/renderer/src/styles/player/about-dialog.css')

    expect(dialogSource).toContain('window.aiv.getAppVersion()')
    expect(dialogSource).toContain('APP_RELEASE_DATE')
    expect(releaseSource).toContain("APP_RELEASE_DATE = '2026-08-20'")
    expect(dialogSource).toContain('useModalFocusTrap(true')
    expect(dialogSource).toContain('role="dialog"')
    expect(dialogSource).toContain('aria-labelledby="about-dialog-title"')
    expect(dialogSource).toContain('OFFICIAL_WEBSITE_URL')
    expect(dialogSource).toContain('openOfficialWebsite')
    expect(overlaySource).toContain('<AboutDialog copy={app.copy}')
    expect(playerCssSource).toContain("@import './player/about-dialog.css';")
    expect(aboutCssSource).toContain('.about-dialog {')
  })

  it('keeps the about dialog copy available in every supported locale', () => {
    for (const locale of ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']) {
      const source = readSource(`src/shared/i18n/locales/${locale}.ts`)
      expect(source).toContain('aboutDialog:')
      expect(source).toContain('releaseDateLabel:')
    }
  })

  it('configures the native about panel with a visible ISO release date', () => {
    const desktopSource = readSource('src/desktop/desktop-settings.ts')
    const panelSource = readSource('src/desktop/about-panel.ts')

    expect(desktopSource).toContain('configureAboutPanel()')
    expect(panelSource).toContain('createAboutPanelOptions')
    expect(panelSource).toContain('copyright: `${copy.releaseDateLabel} ${releaseDate}\\nCopyright © 2026 ponponon`')
  })
})
