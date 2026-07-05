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
    expect(countMatches(settingsDialogSource, /className="settings-select"/g)).toBe(1)
    expect(countMatches(settingsDialogSource, /className=\{settingsNumberClassName\}/g)).toBe(1)
    expect(countMatches(settingsDialogSource, /className="settings-number/g)).toBe(0)
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

  it('keeps settings form control dimensions on shared local tokens', () => {
    const playerCss = readSource('src/renderer/src/styles/player.css')
    const inputControlRule = playerCss.match(/\.settings-select,\s*\.settings-number\s*\{(?<body>[^}]*)\}/s)
    const inputControlRuleBody = inputControlRule?.groups?.body ?? ''

    expect(playerCss).toMatch(/\.settings-dialog\s*\{[^}]*--settings-control-height:\s*36px;/s)
    expect(playerCss).toMatch(/\.settings-dialog\s*\{[^}]*--settings-control-padding-x:\s*12px;/s)
    expect(playerCss).toMatch(/\.settings-dialog\s*\{[^}]*--settings-control-radius:\s*var\(--radius-md\);/s)
    expect(inputControlRuleBody).toMatch(/(?:^|[\n\r;])\s*height:\s*var\(--settings-control-height\);/)
    expect(inputControlRuleBody).not.toMatch(/min-height:\s*var\(--settings-control-height\);/)
    expect(playerCss).toMatch(/\.settings-select,\s*\.settings-number\s*\{[^}]*padding:\s*0 var\(--settings-control-padding-x\);/s)
    expect(playerCss).toMatch(/\.settings-path-value\s*\{[^}]*min-height:\s*var\(--settings-control-height\);/s)
    expect(playerCss).toMatch(/\.settings-path-value\s*\{[^}]*padding:\s*8px var\(--settings-control-padding-x\);/s)
    expect(playerCss).toMatch(/\.settings-secondary-button\s*\{[^}]*min-height:\s*var\(--settings-control-height\);/s)
    expect(playerCss).toMatch(/\.settings-secondary-button\s*\{[^}]*padding:\s*0 calc\(var\(--settings-control-padding-x\) \+ 2px\);/s)
  })

  it('keeps settings number values centered across compact and full-width controls', () => {
    const playerCss = readSource('src/renderer/src/styles/player.css')
    const numberTextAlignRules = Array.from(
      playerCss.matchAll(/(?<selector>[^{}]*\.settings-number[^{}]*)\{(?<body>[^}]*)\}/g)
    )
      .map((match) => ({
        selector: match.groups?.selector.replace(/\s+/g, ' ').trim(),
        textAlign: match.groups?.body.match(/text-align:\s*([^;]+);/)?.[1]
      }))
      .filter((rule) => rule.textAlign != null)

    expect(numberTextAlignRules).toEqual([{ selector: '.settings-number', textAlign: 'center' }])
  })
})
