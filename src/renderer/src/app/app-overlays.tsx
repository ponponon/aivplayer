import { useEffect } from 'react'
import { ClipExportDialog } from './clip-export-dialog'
import { AiSetupDialog } from './ai-setup-dialog'
import { DownloadModelDialog } from './download-model-dialog'
import { MediaDetailsDialog } from './media-details-dialog'
import { SettingsDialog } from './settings-dialog'
import { useAppContext } from './app-context'

export function AppOverlays(): React.ReactElement {
  const app = useAppContext()
  useEffect(() => {
    if (app.isDownloadDialogOpen) app.downloadDialogRef.current?.focus()
  }, [app.isDownloadDialogOpen])
  return <>{app.isSettingsDialogOpen ? <SettingsDialog copy={app.copy} settings={app.appSettings} asrStatus={app.asrStatus} runtimeSetupMessage={app.runtimeSetupMessage} translationServiceTestMessage={app.translationServiceTestMessage} isDetectingWhisperBinary={app.isDetectingWhisperBinary} isSelectingWhisperBinary={app.isSelectingWhisperBinary} isTestingTranslationService={app.isTestingTranslationService} initialSectionId={app.initialSettingsSectionId} patchSettingsSection={app.patchAppSettingsSection} onClose={() => app.setIsSettingsDialogOpen(false)} onAutoDetectWhisperBinary={app.autoDetectWhisperBinary} onOpenAsrPanel={() => { app.setIsSettingsDialogOpen(false); app.openPanelMode('asr') }} onPickDefaultFolder={app.pickDefaultFolder} onPickCaptureFolder={app.pickCaptureFolder} onSelectWhisperBinary={app.selectWhisperBinary} onTestTranslationService={app.testTranslationService} onResetDefaults={app.resetAppSettings} /> : null}{app.isClipExportDialogOpen ? <ClipExportDialog copy={app.copy} hasSubtitle={app.hasClipExportSubtitle} initialLengthSeconds={app.appSettings.capture.clipExportLengthSeconds} initialMode={app.appSettings.capture.clipExportMode} onClose={() => app.setIsClipExportDialogOpen(false)} onConfirm={app.confirmClipExport} /> : null}<AiSetupDialog /><DownloadModelDialog />{app.isMediaDetailsDialogOpen ? <MediaDetailsDialog copy={app.copy} metadata={app.mediaMetadata} onClose={() => app.setIsMediaDetailsDialogOpen(false)} /> : null}</>
}
