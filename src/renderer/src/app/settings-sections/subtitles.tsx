import { Captions, RefreshCcw, Trash2 } from 'lucide-react'
import type { ReactElement } from 'react'
import { SettingsField, SettingsSelect, SettingsToggle } from '../settings-controls'
import { SettingsNumberInput } from '../settings-inputs'
import { formatBytes } from '../app-helpers'
import { clampSubtitleFontSize } from '../subtitle-display-settings'
import { TranslationServiceSettings } from '../translation-service-settings'
import type { SettingsSectionProps } from '../settings-section-types'

export function SubtitlesSettingsSection(props: SettingsSectionProps): ReactElement {
  const { copy, settings, patchSettingsSection, activeSectionId, subtitleLanguageOptions, targetLanguageOptions,
    aiAutomationModeOptions, subtitleLineHeightOptions, subtitleDisplayModeOptions, modelSourceOptions, cacheStats,
    cacheStatus, isLoadingCacheStats, isClearingCache, onRefreshCacheStats, onClearStaleCache } = props

  return (
    <section
      className={`settings-card settings-card-anchor ${activeSectionId === 'subtitles' ? '' : 'is-hidden'}`}
      id="settings-section-subtitles"
      role="tabpanel"
      aria-labelledby="settings-tab-subtitles"
      aria-hidden={activeSectionId !== 'subtitles'}
    >
      <div className="settings-card-heading">
        <Captions size={16} />
        <span>{copy.settingsDialog.subtitles.title}</span>
      </div>
      <div className="settings-note-box">
        <span className="settings-note-title">{copy.settingsDialog.subtitles.displayHeading}</span>
        <p>{copy.settingsDialog.subtitles.fontSizeDescription}</p>
      </div>
      <SettingsField title={copy.settingsDialog.subtitles.fontSize} description={copy.settingsDialog.subtitles.fontSizeDescription}>
        <div className="settings-inline-row">
          <SettingsNumberInput
            min={12}
            max={28}
            value={settings.subtitles.fontSizePx}
            compact
            ariaLabel={copy.settingsDialog.subtitles.fontSize}
            onChange={(fontSizePx) => patchSettingsSection('subtitles', { fontSizePx: clampSubtitleFontSize(fontSizePx) })}
          />
          <span className="settings-inline-unit">px</span>
        </div>
      </SettingsField>
      <SettingsField title={copy.settingsDialog.subtitles.lineHeight} description={copy.settingsDialog.subtitles.lineHeightDescription}>
        <SettingsSelect value={settings.subtitles.lineHeight} options={subtitleLineHeightOptions} onChange={(lineHeight) => patchSettingsSection('subtitles', { lineHeight })} />
      </SettingsField>
      <SettingsField title={copy.settingsDialog.subtitles.displayMode} description={copy.settingsDialog.subtitles.displayModeDescription}>
        <SettingsSelect value={settings.subtitles.displayMode} options={subtitleDisplayModeOptions} onChange={(displayMode) => patchSettingsSection('subtitles', { displayMode })} />
      </SettingsField>
      <SettingsField title={copy.settingsDialog.subtitles.targetLanguage} description={copy.settingsDialog.subtitles.targetLanguageDescription}>
        <SettingsSelect value={settings.subtitles.targetLanguage} options={targetLanguageOptions} onChange={(targetLanguage) => patchSettingsSection('subtitles', { targetLanguage })} />
      </SettingsField>
      <SettingsField title={copy.settingsDialog.subtitles.subtitleLanguage} description={copy.settingsDialog.subtitles.subtitleLanguageDescription}>
        <SettingsSelect value={settings.asr.defaultSubtitleLanguage} options={subtitleLanguageOptions} onChange={(defaultSubtitleLanguage) => patchSettingsSection('asr', { defaultSubtitleLanguage })} />
      </SettingsField>
      <SettingsToggle
        title={copy.settingsDialog.subtitles.autoLoadCachedSubtitles}
        description={copy.settingsDialog.subtitles.autoLoadCachedSubtitlesDescription}
        checked={settings.asr.autoLoadCachedSubtitles}
        onChange={(autoLoadCachedSubtitles) => patchSettingsSection('asr', { autoLoadCachedSubtitles })}
      />
      <SettingsField title={copy.settingsDialog.subtitles.aiAutomation} description={copy.settingsDialog.subtitles.aiAutomationDescription}>
        <SettingsSelect value={settings.ai.openMode} options={aiAutomationModeOptions} onChange={(openMode) => patchSettingsSection('ai', { openMode })} />
      </SettingsField>
      <SettingsField title={copy.settingsDialog.subtitles.modelSource} description={copy.settingsDialog.subtitles.modelSourceDescription}>
        <SettingsSelect value={settings.asr.preferredModelSourceId} options={modelSourceOptions} onChange={(preferredModelSourceId) => patchSettingsSection('asr', { preferredModelSourceId })} />
      </SettingsField>
      <div className="settings-field settings-card-wide settings-cache-management">
        <div className="settings-field-copy">
          <strong>{copy.settingsDialog.subtitles.cache.title}</strong>
          <small>{copy.settingsDialog.subtitles.cache.description}</small>
        </div>
        {cacheStats ? (
          <div className="settings-meta-grid">
            <div className="settings-meta-item"><span>{copy.settingsDialog.subtitles.cache.total}</span><strong>{formatBytes(cacheStats.totalBytes)} · {cacheStats.totalFiles}</strong></div>
            <div className="settings-meta-item"><span>{copy.settingsDialog.subtitles.cache.subtitles}</span><strong>{formatBytes(cacheStats.subtitleBytes)} · {cacheStats.subtitleFiles}</strong></div>
            <div className="settings-meta-item"><span>{copy.settingsDialog.subtitles.cache.summaries}</span><strong>{formatBytes(cacheStats.summaryBytes)} · {cacheStats.summaryFiles}</strong></div>
            <div className="settings-meta-item"><span>{copy.settingsDialog.subtitles.cache.indexes}</span><strong>{formatBytes(cacheStats.indexBytes)} · {cacheStats.indexFiles}</strong></div>
          </div>
        ) : (
          <p className="settings-card-note">{isLoadingCacheStats ? copy.settingsDialog.subtitles.cache.loading : copy.settingsDialog.subtitles.cache.unavailable}</p>
        )}
        {cacheStats ? <p className="settings-card-note">{copy.settingsDialog.subtitles.cache.staleIndexes(cacheStats.staleIndexFiles)}</p> : null}
        <div className="settings-inline-row settings-cache-actions">
          <button className="settings-secondary-button" type="button" onClick={onRefreshCacheStats} disabled={isLoadingCacheStats || isClearingCache}>
            <RefreshCcw size={14} />
            {isLoadingCacheStats ? copy.settingsDialog.subtitles.cache.refreshing : copy.settingsDialog.subtitles.cache.refresh}
          </button>
          <button className="settings-secondary-button" type="button" onClick={onClearStaleCache} disabled={isLoadingCacheStats || isClearingCache}>
            <Trash2 size={14} />
            {isClearingCache ? copy.settingsDialog.subtitles.cache.clearing : copy.settingsDialog.subtitles.cache.clearStale}
          </button>
        </div>
        {cacheStatus ? <p className={`settings-card-note settings-cache-status ${cacheStatus.success ? 'is-success' : 'is-error'}`}>{cacheStatus.message}</p> : null}
      </div>
      <TranslationServiceSettings {...props} />
    </section>
  )
}
