import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('subtitle display source constraints', () => {
  it('feeds app subtitle settings into the subtitle overlay', () => {
    const appSource = readSource('src/renderer/src/app/App.tsx')
    const overlaySource = readSource('src/renderer/src/subtitle-overlay.tsx')

    expect(appSource).toContain('settings={appSettings.subtitles}')
    expect(appSource).toContain("patchAppSettingsSection('subtitles', patch)")
    expect(overlaySource).toContain('SubtitleDisplayControls')
    expect(overlaySource).toContain('--subtitle-font-size')
    expect(overlaySource).toContain('--subtitle-line-height')
  })

  it('uses css variables for subtitle text sizing', () => {
    const playerCss = readSource('src/renderer/src/styles/player.css')

    expect(playerCss).toMatch(/\.subtitle-text\s*\{[^}]*font-size:\s*var\(--subtitle-font-size\);/s)
    expect(playerCss).toMatch(/\.subtitle-text\s*\{[^}]*line-height:\s*var\(--subtitle-line-height\);/s)
    expect(playerCss).not.toMatch(/\.subtitle-text\s*\{[^}]*font-size:\s*14px;/s)
  })

  it('keeps the quick subtitle controls out of normal document flow', () => {
    const playerCss = readSource('src/renderer/src/styles/player.css')

    expect(playerCss).toContain('.subtitle-display-controls-menu')
    expect(playerCss).toMatch(/\.subtitle-display-controls-menu\s*\{[^}]*position:\s*absolute;/s)
  })
})
