import type { ReactElement } from 'react'
import type { AppUpdateState } from '../../../shared/app-update-types'
import type { LocaleCopy } from '../../../shared/i18n'
import { AboutSettingsSection } from './settings-sections/about'
import { AiServiceSettingsSection } from './settings-sections/ai-service'
import { CaptureSettingsSection } from './settings-sections/capture'
import { GeneralSettingsSection } from './settings-sections/general'
import { InterfaceSettingsSection } from './settings-sections/interface'
import { ShortcutsSettingsSection } from './settings-sections/shortcuts'
import { SubtitlesSettingsSection } from './settings-sections/subtitles'
import { VideoSettingsSection } from './settings-sections/video'
import type { SettingsTab, SettingsTabId } from './settings-dialog-model'
import type { SettingsSectionProps } from './settings-section-types'

export type SettingsSectionPanelsProps = {
  copy: LocaleCopy
  tabs: SettingsTab[]
  sectionProps: SettingsSectionProps
  activeSectionId: SettingsTabId
  updateState: AppUpdateState
  onCheckForUpdate: () => void
  onInstallUpdate: () => void
}

const sectionComponents: Record<Exclude<SettingsTabId, 'about'>, (props: SettingsSectionProps) => ReactElement> = {
  general: GeneralSettingsSection,
  ai: AiServiceSettingsSection,
  interface: InterfaceSettingsSection,
  video: VideoSettingsSection,
  subtitles: SubtitlesSettingsSection,
  capture: CaptureSettingsSection,
  shortcuts: ShortcutsSettingsSection
}

export function SettingsSectionPanels({ tabs, sectionProps, activeSectionId, updateState, copy, onCheckForUpdate, onInstallUpdate }: SettingsSectionPanelsProps): ReactElement {
  return (
    <div className="settings-grid">
      {tabs.map(({ id }) => {
        const isActive = activeSectionId === id
        const sectionClassName = `settings-section-panel ${isActive ? '' : 'is-hidden'}`
        let section: ReactElement

        if (id === 'about') {
          section = <AboutSettingsSection copy={copy} activeSectionId={activeSectionId} updateState={updateState} onCheckForUpdate={onCheckForUpdate} onInstallUpdate={onInstallUpdate} />
        } else {
          const Section = sectionComponents[id]
          section = <Section {...sectionProps} />
        }

        return (
          <div
            className={sectionClassName}
            data-settings-section={id}
            key={id}
            aria-hidden={!isActive}
            id={id === 'ai' ? `settings-section-${id}` : undefined}
            role={id === 'ai' ? 'tabpanel' : undefined}
            aria-labelledby={id === 'ai' ? `settings-tab-${id}` : undefined}
          >
            {section}
          </div>
        )
      })}
    </div>
  )
}
