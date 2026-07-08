# Subtitle Display Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent subtitle display settings and an in-player quick control for subtitle font size and line height.

**Architecture:** Add a dedicated `AppSettings.subtitles` section for display preferences, keep ASR generation preferences in `AppSettings.asr`, and feed the subtitle display settings into `SubtitleOverlay`. The overlay owns the quick settings popover; the settings dialog owns long-lived preference editing; both write through the existing `AppSettingsSectionPatcher`.

**Tech Stack:** Electron, React 19, TypeScript, Vite, Vitest, Playwright smoke scripts, lucide-react.

---

## Scope

This plan implements the first phase from the spec:

- Persistent subtitle display settings.
- Subtitle overlay font-size and line-height control.
- In-player quick settings popover.
- Settings dialog controls for the same preferences.
- Tests, smoke script wiring, and `FEATURE.md`.

This plan does not implement real subtitle translation, translation provider adapters, or translated subtitle cache files.

## File Structure

- Modify `src/shared/app-settings.ts`: define subtitle display types, default settings, section patch typing.
- Modify `src/main/app-settings.ts`: sanitize the new `subtitles` section.
- Modify `tests/unit/app-settings.test.ts`: cover defaults, persistence, and sanitizer bounds.
- Modify `src/shared/i18n.ts`: add labels for quick subtitle controls and settings dialog subtitle display controls in all locales.
- Modify `src/renderer/src/app/settings-dialog.tsx`: add subtitle display controls using existing settings components.
- Create `src/renderer/src/app/subtitle-display-controls.tsx`: focused quick popover component for the subtitle bar.
- Modify `src/renderer/src/subtitle-overlay.tsx`: consume display settings and render quick controls beside active subtitle text.
- Modify `src/renderer/src/app/App.tsx`: pass settings and patch callbacks into `SubtitleOverlay`.
- Modify `src/renderer/src/styles/player.css`: convert fixed subtitle text styles to CSS variables and style the quick popover.
- Create `tests/unit/subtitle-display-source.test.ts`: source constraints for CSS variables and quick control wiring.
- Modify `tests/unit/settings-ui-source.test.ts`: assert settings dialog continues using shared settings controls.
- Create `scripts/smoke-subtitle-settings.ts`: check subtitle settings persistence and CSS selectors in a real Electron window.
- Modify `tests/unit/dialog-smoke-source.test.ts`: assert package script and stable selectors for the new smoke.
- Modify `package.json`: add `smoke:subtitle-settings`, include it in `smoke:all`.
- Modify `FEATURE.md`: document the new user-facing subtitle display settings.

---

### Task 1: App Settings Model And Sanitizer

**Files:**
- Modify: `src/shared/app-settings.ts`
- Modify: `src/main/app-settings.ts`
- Test: `tests/unit/app-settings.test.ts`

- [ ] **Step 1: Write failing settings tests**

Add the subtitle assertions to the existing persistence test in `tests/unit/app-settings.test.ts`:

```ts
settings.subtitles.fontSizePx = 22
settings.subtitles.lineHeight = 'relaxed'
settings.subtitles.displayMode = 'bilingual'
settings.subtitles.targetLanguage = 'zh'
```

Add a sanitizer test after `sanitizes unsupported asr and ui settings`:

```ts
it('sanitizes unsupported subtitle display settings', async () => {
  await writeFile(
    join(tempDirectory, 'app-settings.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        subtitles: {
          fontSizePx: 999,
          lineHeight: 'giant',
          displayMode: 'ghost',
          targetLanguage: 'not-a-language'
        }
      },
      null,
      2
    )}\n`
  )

  const settings = await readAppSettings(tempDirectory)

  expect(settings.subtitles).toEqual({
    fontSizePx: 14,
    lineHeight: 'normal',
    displayMode: 'source',
    targetLanguage: 'zh'
  })
})
```

Add a bounds test after that:

```ts
it('clamps subtitle font size settings', async () => {
  await writeFile(
    join(tempDirectory, 'app-settings.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        subtitles: {
          fontSizePx: 11.4,
          lineHeight: 'compact',
          displayMode: 'translation',
          targetLanguage: 'en'
        }
      },
      null,
      2
    )}\n`
  )

  await expect(readAppSettings(tempDirectory)).resolves.toMatchObject({
    subtitles: {
      fontSizePx: 12,
      lineHeight: 'compact',
      displayMode: 'translation',
      targetLanguage: 'en'
    }
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run test -- tests/unit/app-settings.test.ts
```

Expected: FAIL because `settings.subtitles` does not exist yet.

- [ ] **Step 3: Add shared subtitle settings types and defaults**

In `src/shared/app-settings.ts`, increment the schema version and add the types near the other setting types:

```ts
export const APP_SETTINGS_SCHEMA_VERSION = 9

export type SubtitleDisplayMode = 'source' | 'translation' | 'bilingual'
export type SubtitleLineHeight = 'compact' | 'normal' | 'relaxed'
```

Add a `subtitles` section to `AppSettings`:

```ts
  subtitles: {
    fontSizePx: number
    lineHeight: SubtitleLineHeight
    displayMode: SubtitleDisplayMode
    targetLanguage: SubtitleLanguageId
  }
```

Add defaults in `createDefaultAppSettings()` between `playback` and `asr`:

```ts
    subtitles: {
      fontSizePx: 14,
      lineHeight: 'normal',
      displayMode: 'source',
      targetLanguage: 'zh'
    },
```

- [ ] **Step 4: Add main-process sanitizer**

In `src/main/app-settings.ts`, import the new types:

```ts
  type SubtitleDisplayMode,
  type SubtitleLineHeight,
```

Add guards near the other guard functions:

```ts
function isSubtitleLineHeight(value: unknown): value is SubtitleLineHeight {
  return value === 'compact' || value === 'normal' || value === 'relaxed'
}

function isSubtitleDisplayMode(value: unknown): value is SubtitleDisplayMode {
  return value === 'source' || value === 'translation' || value === 'bilingual'
}
```

Add the sanitizer after `sanitizePlaybackSettings`:

```ts
function sanitizeSubtitleSettings(
  value: Partial<AppSettings['subtitles']> | undefined,
  defaults: AppSettings['subtitles']
): AppSettings['subtitles'] {
  const subtitles = value ?? {}
  const fontSizePx =
    typeof subtitles.fontSizePx === 'number' && Number.isFinite(subtitles.fontSizePx)
      ? Math.min(28, Math.max(12, Math.round(subtitles.fontSizePx)))
      : defaults.fontSizePx

  return {
    fontSizePx,
    lineHeight: isSubtitleLineHeight(subtitles.lineHeight) ? subtitles.lineHeight : defaults.lineHeight,
    displayMode: isSubtitleDisplayMode(subtitles.displayMode) ? subtitles.displayMode : defaults.displayMode,
    targetLanguage: isSubtitleLanguageId(subtitles.targetLanguage)
      ? subtitles.targetLanguage
      : defaults.targetLanguage
  }
}
```

Add `subtitles?: Partial<AppSettings['subtitles']>` to the local `value` type in `sanitizeAppSettings()`, and include the sanitized section in the returned object:

```ts
    subtitles: sanitizeSubtitleSettings(value.subtitles, defaults.subtitles),
```

For the non-object fallback branch, spread defaults and keep capture override exactly as it already does; the new defaults will carry `subtitles`.

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
npm run test -- tests/unit/app-settings.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add src/shared/app-settings.ts src/main/app-settings.ts tests/unit/app-settings.test.ts
git commit -m "feat: add subtitle display settings"
```

---

### Task 2: I18n Copy And Settings Dialog Controls

**Files:**
- Modify: `src/shared/i18n.ts`
- Modify: `src/renderer/src/app/settings-dialog.tsx`
- Modify: `tests/unit/settings-ui-source.test.ts`

- [ ] **Step 1: Write failing source tests**

In `tests/unit/settings-ui-source.test.ts`, add a test near the other settings structure tests:

```ts
it('routes subtitle display settings through shared settings controls', () => {
  expect(settingsDialogSource).toContain('subtitleLineHeightOptions')
  expect(settingsDialogSource).toContain('subtitleDisplayModeOptions')
  expect(settingsDialogSource).toContain("patchSettingsSection('subtitles', { fontSizePx })")
  expect(settingsDialogSource).toContain("patchSettingsSection('subtitles', { lineHeight })")
  expect(settingsDialogSource).toContain("patchSettingsSection('subtitles', { displayMode })")
  expect(settingsDialogSource).toContain("patchSettingsSection('subtitles', { targetLanguage })")
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run test -- tests/unit/settings-ui-source.test.ts
```

Expected: FAIL because the settings dialog has no subtitle display controls.

- [ ] **Step 3: Extend locale copy types**

In `src/shared/i18n.ts`, add a top-level copy group to `LocaleCopy` near the existing player/control copy groups:

```ts
  subtitleDisplay: {
    menuLabel: string
    fontSize: string
    fontSizeValue: (value: number) => string
    decreaseFontSize: string
    increaseFontSize: string
    lineHeight: string
    displayMode: string
    translationUnavailable: string
    reset: string
    lineHeightOptions: Record<SubtitleLineHeight, string>
    displayModeOptions: Record<SubtitleDisplayMode, string>
  }
```

Update imports at the top of `src/shared/i18n.ts`:

```ts
import type { SubtitleDisplayMode, SubtitleLineHeight } from './app-settings'
```

Extend `settingsDialog.subtitles` in the `LocaleCopy` type:

```ts
      displayHeading: string
      fontSize: string
      fontSizeDescription: string
      lineHeight: string
      lineHeightDescription: string
      displayMode: string
      displayModeDescription: string
      targetLanguage: string
      targetLanguageDescription: string
```

- [ ] **Step 4: Add locale values**

Add `subtitleDisplay` in each locale object. Use these values:

```ts
subtitleDisplay: {
  menuLabel: '字幕显示设置',
  fontSize: '字号',
  fontSizeValue: (value) => `${value}px`,
  decreaseFontSize: '减小字幕字号',
  increaseFontSize: '增大字幕字号',
  lineHeight: '行高',
  displayMode: '显示模式',
  translationUnavailable: '译文模式会在翻译字幕生成后可用。',
  reset: '恢复默认',
  lineHeightOptions: {
    compact: '紧凑',
    normal: '标准',
    relaxed: '宽松'
  },
  displayModeOptions: {
    source: '原文',
    translation: '译文',
    bilingual: '双语'
  }
}
```

Use these English values:

```ts
subtitleDisplay: {
  menuLabel: 'Subtitle display settings',
  fontSize: 'Font size',
  fontSizeValue: (value) => `${value}px`,
  decreaseFontSize: 'Decrease subtitle font size',
  increaseFontSize: 'Increase subtitle font size',
  lineHeight: 'Line height',
  displayMode: 'Display mode',
  translationUnavailable: 'Translated modes become available after translated subtitles are generated.',
  reset: 'Reset defaults',
  lineHeightOptions: {
    compact: 'Compact',
    normal: 'Normal',
    relaxed: 'Relaxed'
  },
  displayModeOptions: {
    source: 'Source',
    translation: 'Translation',
    bilingual: 'Bilingual'
  }
}
```

Use direct Japanese and Korean equivalents for the same keys:

```ts
subtitleDisplay: {
  menuLabel: '字幕表示設定',
  fontSize: 'フォントサイズ',
  fontSizeValue: (value) => `${value}px`,
  decreaseFontSize: '字幕サイズを小さくする',
  increaseFontSize: '字幕サイズを大きくする',
  lineHeight: '行間',
  displayMode: '表示モード',
  translationUnavailable: '翻訳字幕の生成後に翻訳モードを使用できます。',
  reset: '既定に戻す',
  lineHeightOptions: {
    compact: 'コンパクト',
    normal: '標準',
    relaxed: '広め'
  },
  displayModeOptions: {
    source: '原文',
    translation: '翻訳',
    bilingual: '二言語'
  }
}
```

```ts
subtitleDisplay: {
  menuLabel: '자막 표시 설정',
  fontSize: '글자 크기',
  fontSizeValue: (value) => `${value}px`,
  decreaseFontSize: '자막 글자 크기 줄이기',
  increaseFontSize: '자막 글자 크기 키우기',
  lineHeight: '줄 높이',
  displayMode: '표시 모드',
  translationUnavailable: '번역 자막을 생성한 뒤 번역 모드를 사용할 수 있습니다.',
  reset: '기본값으로',
  lineHeightOptions: {
    compact: '촘촘하게',
    normal: '표준',
    relaxed: '넓게'
  },
  displayModeOptions: {
    source: '원문',
    translation: '번역',
    bilingual: '이중 언어'
  }
}
```

Extend each locale's `settingsDialog.subtitles` with matching labels. Chinese:

```ts
displayHeading: '字幕显示',
fontSize: '字幕字号',
fontSizeDescription: '控制播放器字幕栏中文本的默认大小。',
lineHeight: '字幕行高',
lineHeightDescription: '控制多行字幕之间的垂直间距。',
displayMode: '默认显示模式',
displayModeDescription: '翻译功能上线后可在原文、译文和双语之间切换。',
targetLanguage: '目标翻译语言',
targetLanguageDescription: '翻译字幕默认输出到这个语言。'
```

English:

```ts
displayHeading: 'Subtitle display',
fontSize: 'Subtitle font size',
fontSizeDescription: 'Controls the default text size in the subtitle bar.',
lineHeight: 'Subtitle line height',
lineHeightDescription: 'Controls vertical spacing for multiline subtitles.',
displayMode: 'Default display mode',
displayModeDescription: 'Switch between source, translation, and bilingual modes when translation is available.',
targetLanguage: 'Target translation language',
targetLanguageDescription: 'Translated subtitles will default to this language.'
```

Japanese:

```ts
displayHeading: '字幕表示',
fontSize: '字幕フォントサイズ',
fontSizeDescription: '字幕バーに表示する文字サイズの既定値を設定します。',
lineHeight: '字幕の行間',
lineHeightDescription: '複数行字幕の縦方向の間隔を設定します。',
displayMode: '既定の表示モード',
displayModeDescription: '翻訳が利用可能になったら、原文、翻訳、二言語を切り替えます。',
targetLanguage: '翻訳先言語',
targetLanguageDescription: '翻訳字幕の既定の出力言語です。'
```

Korean:

```ts
displayHeading: '자막 표시',
fontSize: '자막 글자 크기',
fontSizeDescription: '자막 바에 표시되는 기본 글자 크기를 조정합니다.',
lineHeight: '자막 줄 높이',
lineHeightDescription: '여러 줄 자막의 세로 간격을 조정합니다.',
displayMode: '기본 표시 모드',
displayModeDescription: '번역을 사용할 수 있을 때 원문, 번역, 이중 언어 모드를 전환합니다.',
targetLanguage: '번역 대상 언어',
targetLanguageDescription: '번역 자막의 기본 출력 언어입니다.'
```

- [ ] **Step 5: Add settings dialog option lists and fields**

In `src/renderer/src/app/settings-dialog.tsx`, import the setting types:

```ts
  type SubtitleDisplayMode,
  type SubtitleLineHeight
```

Create options after `subtitleLanguageOptions`:

```ts
  const subtitleLineHeightOptions: Array<SettingsSelectOption<SubtitleLineHeight>> = Object.entries(
    copy.subtitleDisplay.lineHeightOptions
  ).map(([lineHeight, label]) => ({
    value: lineHeight as SubtitleLineHeight,
    label
  }))

  const subtitleDisplayModeOptions: Array<SettingsSelectOption<SubtitleDisplayMode>> = Object.entries(
    copy.subtitleDisplay.displayModeOptions
  ).map(([displayMode, label]) => ({
    value: displayMode as SubtitleDisplayMode,
    label
  }))
```

In the subtitles settings section, immediately after the card heading, add:

```tsx
            <div className="settings-note-box">
              <span className="settings-note-title">{copy.settingsDialog.subtitles.displayHeading}</span>
              <p>{copy.settingsDialog.subtitles.fontSizeDescription}</p>
            </div>

            <SettingsField
              title={copy.settingsDialog.subtitles.fontSize}
              description={copy.settingsDialog.subtitles.fontSizeDescription}
            >
              <div className="settings-inline-row">
                <SettingsNumberInput
                  min={12}
                  max={28}
                  value={settings.subtitles.fontSizePx}
                  compact
                  ariaLabel={copy.settingsDialog.subtitles.fontSize}
                  onChange={(fontSizePx) => {
                    patchSettingsSection('subtitles', { fontSizePx })
                  }}
                />
                <span className="settings-inline-unit">px</span>
              </div>
            </SettingsField>

            <SettingsField
              title={copy.settingsDialog.subtitles.lineHeight}
              description={copy.settingsDialog.subtitles.lineHeightDescription}
            >
              <SettingsSelect
                value={settings.subtitles.lineHeight}
                options={subtitleLineHeightOptions}
                onChange={(lineHeight) => {
                  patchSettingsSection('subtitles', { lineHeight })
                }}
              />
            </SettingsField>

            <SettingsField
              title={copy.settingsDialog.subtitles.displayMode}
              description={copy.settingsDialog.subtitles.displayModeDescription}
            >
              <SettingsSelect
                value={settings.subtitles.displayMode}
                options={subtitleDisplayModeOptions}
                onChange={(displayMode) => {
                  patchSettingsSection('subtitles', { displayMode })
                }}
              />
            </SettingsField>

            <SettingsField
              title={copy.settingsDialog.subtitles.targetLanguage}
              description={copy.settingsDialog.subtitles.targetLanguageDescription}
            >
              <SettingsSelect
                value={settings.subtitles.targetLanguage}
                options={subtitleLanguageOptions}
                onChange={(targetLanguage) => {
                  patchSettingsSection('subtitles', { targetLanguage })
                }}
              />
            </SettingsField>
```

Keep the existing ASR fields below these display fields.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm run test -- tests/unit/settings-ui-source.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add src/shared/i18n.ts src/renderer/src/app/settings-dialog.tsx tests/unit/settings-ui-source.test.ts
git commit -m "feat: add subtitle display controls to settings"
```

---

### Task 3: Subtitle Overlay Quick Controls

**Files:**
- Create: `src/renderer/src/app/subtitle-display-controls.tsx`
- Modify: `src/renderer/src/subtitle-overlay.tsx`
- Modify: `src/renderer/src/app/App.tsx`
- Modify: `src/renderer/src/styles/player.css`
- Test: `tests/unit/subtitle-display-source.test.ts`

- [ ] **Step 1: Write failing source constraints**

Create `tests/unit/subtitle-display-source.test.ts`:

```ts
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

    expect(playerCss).toMatch(/\\.subtitle-text\\s*\\{[^}]*font-size:\\s*var\\(--subtitle-font-size\\);/s)
    expect(playerCss).toMatch(/\\.subtitle-text\\s*\\{[^}]*line-height:\\s*var\\(--subtitle-line-height\\);/s)
    expect(playerCss).not.toMatch(/\\.subtitle-text\\s*\\{[^}]*font-size:\\s*14px;/s)
  })

  it('keeps the quick subtitle controls out of normal document flow', () => {
    const playerCss = readSource('src/renderer/src/styles/player.css')

    expect(playerCss).toContain('.subtitle-display-controls-menu')
    expect(playerCss).toMatch(/\\.subtitle-display-controls-menu\\s*\\{[^}]*position:\\s*absolute;/s)
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run test -- tests/unit/subtitle-display-source.test.ts
```

Expected: FAIL because the overlay does not yet consume subtitle display settings.

- [ ] **Step 3: Create quick controls component**

Create `src/renderer/src/app/subtitle-display-controls.tsx`:

```tsx
import { ChevronDown, Minus, Plus, RotateCcw } from 'lucide-react'
import type { ReactElement } from 'react'
import {
  createDefaultAppSettings,
  type AppSettings,
  type SubtitleDisplayMode,
  type SubtitleLineHeight
} from '../../../shared/app-settings'
import type { LocaleCopy } from '../../../shared/i18n'

type SubtitleDisplaySettings = AppSettings['subtitles']

type SubtitleDisplayControlsProps = {
  copy: LocaleCopy
  settings: SubtitleDisplaySettings
  hasTranslation: boolean
  onChange: (patch: Partial<SubtitleDisplaySettings>) => void
  onReset: () => void
}

const minSubtitleFontSize = 12
const maxSubtitleFontSize = 28

const subtitleLineHeightValues: SubtitleLineHeight[] = ['compact', 'normal', 'relaxed']
const subtitleDisplayModeValues: SubtitleDisplayMode[] = ['source', 'translation', 'bilingual']

function clampSubtitleFontSize(value: number): number {
  return Math.min(maxSubtitleFontSize, Math.max(minSubtitleFontSize, Math.round(value)))
}

export function SubtitleDisplayControls({
  copy,
  settings,
  hasTranslation,
  onChange,
  onReset
}: SubtitleDisplayControlsProps): ReactElement {
  const canDecrease = settings.fontSizePx > minSubtitleFontSize
  const canIncrease = settings.fontSizePx < maxSubtitleFontSize

  return (
    <details className="subtitle-display-controls">
      <summary
        className="subtitle-display-trigger"
        title={copy.subtitleDisplay.menuLabel}
        aria-label={copy.subtitleDisplay.menuLabel}
      >
        <ChevronDown size={14} />
      </summary>
      <div className="subtitle-display-controls-menu" role="menu" aria-label={copy.subtitleDisplay.menuLabel}>
        <div className="subtitle-display-control-row">
          <span>{copy.subtitleDisplay.fontSize}</span>
          <div className="subtitle-display-stepper">
            <button
              type="button"
              onClick={() => onChange({ fontSizePx: clampSubtitleFontSize(settings.fontSizePx - 1) })}
              disabled={!canDecrease}
              aria-label={copy.subtitleDisplay.decreaseFontSize}
            >
              <Minus size={13} />
            </button>
            <strong>{copy.subtitleDisplay.fontSizeValue(settings.fontSizePx)}</strong>
            <button
              type="button"
              onClick={() => onChange({ fontSizePx: clampSubtitleFontSize(settings.fontSizePx + 1) })}
              disabled={!canIncrease}
              aria-label={copy.subtitleDisplay.increaseFontSize}
            >
              <Plus size={13} />
            </button>
          </div>
        </div>

        <label className="subtitle-display-control-row">
          <span>{copy.subtitleDisplay.lineHeight}</span>
          <select
            value={settings.lineHeight}
            onChange={(event) => onChange({ lineHeight: event.currentTarget.value as SubtitleLineHeight })}
          >
            {subtitleLineHeightValues.map((lineHeight) => (
              <option key={lineHeight} value={lineHeight}>
                {copy.subtitleDisplay.lineHeightOptions[lineHeight]}
              </option>
            ))}
          </select>
        </label>

        <label className="subtitle-display-control-row">
          <span>{copy.subtitleDisplay.displayMode}</span>
          <select
            value={settings.displayMode}
            onChange={(event) => onChange({ displayMode: event.currentTarget.value as SubtitleDisplayMode })}
          >
            {subtitleDisplayModeValues.map((displayMode) => (
              <option
                key={displayMode}
                value={displayMode}
                disabled={!hasTranslation && displayMode !== 'source'}
              >
                {copy.subtitleDisplay.displayModeOptions[displayMode]}
              </option>
            ))}
          </select>
        </label>

        {!hasTranslation && settings.displayMode !== 'source' ? (
          <p className="subtitle-display-hint">{copy.subtitleDisplay.translationUnavailable}</p>
        ) : null}

        <button className="subtitle-display-reset" type="button" onClick={onReset}>
          <RotateCcw size={13} />
          {copy.subtitleDisplay.reset}
        </button>
      </div>
    </details>
  )
}

export function getDefaultSubtitleDisplaySettings(): SubtitleDisplaySettings {
  return createDefaultAppSettings().subtitles
}
```

- [ ] **Step 4: Wire settings into `SubtitleOverlay`**

Modify `src/renderer/src/subtitle-overlay.tsx`:

```tsx
import type { CSSProperties, ReactElement } from 'react'
import type { AppSettings } from '../../shared/app-settings'
import type { LocaleCopy } from '../../shared/i18n'
import { SubtitleDisplayControls, getDefaultSubtitleDisplaySettings } from './app/subtitle-display-controls'
```

Update props:

```ts
type SubtitleOverlayProps = {
  subtitlePath: string | null
  currentTime: number
  settings: AppSettings['subtitles']
  copy: LocaleCopy
  onSettingsChange: (patch: Partial<AppSettings['subtitles']>) => void
  onResetSettings: () => void
}
```

Add line-height mapping:

```ts
const subtitleLineHeightMap: Record<AppSettings['subtitles']['lineHeight'], number> = {
  compact: 1.25,
  normal: 1.5,
  relaxed: 1.75
}
```

Update the component signature:

```tsx
export function SubtitleOverlay({
  subtitlePath,
  currentTime,
  settings,
  copy,
  onSettingsChange,
  onResetSettings
}: SubtitleOverlayProps): ReactElement {
```

Before the return, add:

```tsx
  const displaySettings = settings ?? getDefaultSubtitleDisplaySettings()
  const subtitleStyle = {
    '--subtitle-font-size': `${displaySettings.fontSizePx}px`,
    '--subtitle-line-height': String(subtitleLineHeightMap[displaySettings.lineHeight])
  } as CSSProperties
```

Replace the non-empty return:

```tsx
  return (
    <div className="subtitle-overlay" style={subtitleStyle}>
      <div className="subtitle-text">{activeCue?.text ?? '\u00A0'}</div>
      <SubtitleDisplayControls
        copy={copy}
        settings={displaySettings}
        hasTranslation={false}
        onChange={onSettingsChange}
        onReset={onResetSettings}
      />
    </div>
  )
```

- [ ] **Step 5: Wire `App.tsx` callbacks**

In `src/renderer/src/app/App.tsx`, update the overlay render:

```tsx
          <SubtitleOverlay
            subtitlePath={activeSubtitle?.subtitlePath ?? null}
            currentTime={state.currentTime}
            settings={appSettings.subtitles}
            copy={copy}
            onSettingsChange={(patch) => {
              patchAppSettingsSection('subtitles', patch)
            }}
            onResetSettings={() => {
              patchAppSettingsSection('subtitles', createDefaultAppSettings().subtitles)
            }}
          />
```

- [ ] **Step 6: Add overlay and popover styles**

In `src/renderer/src/styles/player.css`, replace `.subtitle-overlay` and `.subtitle-text` rules with:

```css
.subtitle-overlay {
  --subtitle-font-size: 14px;
  --subtitle-line-height: 1.5;
  display: grid;
  grid-template-columns: minmax(32px, 1fr) minmax(0, auto) minmax(32px, 1fr);
  align-items: center;
  min-height: 36px;
  padding: 8px 12px 8px 16px;
  background: var(--bg-surface, #1a1a1a);
  border-top: 1px solid var(--border-soft, #333);
  color: var(--text-primary, #fff);
}

.subtitle-text {
  grid-column: 2;
  min-width: 0;
  color: var(--text-primary);
  font-size: var(--subtitle-font-size);
  line-height: var(--subtitle-line-height);
  text-align: center;
  white-space: pre-wrap;
  word-break: break-word;
}
```

Add quick-control styles near existing `.subtitle-actions` styles:

```css
.subtitle-display-controls {
  position: relative;
  grid-column: 3;
  justify-self: end;
  min-width: 0;
}

.subtitle-display-controls > summary {
  list-style: none;
}

.subtitle-display-controls > summary::-webkit-details-marker {
  display: none;
}

.subtitle-display-trigger {
  display: inline-grid;
  width: 28px;
  height: 28px;
  place-items: center;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.subtitle-display-trigger:hover,
.subtitle-display-controls[open] .subtitle-display-trigger {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}

.subtitle-display-controls-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  display: grid;
  gap: 10px;
  width: min(260px, calc(100vw - 48px));
  padding: 12px;
  background: rgba(18, 20, 23, 0.96);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-heavy);
  z-index: 8;
}

.subtitle-display-control-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.subtitle-display-control-row select {
  height: 30px;
  min-width: 112px;
  padding: 0 8px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
}

.subtitle-display-stepper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.subtitle-display-stepper button,
.subtitle-display-reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.subtitle-display-stepper button {
  width: 28px;
  padding: 0;
}

.subtitle-display-stepper button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.subtitle-display-stepper strong {
  min-width: 42px;
  color: var(--text-primary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.subtitle-display-reset {
  gap: 6px;
  width: 100%;
  padding: 0 10px;
}

.subtitle-display-stepper button:not(:disabled):hover,
.subtitle-display-reset:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.1);
}

.subtitle-display-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
}
```

- [ ] **Step 7: Close quick controls on Escape and outside click**

In `App.tsx`, add a ref:

```ts
  const subtitleDisplayControlsRef = useRef<HTMLDetailsElement | null>(null)
```

Pass it into `SubtitleOverlay` by extending overlay props with `controlsRef?: RefObject<HTMLDetailsElement | null>`, and attach it to the `<details>` inside `SubtitleDisplayControls`.

Update the existing Escape handler in `App.tsx` before `subtitleActionsRef`:

```ts
        const subtitleDisplayControls = subtitleDisplayControlsRef.current
        if (subtitleDisplayControls?.open) {
          subtitleDisplayControls.open = false
          return
        }
```

Add outside click handling near the existing subtitle actions outside-click effect:

```ts
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      const controls = subtitleDisplayControlsRef.current
      if (!controls?.open) {
        return
      }

      if (event.target instanceof Node && controls.contains(event.target)) {
        return
      }

      controls.open = false
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
npm run test -- tests/unit/subtitle-display-source.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add src/renderer/src/app/subtitle-display-controls.tsx src/renderer/src/subtitle-overlay.tsx src/renderer/src/app/App.tsx src/renderer/src/styles/player.css tests/unit/subtitle-display-source.test.ts
git commit -m "feat: add subtitle display quick controls"
```

---

### Task 4: Smoke Script And Package Wiring

**Files:**
- Create: `scripts/smoke-subtitle-settings.ts`
- Modify: `package.json`
- Modify: `tests/unit/dialog-smoke-source.test.ts`

- [ ] **Step 1: Write failing smoke source test**

In `tests/unit/dialog-smoke-source.test.ts`, update the package scripts test:

```ts
    expect(packageJson.scripts?.['smoke:subtitle-settings']).toBe(
      'node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/smoke-subtitle-settings.ts'
    )
    expect(packageJson.scripts?.['smoke:all']).toBe(
      'npm run smoke:settings-dialog:all && npm run smoke:dialogs:all && npm run smoke:subtitle-settings && npm run smoke:open-video'
    )
```

Add a new source selector test:

```ts
  it('uses stable selectors in the subtitle settings smoke script', () => {
    const smokeScript = readSource('scripts/smoke-subtitle-settings.ts')

    expect(smokeScript).toContain("aivplayer-smoke-subtitle-settings-home-")
    expect(smokeScript).toContain("page.locator('[data-settings-tab=\"subtitles\"]').click()")
    expect(smokeScript).toContain("document.querySelector('.settings-dialog')")
    expect(smokeScript).toContain("window.aiv.setAppSettings")
    expect(smokeScript).toContain("page.screenshot({ path: screenshotPath, fullPage: false })")
  })
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run test -- tests/unit/dialog-smoke-source.test.ts
```

Expected: FAIL because the smoke script and package entry do not exist.

- [ ] **Step 3: Add smoke script**

Create `scripts/smoke-subtitle-settings.ts`:

```ts
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { getAppCopy } from '../src/shared/i18n.ts'

async function main(): Promise<void> {
  const smokeHomeDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-smoke-subtitle-settings-home-'))

  const app = await electron.launch({
    args: ['out/main/index.js'],
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

    const initialSettings = await page.evaluate(() => window.aiv.getAppSettings())
    const copy = getAppCopy(initialSettings.ui.locale)

    await page.evaluate(async () => {
      const current = await window.aiv.getAppSettings()

      await window.aiv.setAppSettings({
        ...current,
        subtitles: {
          ...current.subtitles,
          fontSizePx: 21,
          lineHeight: 'relaxed',
          displayMode: 'source',
          targetLanguage: 'zh'
        }
      })
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#root', { timeout: 10_000 })
    await page.waitForTimeout(1_000)

    const persistedSettings = await page.evaluate(() => window.aiv.getAppSettings())

    await page.getByRole('button', { name: copy.topbar.openSettings }).click()
    await page.waitForSelector('.settings-dialog', { timeout: 10_000 })
    await page.locator('[data-settings-tab="subtitles"]').click()
    await page.waitForTimeout(500)

    const dialogState = await page.evaluate(() => {
      const dialog = document.querySelector('.settings-dialog')
      const inputs = Array.from(document.querySelectorAll('.settings-number')) as HTMLInputElement[]
      const selects = Array.from(document.querySelectorAll('.settings-select')) as HTMLSelectElement[]

      return {
        hasDialog: Boolean(dialog),
        numberValues: inputs.map((input) => input.value),
        selectValues: selects.map((select) => select.value)
      }
    })

    const screenshotPath = join(smokeHomeDirectory, 'aivplayer-smoke-subtitle-settings.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })

    console.log(`Subtitle settings: ${JSON.stringify(persistedSettings.subtitles)}`)
    console.log(`Subtitle dialog state: ${JSON.stringify(dialogState)}`)
    console.log(`Subtitle settings screenshot: ${screenshotPath}`)

    if (persistedSettings.subtitles.fontSizePx !== 21) {
      process.exitCode = 1
    }

    if (persistedSettings.subtitles.lineHeight !== 'relaxed') {
      process.exitCode = 1
    }

    if (!dialogState.hasDialog || !dialogState.numberValues.includes('21')) {
      process.exitCode = 1
    }

    if (!dialogState.selectValues.includes('relaxed') || !dialogState.selectValues.includes('source')) {
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
```

- [ ] **Step 4: Wire package scripts**

In `package.json`, add:

```json
"smoke:subtitle-settings": "node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/smoke-subtitle-settings.ts"
```

Update `smoke:all`:

```json
"smoke:all": "npm run smoke:settings-dialog:all && npm run smoke:dialogs:all && npm run smoke:subtitle-settings && npm run smoke:open-video"
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -- tests/unit/dialog-smoke-source.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add scripts/smoke-subtitle-settings.ts package.json tests/unit/dialog-smoke-source.test.ts
git commit -m "test: add subtitle settings smoke coverage"
```

---

### Task 5: Feature Documentation And Final Verification

**Files:**
- Modify: `FEATURE.md`

- [ ] **Step 1: Update feature documentation**

In `FEATURE.md`, under `## 本地 ASR 字幕`, add:

```md
- 字幕栏支持便捷调整字号，播放时可以直接放大或缩小当前字幕文本。
- 字幕显示偏好会保存到本地设置，重新打开应用后继续沿用最近一次的字幕字号和行高。
- 设置面板的字幕分组新增显示设置，为后续原文、译文、双语字幕切换预留入口。
```

- [ ] **Step 2: Run full automated verification**

Run:

```bash
npm run test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run focused smoke after build**

Run:

```bash
npm run build
npm run smoke:subtitle-settings
```

Expected: PASS and console output includes `Subtitle settings`.

- [ ] **Step 4: Inspect git diff and scan for secrets**

Run:

```bash
git diff --check
rg -n "apikey|api_key|secret|password|token|AKIA|sk-[A-Za-z0-9]|BEGIN (RSA|OPENSSH|PRIVATE) KEY" src tests scripts package.json FEATURE.md
```

Expected: `git diff --check` exits 0. The `rg` command exits 1 with no matches.

- [ ] **Step 5: Commit Task 5**

Run:

```bash
git add FEATURE.md
git commit -m "docs: document subtitle display settings"
```

- [ ] **Step 6: Summarize final status**

Report:

```md
Implemented subtitle display settings:
- Persistent `AppSettings.subtitles`
- Settings dialog controls
- Subtitle bar quick controls
- CSS variable driven subtitle text sizing
- Unit/source tests and subtitle settings smoke script

Verification:
- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run smoke:subtitle-settings`
```

## Plan Self-Review

- Spec coverage: This plan implements the first-phase display settings, persistence, quick controls, settings dialog controls, docs, and verification. Translation provider work remains outside this implementation plan by design.
- Placeholder scan: This plan contains concrete paths, commands, snippets, and expected outcomes for each task.
- Type consistency: `SubtitleDisplayMode`, `SubtitleLineHeight`, and `AppSettings['subtitles']` are introduced in Task 1 and reused consistently in later tasks.
