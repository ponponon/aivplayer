import type { ReactElement } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { SettingsTab, SettingsTabId } from './settings-dialog-model'

export type SettingsTabsProps = {
  copy: LocaleCopy
  tabs: SettingsTab[]
  activeSectionId: SettingsTabId
  onSelect: (sectionId: SettingsTabId) => void
}

export function SettingsTabs({ copy, tabs, activeSectionId, onSelect }: SettingsTabsProps): ReactElement {
  return (
    <nav className="settings-switcher" role="tablist" aria-label={copy.settingsDialog.title}>
      {tabs.map(({ id, label, ariaLabel, icon: Icon }) => {
        const isActive = activeSectionId === id
        return (
          <button
            className={`settings-tab ${isActive ? 'active' : ''}`}
            id={`settings-tab-${id}`}
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`settings-section-${id}`}
            aria-label={ariaLabel}
            data-settings-tab={id}
            onClick={() => onSelect(id)}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
