import { ChevronDown, Minus, Plus, RotateCcw } from 'lucide-react'
import type { ReactElement, RefObject } from 'react'
import {
  createDefaultAppSettings,
  type AppSettings,
  type SubtitleDisplayMode,
  type SubtitleLineHeight
} from '../../../shared/app-settings'
import type { LocaleCopy } from '../../../shared/i18n'
import { clampSubtitleFontSize, maxSubtitleFontSize, minSubtitleFontSize } from './subtitle-display-settings'

type SubtitleDisplaySettings = AppSettings['subtitles']

type SubtitleDisplayControlsProps = {
  copy: LocaleCopy
  settings: SubtitleDisplaySettings
  hasTranslation: boolean
  controlsRef?: RefObject<HTMLDetailsElement | null>
  onChange: (patch: Partial<SubtitleDisplaySettings>) => void
  onReset: () => void
}

const subtitleLineHeightValues: SubtitleLineHeight[] = ['compact', 'normal', 'relaxed']
const subtitleDisplayModeValues: SubtitleDisplayMode[] = ['source', 'translation', 'bilingual']
const subtitleFontSizePresets = [12, 14, 16, 18] as const

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
  const setFontSize = (fontSizePx: number): void => {
    onChange({ fontSizePx: clampSubtitleFontSize(fontSizePx) })
  }

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
        <div className="subtitle-display-control-row subtitle-display-font-size-row">
          <span>{copy.subtitleDisplay.fontSize}</span>
          <div className="subtitle-display-font-size-controls">
            <div className="subtitle-display-preset-group" role="group" aria-label={copy.subtitleDisplay.fontSize}>
              {subtitleFontSizePresets.map((fontSizePx) => {
                const isActive = settings.fontSizePx === fontSizePx

                return (
                  <button
                    key={fontSizePx}
                    className={`subtitle-display-preset ${isActive ? 'active' : ''}`}
                    type="button"
                    onClick={() => setFontSize(fontSizePx)}
                    aria-label={copy.subtitleDisplay.fontSizeValue(fontSizePx)}
                    aria-pressed={isActive}
                    title={copy.subtitleDisplay.fontSizeValue(fontSizePx)}
                  >
                    {fontSizePx}
                  </button>
                )
              })}
            </div>
            <div className="subtitle-display-stepper">
              <button
                type="button"
                onClick={() => setFontSize(settings.fontSizePx - 1)}
                disabled={!canDecrease}
                aria-label={copy.subtitleDisplay.decreaseFontSize}
              >
                <Minus size={13} />
              </button>
              <strong>{copy.subtitleDisplay.fontSizeValue(settings.fontSizePx)}</strong>
              <button
                type="button"
                onClick={() => setFontSize(settings.fontSizePx + 1)}
                disabled={!canIncrease}
                aria-label={copy.subtitleDisplay.increaseFontSize}
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
        </div>

        <div className="subtitle-display-control-row subtitle-display-choice-row">
          <span>{copy.subtitleDisplay.lineHeight}</span>
          <div className="subtitle-display-choice-group" role="group" aria-label={copy.subtitleDisplay.lineHeight}>
            {subtitleLineHeightValues.map((lineHeight) => {
              const isSelected = settings.lineHeight === lineHeight

              return (
                <button
                  key={lineHeight}
                  className={`subtitle-display-choice ${isSelected ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => onChange({ lineHeight })}
                  aria-pressed={isSelected}
                  title={copy.subtitleDisplay.lineHeightOptions[lineHeight]}
                >
                  {copy.subtitleDisplay.lineHeightOptions[lineHeight]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="subtitle-display-control-row subtitle-display-choice-row">
          <span>{copy.subtitleDisplay.displayMode}</span>
          <div className="subtitle-display-choice-group" role="group" aria-label={copy.subtitleDisplay.displayMode}>
            {subtitleDisplayModeValues.map((displayMode) => {
              const isSelected = effectiveDisplayMode === displayMode
              const isDisabled = !hasTranslation && displayMode !== 'source'

              return (
                <button
                  key={displayMode}
                  className={`subtitle-display-choice ${isSelected ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => {
                    if (!isDisabled) {
                      onChange({ displayMode })
                    }
                  }}
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                  title={
                    isDisabled
                      ? copy.subtitleDisplay.translationUnavailable
                      : copy.subtitleDisplay.displayModeOptions[displayMode]
                  }
                >
                  {copy.subtitleDisplay.displayModeOptions[displayMode]}
                </button>
              )
            })}
          </div>
        </div>

        {!hasTranslation ? (
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
