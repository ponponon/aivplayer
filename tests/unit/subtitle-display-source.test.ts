import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('subtitle display source constraints', () => {
  it('feeds app subtitle settings into the subtitle overlay', () => {
    const appSource = readSource('src/renderer/src/app/App.tsx')
    const overlaySource = readSource('src/renderer/src/subtitle-overlay.tsx')
    const controlsSource = readSource('src/renderer/src/app/subtitle-display-controls.tsx')

    expect(appSource).toContain('settings={appSettings.subtitles}')
    expect(appSource).toContain('const patchSubtitleDisplaySettings')
    expect(appSource).toContain('onSettingsChange={patchSubtitleDisplaySettings}')
    expect(appSource).toContain('onResetSettings={resetSubtitleDisplaySettings}')
    expect(overlaySource).toContain('SubtitleDisplayControls')
    expect(controlsSource).toContain('effectiveDisplayMode')
    expect(overlaySource).toContain('--subtitle-font-size')
    expect(overlaySource).toContain('--subtitle-line-height')
  })

  it('wires translated subtitle results into the overlay and ASR panel', () => {
    const appSource = readSource('src/renderer/src/app/App.tsx')
    const preloadSource = readSource('src/preload/index.ts')
    const ipcSource = readSource('src/shared/ipc-channels.ts')
    const mediaTypesSource = readSource('src/shared/media-types.ts')

    expect(ipcSource).toContain('ASR_TRANSLATE_SUBTITLE')
    expect(preloadSource).toContain('translateAsrSubtitle')
    expect(mediaTypesSource).toContain('AsrSubtitleTranslationRequest')
    expect(mediaTypesSource).toContain('AsrSubtitleTranslationResult')
    expect(mediaTypesSource).toContain('subtitleLanguage?: string')
    expect(appSource).toContain('Languages,')
    expect(appSource).toContain('const [translatedSubtitleResult')
    expect(appSource).toContain('window.aiv.translateAsrSubtitle')
    expect(appSource).toContain('translationPath={translatedSubtitleResult?.subtitlePath ?? null}')
    expect(appSource).toContain('setTranslatedSubtitleResult(result.success ? result : null)')
    expect(appSource).toContain('formatSubtitleLanguageLabel')
    expect(appSource).toContain('const subtitleSourceLanguage =')
    expect(appSource).toContain('const subtitleSourceLanguageLabel =')
    expect(appSource).toContain('subtitleResult?.subtitleLanguage')
    expect(appSource).toContain('sourceLanguage: subtitleSourceLanguage')
    expect(appSource).toContain('copy.asrPanel.subtitleLanguage')
    expect(appSource).toContain('className="subtitle-language-row"')
  })

  it('shows source mode when translation display is unavailable', () => {
    const controlsSource = readSource('src/renderer/src/app/subtitle-display-controls.tsx')

    expect(controlsSource).toContain(
      "const effectiveDisplayMode = !hasTranslation && settings.displayMode !== 'source' ? 'source' : settings.displayMode"
    )
    expect(controlsSource).toContain('value={effectiveDisplayMode}')
    expect(controlsSource).toContain("{!hasTranslation && settings.displayMode !== 'source' ? (")
  })

  it('does not use menu roles for form-based quick controls', () => {
    const controlsSource = readSource('src/renderer/src/app/subtitle-display-controls.tsx')

    expect(controlsSource).toContain('className="subtitle-display-controls-menu"')
    expect(controlsSource).not.toContain('className="subtitle-display-controls-menu" role="menu"')
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

  it('styles the subtitle language status as a compact inline pill', () => {
    const playerCss = readSource('src/renderer/src/styles/player.css')

    expect(playerCss).toContain('.subtitle-language-row')
    expect(playerCss).toMatch(/\.subtitle-language-row\s*\{[^}]*display:\s*inline-flex;/s)
    expect(playerCss).toMatch(/\.subtitle-language-row\s*\{[^}]*border-radius:\s*var\(--radius-sm\);/s)
  })
})
