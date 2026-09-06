import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('support prompt', () => {
  it('keeps the feature disabled and the external links centralized', () => {
    const configSource = readSource('src/shared/support-prompt.ts')
    const linksSource = readSource('src/shared/app-links.ts')

    expect(configSource).toContain('SUPPORT_PROMPT_ENABLED = false')
    expect(configSource).toContain('SUPPORT_PROMPT_DISMISSED_STORAGE_KEY')
    expect(configSource).toContain('GITHUB_REPOSITORY_URL')
    expect(configSource).toContain('OFFICIAL_WEBSITE_URL')
    expect(linksSource).toContain('https://github.com/ponponon/aivplayer')
  })

  it('gates automatic and manual entry points behind the feature flag', () => {
    const startupSource = readSource('src/renderer/src/app/use-app-startup-effects.ts')
    const aboutSource = readSource('src/renderer/src/app/about-dialog.tsx')
    const overlaySource = readSource('src/renderer/src/app/app-overlays.tsx')
    const dialogSource = readSource('src/renderer/src/app/support-dialog.tsx')
    const playerCssSource = readSource('src/renderer/src/styles/player.css')
    const supportCssSource = readSource('src/renderer/src/styles/player/support-dialog.css')

    expect(startupSource).toContain('if (!SUPPORT_PROMPT_ENABLED')
    expect(startupSource).toContain('setIsSupportDialogOpen(true)')
    expect(aboutSource).toContain('SUPPORT_PROMPT_ENABLED ?')
    expect(overlaySource).toContain('SUPPORT_PROMPT_ENABLED && app.isSupportDialogOpen')
    expect(dialogSource).toContain('useModalFocusTrap(true')
    expect(dialogSource).toContain('aria-modal="true"')
    expect(dialogSource).toContain('window.aiv.openExternalUrl')
    expect(dialogSource).toContain('SUPPORT_PROMPT_DISMISSED_STORAGE_KEY')
    expect(playerCssSource).toContain("@import './player/support-dialog.css';")
    expect(supportCssSource).toContain('.support-dialog-backdrop')
    expect(supportCssSource).toContain('prefers-reduced-motion')
  })

  it('provides support copy in every supported locale', () => {
    for (const locale of ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']) {
      const source = readSource(`src/shared/i18n/locales/${locale}.ts`)
      expect(source).toContain('supportDialog:')
      expect(source).toContain('linksLabel:')
      expect(source).toContain('openFromAbout:')
    }
  })
})
