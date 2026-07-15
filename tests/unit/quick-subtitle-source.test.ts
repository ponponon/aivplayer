import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('quick target-language subtitle source constraints', () => {
  it('keeps the one-click generation and translation flow on the player surface', () => {
    const appSource = readSource('src/renderer/src/app/App.tsx')
    const playerCss = readSource('src/renderer/src/styles/player.css')
    const i18nSource = readSource('src/shared/i18n.ts')

    expect(appSource).toContain('quick-subtitle-action')
    expect(appSource).toContain('runQuickTargetSubtitle')
    expect(appSource).toContain('await translateSubtitle(quickTargetLanguage, generatedSubtitle, flowStartedAt)')
    expect(appSource).toContain('isSubtitleLanguageMatch')
    expect(appSource).toContain('subtitleGenerationElapsed')
    expect(appSource).toContain('generationStats')
    expect(appSource).toContain('translationStats')
    expect(appSource).toContain('translation-summary')
    expect(appSource).toContain('formatElapsedTime')
    expect(appSource).toContain("event.code === 'KeyC'")
    expect(appSource).toContain('event.metaKey || event.ctrlKey')
    expect(appSource).toContain('aria-keyshortcuts="Meta+Shift+C Control+Shift+C"')
    expect(appSource).toContain('<kbd>⌘/Ctrl + Shift + C</kbd>')
    expect(i18nSource).toContain('quickTargetSubtitle')
    expect(i18nSource).not.toContain('quickChineseSubtitle')
    expect(appSource).toContain('className="controls-secondary"')
    expect(playerCss).toMatch(/\.quick-subtitle-action\s*\{[^}]*justify-content:\s*flex-end;/s)
    expect(playerCss).not.toContain('.control-status-row')
    expect(playerCss).toMatch(/\.quick-subtitle-button\.is-ready\s*\{[^}]*color:\s*var\(--ok\);/s)
  })
})
