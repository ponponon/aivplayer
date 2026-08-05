import { useEffect } from 'react'
import { ClipExportDialog } from './clip-export-dialog'
import { AiSetupDialog } from './ai-setup-dialog'
import { AboutDialog } from './about-dialog'
import { DownloadModelDialog } from './download-model-dialog'
import { MediaDetailsDialog } from './media-details-dialog'
import { SettingsDialog } from './settings-dialog'
import { useAppContext } from './app-context'
import { WebShareDialog } from './web-share-dialog'

export function AppOverlays(): React.ReactElement {
  const app = useAppContext()
  const mediaDurationSeconds = app.mediaDurationSeconds ?? app.state.duration
  const initialClipStartSeconds = Math.min(Math.max(0, app.state.currentTime), Math.max(0, mediaDurationSeconds))
  const initialClipEndSeconds = Math.min(mediaDurationSeconds, initialClipStartSeconds + app.appSettings.capture.clipExportLengthSeconds)
  useEffect(() => {
    if (app.isDownloadDialogOpen) app.downloadDialogRef.current?.focus()
  }, [app.isDownloadDialogOpen])
  return <>{app.isSettingsDialogOpen ? <SettingsDialog copy={app.copy} settings={app.appSettings} asrStatus={app.asrStatus} runtimeSetupMessage={app.runtimeSetupMessage} translationServiceTestMessage={app.translationServiceTestMessage} isDetectingWhisperBinary={app.isDetectingWhisperBinary} isSelectingWhisperBinary={app.isSelectingWhisperBinary} isTestingTranslationService={app.isTestingTranslationService} initialSectionId={app.initialSettingsSectionId} patchSettingsSection={app.patchAppSettingsSection} onClose={() => app.setIsSettingsDialogOpen(false)} onAutoDetectWhisperBinary={app.autoDetectWhisperBinary} onOpenAsrPanel={() => { app.setIsSettingsDialogOpen(false); app.openPanelMode('asr') }} onPickDefaultFolder={app.pickDefaultFolder} onPickCaptureFolder={app.pickCaptureFolder} onSelectWhisperBinary={app.selectWhisperBinary} onTestTranslationService={app.testTranslationService} onResetDefaults={app.resetAppSettings} onRestartWithGpuAcceleration={app.restartWithGpuAcceleration} appUpdateState={app.appUpdateState} onCheckForAppUpdate={app.checkForAppUpdate} onInstallAppUpdate={app.installAppUpdate} /> : null}{app.isAboutDialogOpen ? <AboutDialog copy={app.copy} onClose={() => app.setIsAboutDialogOpen(false)} /> : null}{app.isClipExportDialogOpen && app.state.currentFile ? <ClipExportDialog copy={app.copy} mediaUrl={app.state.currentFile.url} mediaDurationSeconds={mediaDurationSeconds} currentTimeSeconds={app.state.currentTime} hasSubtitle={app.hasClipExportSubtitle} initialStartSeconds={initialClipStartSeconds} initialEndSeconds={initialClipEndSeconds} initialMode={app.appSettings.capture.clipExportMode} onClose={() => app.setIsClipExportDialogOpen(false)} onConfirm={app.confirmClipExport} /> : null}<AiSetupDialog /><DownloadModelDialog />{app.isMediaDetailsDialogOpen ? <MediaDetailsDialog copy={app.copy} metadata={app.mediaMetadata} onClose={() => app.setIsMediaDetailsDialogOpen(false)} /> : null}{app.isWebShareDialogOpen ? <WebShareDialog copy={app.copy} status={app.webShareStatus} error={app.webShareError} notice={app.webShareNotice} playlistCount={app.state.playlist.length} directoryPaths={app.webShareDirectoryPaths} allowRemoteControl={app.allowRemoteControl} onToggleRemoteControl={(enabled) => { void app.toggleRemoteControl(enabled) }} onStart={() => void app.startWebShare()} onStop={() => void app.stopWebShare()} onRefresh={() => void app.refreshWebShare()} onAddDirectory={() => void app.addWebShareDirectory()} onRemoveDirectory={(directoryPath) => { void app.removeWebShareDirectory(directoryPath) }} onCopy={(url) => { void app.copyWebShareUrl(url) }} onClose={() => app.setIsWebShareDialogOpen(false)} /> : null}</>
}
