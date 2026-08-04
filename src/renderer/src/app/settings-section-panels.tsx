import type { ReactElement } from 'react'
import type { AppUpdateState } from '../../../shared/app-update-types'
import type { LocaleCopy } from '../../../shared/i18n'
import { AboutSettingsSection } from './settings-sections/about'
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
        if (id === 'about') {
          return <AboutSettingsSection key={id} copy={copy} activeSectionId={activeSectionId} updateState={updateState} onCheckForUpdate={onCheckForUpdate} onInstallUpdate={onInstallUpdate} />
        }
        const Section = sectionComponents[id]
        return <Section key={id} {...sectionProps} />
      })}
    </div>
  )
}
