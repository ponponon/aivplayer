import { ChevronDown, Minus, Plus, RotateCcw } from 'lucide-react'
import type { ReactElement, RefObject } from 'react'
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
  controlsRef?: RefObject<HTMLDetailsElement | null>
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
  controlsRef,
  onChange,
  onReset
}: SubtitleDisplayControlsProps): ReactElement {
  const canDecrease = settings.fontSizePx > minSubtitleFontSize
  const canIncrease = settings.fontSizePx < maxSubtitleFontSize
  const effectiveDisplayMode = !hasTranslation && settings.displayMode !== 'source' ? 'source' : settings.displayMode

  return (
    <details ref={controlsRef} className="subtitle-display-controls">
      <summary
        className="subtitle-display-trigger"
        title={copy.subtitleDisplay.menuLabel}
        aria-label={copy.subtitleDisplay.menuLabel}
      >
        <ChevronDown size={14} />
      </summary>
      <div className="subtitle-display-controls-menu" aria-label={copy.subtitleDisplay.menuLabel}>
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
            value={effectiveDisplayMode}
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
