import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BUILTIN_EDITING_THEMES } from '../../src/core/editing/themes'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'
import { EditingThemeControl } from '../../src/renderer/src/app/editing-theme-control'

describe('editing theme control', () => {
  it('exposes built-in presets and a saved-theme workflow', () => {
    const html = renderToStaticMarkup(<EditingThemeControl
      title={zhCN.editing.themeTitle}
      presetLabel={zhCN.editing.themePresetLabel}
      presetNames={zhCN.editing.themePresetNames}
      savedLabel={zhCN.editing.themeSavedLabel}
      searchPlaceholder={zhCN.editing.themeSearchPlaceholder}
      namePlaceholder={zhCN.editing.themeNamePlaceholder}
      saveLabel={zhCN.editing.themeSave}
      emptyLabel={zhCN.editing.themeEmpty}
      deleteLabel={zhCN.editing.themeDelete}
      current={BUILTIN_EDITING_THEMES[0]}
      savedThemes={[]}
      onApply={() => undefined}
      onSave={() => undefined}
      onDelete={() => undefined}
    />)

    expect(html).toContain('data-testid="editing-theme-control"')
    expect(html).toContain('data-testid="editing-theme-clean"')
    expect(html).toContain('data-testid="editing-theme-warm"')
    expect(html).toContain('data-testid="editing-theme-mint"')
    expect(html).toContain('data-testid="editing-theme-cinema"')
    expect(html).toContain('data-testid="editing-theme-gold"')
    expect(html).toContain('data-testid="editing-frame-preview-warm"')
    expect(html).toContain('data-testid="editing-theme-name"')
    expect(html).toContain('data-testid="editing-theme-save"')
    expect(html).toContain('主题')
  })
})
