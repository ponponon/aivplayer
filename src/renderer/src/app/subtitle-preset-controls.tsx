import type { ReactElement } from 'react'
import type { AppLocale } from '../../../shared/localization'
import type { AppSettings } from '../../../shared/app-settings'
import { getSubtitlePresetCopy } from '../../../shared/subtitle-preset-copy'
import { SUBTITLE_PRESET_IDS } from '../../../shared/subtitle-presets'

type SubtitlePresetControlsProps = {
  locale: AppLocale
  settings: AppSettings['subtitles']
  onChange: (patch: Partial<AppSettings['subtitles']>) => void
}

export function SubtitlePresetControls({ locale, settings, onChange }: SubtitlePresetControlsProps): ReactElement {
  const copy = getSubtitlePresetCopy(locale)
  return (
    <>
      <div className="subtitle-display-control-row subtitle-display-preset-row">
        <span>{copy.preset}</span>
        <div className="subtitle-display-choice-group" role="group" aria-label={copy.preset}>
          {SUBTITLE_PRESET_IDS.map((presetId) => (
            <button key={presetId} className={`subtitle-display-choice ${settings.presetId === presetId ? 'is-selected' : ''}`} type="button" onClick={() => onChange({ presetId })} aria-pressed={settings.presetId === presetId} title={copy.presetNames[presetId]}>{copy.presetNames[presetId]}</button>
          ))}
        </div>
      </div>
      <div className="subtitle-display-control-row subtitle-display-preset-row">
        <span>{copy.emphasis}</span>
        <div className="subtitle-display-choice-group" role="group" aria-label={copy.emphasis}>
          {(['none', 'keywords', 'words'] as const).map((emphasisMode) => (
            <button key={emphasisMode} className={`subtitle-display-choice ${settings.emphasisMode === emphasisMode ? 'is-selected' : ''}`} type="button" onClick={() => onChange({ emphasisMode })} aria-pressed={settings.emphasisMode === emphasisMode}>{copy.emphasisOptions[emphasisMode]}</button>
          ))}
        </div>
      </div>
      {settings.emphasisMode === 'keywords' ? <label className="subtitle-display-keywords"><span>{copy.keywords}</span><textarea rows={2} value={settings.keywords} placeholder={copy.keywordsPlaceholder} onChange={(event) => onChange({ keywords: event.currentTarget.value })} /></label> : null}
    </>
  )
}
