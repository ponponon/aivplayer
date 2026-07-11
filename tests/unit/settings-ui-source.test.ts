import { describe, expect, it } from 'vitest'
import { countMatches, expectInOrder, getNamedBody, readSource } from './test-source-utils'

describe('settings UI source constraints', () => {
  it('uses the gear icon for the topbar settings action', () => {
    const appSource = readSource('src/renderer/src/app/App.tsx')

    expect(appSource).toContain('Settings,')
    expect(appSource).toContain('<Settings size={17} />')
    expect(appSource).not.toContain('<Settings2 size={17} />')
  })

  it('stacks settings field labels above controls by default', () => {
    const playerCss = readSource('src/renderer/src/styles/player.css')

    expect(playerCss).toMatch(/\.settings-field\s*\{[^}]*grid-template-columns:\s*1fr;/s)
  })

  it('routes every settings field through the shared SettingsField structure', () => {
    const settingsDialogSource = readSource('src/renderer/src/app/settings-dialog.tsx')
    const settingsFieldComponentBody = getNamedBody(
      settingsDialogSource,
      /function SettingsField[\s\S]*?<div className="settings-field">(?<body>[\s\S]*?)<\/div>\s*\)\s*\}/
    )

    expect(settingsDialogSource).toContain('function SettingsField')
    expect(countMatches(settingsDialogSource, /className="settings-field"/g)).toBe(1)
    expect(settingsFieldComponentBody).toContain('className="settings-field-copy"')
    expectInOrder(settingsFieldComponentBody, 'className="settings-field-copy"', '{children}')
  })

  it('routes settings select and number controls through shared renderers', () => {
    const settingsDialogSource = readSource('src/renderer/src/app/settings-dialog.tsx')

    expect(settingsDialogSource).toContain('function SettingsSelect')
    expect(settingsDialogSource).toContain('function SettingsNumberInput')
    expect(settingsDialogSource).toContain('function SettingsTextInput')
    expect(countMatches(settingsDialogSource, /className="settings-select"/g)).toBe(1)
    expect(countMatches(settingsDialogSource, /className=\{settingsNumberClassName\}/g)).toBe(1)
    expect(countMatches(settingsDialogSource, /className=\{settingsTextClassName\}/g)).toBe(1)
    expect(countMatches(settingsDialogSource, /className="settings-number/g)).toBe(0)
  })

  it('routes settings section writes through one shared patch helper', () => {
    const settingsDialogSource = readSource('src/renderer/src/app/settings-dialog.tsx')
    const sharedSettingsSource = readSource('src/shared/app-settings.ts')

    expect(settingsDialogSource).toContain('patchSettingsSection: AppSettingsSectionPatcher')
    expect(settingsDialogSource).toContain('AppSettingsSectionPatcher')
    expect(settingsDialogSource).not.toContain('createAppSettingsSectionPatcher')
    expect(settingsDialogSource).not.toContain('onChange: (updater: (current: AppSettings) => AppSettings) => void')
    expect(sharedSettingsSource).toContain('export function updateAppSettingsSection')
    expect(sharedSettingsSource).toContain('export function createAppSettingsSectionPatcher')
    expect(sharedSettingsSource).toContain('export type AppSettingsSectionPatcher')
    expect(countMatches(settingsDialogSource, /patchSettings\(\(current\) => \(\{/g)).toBe(0)
    expect(countMatches(settingsDialogSource, /patchSettingsSection\('/g)).toBeGreaterThan(0)
    expect(
      countMatches(
        settingsDialogSource,
        /patchUiSettings|patchMediaSettings|patchPlaybackSettings|patchAsrSettings|patchCaptureSettings/g
      )
    ).toBe(0)
  })

  it('routes subtitle display settings through shared settings controls', () => {
    const settingsDialogSource = readSource('src/renderer/src/app/settings-dialog.tsx')
    const subtitlesSectionSource = settingsDialogSource.slice(
      settingsDialogSource.indexOf('id="settings-section-subtitles"'),
      settingsDialogSource.indexOf('id="settings-section-capture"')
    )

    expect(settingsDialogSource).toContain('subtitleLineHeightOptions')
    expect(settingsDialogSource).toContain('subtitleDisplayModeOptions')
    expect(settingsDialogSource).toContain('targetLanguageOptions')
    expect(settingsDialogSource).toContain('SubtitleTargetLanguageId')
    expect(settingsDialogSource).toContain('option is SettingsSelectOption<SubtitleTargetLanguageId>')
    expect(settingsDialogSource).toContain("option.value !== 'auto'")
    expect(subtitlesSectionSource).toContain('SettingsNumberInput')
    expect(subtitlesSectionSource).toContain('SettingsSelect')
    expect(settingsDialogSource).toContain('value={settings.subtitles.fontSizePx}')
    expect(settingsDialogSource).toContain('value={settings.subtitles.lineHeight}')
    expect(settingsDialogSource).toContain('options={subtitleLineHeightOptions}')
    expect(settingsDialogSource).toContain('value={settings.subtitles.displayMode}')
    expect(settingsDialogSource).toContain('options={subtitleDisplayModeOptions}')
    expect(settingsDialogSource).toContain('value={settings.subtitles.targetLanguage}')
    expect(settingsDialogSource).toContain('options={targetLanguageOptions}')
    expect(settingsDialogSource).toContain('translationServiceTitle')
    expect(settingsDialogSource).toContain('translationBaseUrl')
    expect(settingsDialogSource).toContain('translationModel')
    expect(settingsDialogSource).toContain('translationApiKey')
    expect(settingsDialogSource).toContain('translationGlossary')
    expect(settingsDialogSource).toContain('SettingsTextarea')
    expect(settingsDialogSource).toContain('translationServiceCheckTitle')
    expect(settingsDialogSource).toContain('translationServiceCheckDescription')
    expect(settingsDialogSource).toContain('translationServiceCheck')
    expect(settingsDialogSource).toContain('translationServiceChecking')
    expect(settingsDialogSource).toContain('translationServiceResultTitle')
    expect(settingsDialogSource).toContain('translationServicePreviewTitle')
    expect(settingsDialogSource).toContain("patchSettingsSection('subtitles', { fontSizePx: clampSubtitleFontSize(fontSizePx) })")
    expect(settingsDialogSource).toContain("patchSettingsSection('subtitles', { lineHeight })")
    expect(settingsDialogSource).toContain("patchSettingsSection('subtitles', { displayMode })")
    expect(settingsDialogSource).toContain("patchSettingsSection('subtitles', { targetLanguage })")
    expect(settingsDialogSource).toContain("patchSettingsSection('asr', { translationBaseUrl: translationBaseUrl.trim() || null })")
    expect(settingsDialogSource).toContain("patchSettingsSection('asr', { translationModel: translationModel.trim() || null })")
    expect(settingsDialogSource).toContain("patchSettingsSection('asr', { translationApiKey: translationApiKey.trim() || null })")
    expect(settingsDialogSource).toContain("patchSettingsSection('asr', { translationGlossary: translationGlossary.trim() || null })")
    expect(settingsDialogSource).toContain('translationServiceTestMessage')
    expect(settingsDialogSource).toContain('isTestingTranslationService')
    expect(settingsDialogSource).toContain('onTestTranslationService')
    expect(settingsDialogSource).toContain('translationServiceSourceLanguageLabel')
    expect(settingsDialogSource).toContain('translationServiceTargetLanguageLabel')
    expect(settingsDialogSource).toContain('translationServiceEndpointSummary')
    expect(settingsDialogSource).toContain('sampleSourceText')
    expect(settingsDialogSource).toContain('sampleTranslatedText')
    expect(settingsDialogSource).toContain('settings-meta-grid')
    expect(settingsDialogSource).toContain('settings-meta-item')
    expectInOrder(
      subtitlesSectionSource,
      'value={settings.subtitles.fontSizePx}',
      "patchSettingsSection('subtitles', { fontSizePx: clampSubtitleFontSize(fontSizePx) })"
    )
    expectInOrder(subtitlesSectionSource, 'options={subtitleLineHeightOptions}', "patchSettingsSection('subtitles', { lineHeight })")
    expectInOrder(subtitlesSectionSource, 'options={subtitleDisplayModeOptions}', "patchSettingsSection('subtitles', { displayMode })")
    expectInOrder(subtitlesSectionSource, 'options={targetLanguageOptions}', "patchSettingsSection('subtitles', { targetLanguage })")
    expectInOrder(subtitlesSectionSource, 'translationServiceTitle', "patchSettingsSection('asr', { translationBaseUrl: translationBaseUrl.trim() || null })")
  })

  it('routes app settings section writes through the shared update helper', () => {
    const appSource = readSource('src/renderer/src/app/App.tsx')
    const sharedSettingsSource = readSource('src/shared/app-settings.ts')

    expect(appSource).toContain('const patchAppSettingsSection')
    expect(appSource).toContain('createAppSettingsSectionPatcher(patchAppSettings)')
    expect(appSource).toContain('patchSettingsSection={patchAppSettingsSection}')
    expect(appSource).not.toContain('onChange={patchAppSettings}')
    expect(appSource).toContain('AppSettingsSectionPatcher')
    expect(appSource).toContain('const syncPlaybackMemory')
    expect(appSource).toContain('const syncClipExportPreferences')
    expect(appSource).toContain('const patchSubtitleDisplaySettings')
    expect(appSource).toContain('const resetSubtitleDisplaySettings')
    expect(appSource).toContain('onSettingsChange={patchSubtitleDisplaySettings}')
    expect(appSource).toContain('onResetSettings={resetSubtitleDisplaySettings}')
    expect(sharedSettingsSource).toContain('export function updateAppSettingsSection')
    expect(sharedSettingsSource).toContain('export function createAppSettingsSectionPatcher')
    expect(sharedSettingsSource).toContain('export type AppSettingsSectionPatcher')
    expect(countMatches(appSource, /patchAppSettingsSection\('/g)).toBe(6)
    expect(countMatches(appSource, /patchAppSettingsSection\('subtitles'/g)).toBe(3)
    expect(countMatches(appSource, /syncPlaybackMemory\(/g)).toBe(3)
    expect(countMatches(appSource, /syncClipExportPreferences\(/g)).toBe(1)
    expect(countMatches(appSource, /patchAppSettingsSection\('playback', \{/g)).toBe(1)
    expect(countMatches(appSource, /patchAppSettingsSection\('capture', \{/g)).toBe(1)
    expect(appSource).not.toContain('...current.playback.lastProgressByPath')
    expect(appSource).not.toContain('nextSectionUpdater')
    expect(countMatches(appSource, /patchAppSettings\(\(current\) => \(\{/g)).toBe(0)
  })

  it('exposes the settings dialog smoke script from package scripts', () => {
    const packageJson = JSON.parse(readSource('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['smoke:settings-dialog']).toBe(
      'node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/smoke-settings-dialog.ts'
    )
    expect(packageJson.scripts?.['smoke:settings-dialog:en']).toBe(
      'node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/smoke-settings-dialog.ts --locale en-US'
    )
    expect(packageJson.scripts?.['smoke:settings-dialog:ja']).toBe(
      'node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/smoke-settings-dialog.ts --locale ja-JP'
    )
    expect(packageJson.scripts?.['smoke:settings-dialog:ko']).toBe(
      'node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/smoke-settings-dialog.ts --locale ko-KR'
    )
    expect(packageJson.scripts?.['smoke:settings-dialog:all']).toBe(
      'npm run smoke:settings-dialog && npm run smoke:settings-dialog:en && npm run smoke:settings-dialog:ja && npm run smoke:settings-dialog:ko'
    )
  })

  it('routes settings toggle rows through the shared SettingsToggle structure', () => {
    const settingsDialogSource = readSource('src/renderer/src/app/settings-dialog.tsx')
    const settingsToggleComponentBody = getNamedBody(
      settingsDialogSource,
      /function SettingsToggle[\s\S]*?<label className="setting-toggle">(?<body>[\s\S]*?)<\/label>\s*\)\s*\}/
    )

    expect(settingsDialogSource).toContain('function SettingsToggle')
    expect(countMatches(settingsDialogSource, /className="setting-toggle"/g)).toBe(1)
    expect(settingsToggleComponentBody).toContain('type="checkbox"')
    expectInOrder(settingsToggleComponentBody, 'type="checkbox"', '{title}')
    expect(settingsToggleComponentBody).toContain('{description ? <small>{description}</small> : null}')
  })

  it('routes settings folder picker rows through the shared SettingsFolderPicker structure', () => {
    const settingsDialogSource = readSource('src/renderer/src/app/settings-dialog.tsx')
    const folderPickerComponentBody = getNamedBody(
      settingsDialogSource,
      /function SettingsFolderPicker[\s\S]*?<div className="settings-inline-row">(?<body>[\s\S]*?)<\/div>\s*\)\s*\}/
    )

    expect(settingsDialogSource).toContain('function SettingsFolderPicker')
    expect(countMatches(settingsDialogSource, /className="settings-path-value"/g)).toBe(1)
    expect(folderPickerComponentBody).toContain('className="settings-path-value"')
    expect(folderPickerComponentBody).toContain('<FolderOpen size={14} />')
    expect(folderPickerComponentBody).toContain('onPickFolder')
    expect(folderPickerComponentBody).toContain('clearLabel ?')
  })

  it('routes compact toggle value rows through the shared SettingsToggleValueRow structure', () => {
    const settingsDialogSource = readSource('src/renderer/src/app/settings-dialog.tsx')
    const toggleValueRowComponentBody = getNamedBody(
      settingsDialogSource,
      /function SettingsToggleValueRow[\s\S]*?<div className="settings-inline-row">(?<body>[\s\S]*?)<\/div>\s*\)\s*\}/
    )

    expect(settingsDialogSource).toContain('function SettingsToggleValueRow')
    expect(countMatches(settingsDialogSource, /className="settings-checkbox"/g)).toBe(1)
    expect(countMatches(settingsDialogSource, /className="settings-inline-unit"/g)).toBe(2)
    expect(countMatches(settingsDialogSource, /className="settings-inline-row"/g)).toBe(4)
    expect(toggleValueRowComponentBody).toContain('SettingsNumberInput')
    expect(toggleValueRowComponentBody).toContain('aria-label={checkboxAriaLabel}')
    expect(toggleValueRowComponentBody).toContain('ariaLabel={valueAriaLabel}')
  })

  it('keeps settings form control dimensions on shared local tokens', () => {
    const playerCss = readSource('src/renderer/src/styles/player.css')
    const inputControlRule = playerCss.match(/\.settings-select,\s*\.settings-number,\s*\.settings-text\s*\{(?<body>[^}]*)\}/s)
    const inputControlRuleBody = inputControlRule?.groups?.body ?? ''

    expect(playerCss).toMatch(/\.settings-dialog\s*\{[^}]*--settings-control-height:\s*36px;/s)
    expect(playerCss).toMatch(/\.settings-dialog\s*\{[^}]*--settings-control-padding-x:\s*12px;/s)
    expect(playerCss).toMatch(/\.settings-dialog\s*\{[^}]*--settings-control-radius:\s*var\(--radius-md\);/s)
    expect(inputControlRuleBody).toMatch(/(?:^|[\n\r;])\s*height:\s*var\(--settings-control-height\);/)
    expect(inputControlRuleBody).not.toMatch(/min-height:\s*var\(--settings-control-height\);/)
    expect(playerCss).toMatch(/\.settings-select,\s*\.settings-number,\s*\.settings-text\s*\{[^}]*padding:\s*0 var\(--settings-control-padding-x\);/s)
    expect(playerCss).toMatch(/\.settings-path-value\s*\{[^}]*min-height:\s*var\(--settings-control-height\);/s)
    expect(playerCss).toMatch(/\.settings-path-value\s*\{[^}]*padding:\s*8px var\(--settings-control-padding-x\);/s)
    expect(playerCss).toMatch(/\.settings-secondary-button\s*\{[^}]*min-height:\s*var\(--settings-control-height\);/s)
    expect(playerCss).toMatch(/\.settings-secondary-button\s*\{[^}]*padding:\s*0 calc\(var\(--settings-control-padding-x\) \+ 2px\);/s)
  })

  it('keeps settings number values right-aligned across compact and full-width controls', () => {
    const playerCss = readSource('src/renderer/src/styles/player.css')
    const numberTextAlignRules = Array.from(
      playerCss.matchAll(/(?<selector>[^{}]*\.settings-number[^{}]*)\{(?<body>[^}]*)\}/g)
    )
      .map((match) => ({
        selector: match.groups?.selector.replace(/\s+/g, ' ').trim(),
        textAlign: match.groups?.body.match(/text-align:\s*([^;]+);/)?.[1]
      }))
      .filter((rule) => rule.textAlign != null)

    expect(numberTextAlignRules).toEqual([{ selector: '.settings-number', textAlign: 'right' }])
  })

  it('checks settings dialog alignment in the smoke screenshot script', () => {
    const smokeScript = readSource('scripts/smoke-settings-dialog.ts')

    expect(smokeScript).toContain("'zh-CN': '打开设置'")
    expect(smokeScript).toContain("'en-US': 'Open settings'")
    expect(smokeScript).toContain("'ja-JP': '設定を開く'")
    expect(smokeScript).toContain("'ko-KR': '설정 열기'")
    expect(smokeScript).toContain('getArgValue(\'--locale\')')
    expect(smokeScript).toContain('await page.reload({ waitUntil: \'domcontentloaded\' })')
    expect(smokeScript).toContain('mkdtemp')
    expect(smokeScript).toContain("'aivplayer-smoke-settings-home-'")
    expect(smokeScript).toContain("join(smokeHomeDirectory, 'aivplayer-smoke-settings-dialog.png')")
    expect(smokeScript).toContain('window.aiv.getAppSettings()')
    expect(smokeScript).toContain('openSettingsLabelByLocale')
    expect(smokeScript).toContain("page.screenshot({ path: screenshotPath, fullPage: false })")
    expect(smokeScript).toContain("textAlign !== 'right'")
    expect(smokeScript).toContain("page.locator('[data-settings-tab=\"interface\"]').click()")
  })
})
