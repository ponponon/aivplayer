import { app, BrowserWindow } from 'electron'
import { registerMediaProtocolHandler, registerMediaProtocolScheme } from './media/media-protocol'
import { APP_NAME, installApplicationMenu, loadAppSettings } from './desktop-settings'
import { registerBatchSubtitleIpc } from './ipc-batch-subtitle'
import { registerClipExportIpc } from './ipc-clip-export'
import { registerTimelineExportIpc } from './ipc-timeline-export'
import { registerEditingProjectIpc } from './ipc-editing-project'
import { registerEditingCaptionWatcherIpc, stopEditingCaptionWatcher } from './ipc-editing-caption-watcher'
import { registerAsrRuntimeIpc } from './ipc-asr-runtime'
import { registerAsrCacheIpc } from './ipc-asr-cache'
import { registerAsrSubtitleIpc } from './ipc-asr-subtitles'
import { registerAsrTranslationIpc } from './ipc-asr-translation'
import { registerAsrSummaryIpc } from './ipc-asr-summary'
import { registerSettingsIpc } from './ipc-settings'
import { registerFilmstripIpc } from './ipc-filmstrip'
import { registerWaveformIpc } from './ipc-waveform'
import { registerSceneDetectionIpc } from './ipc-scene-detection'
import { registerSilenceDetectionIpc } from './ipc-silence-detection'
import { registerStructureAnalysisIpc } from './ipc-structure-analysis'
import { registerUtilityIpc } from './ipc-utility'
import { registerWindowControlsIpc } from './ipc-window-controls'
import { registerVisionIpc } from './ipc-vision'
import { registerEvidenceTaskIpc } from './ipc-evidence-task'
import { registerEvidenceDraftIpc } from './ipc-evidence-draft'
import { registerPersonMatteIpc } from './ipc-person-matte'
import { registerDramaIpc } from './ipc-drama'
import { registerWebIpc, stopWebServer } from './ipc-web'
import { registerAppUpdaterIpc, startAppUpdater, stopAppUpdater } from './app-updater'
import { applyMacDockIcon, createWindow, focusMainWindow, queueIncomingMediaPaths } from './window-lifecycle'
import { runCli } from '../cli/cli-main'
import { readGpuAccelerationPreferenceSync } from '../core/app-settings'
import { GPU_DISABLE_SWITCHES, shouldDisableGpu } from '../core/gpu-settings'

registerMediaProtocolScheme()
app.setName(APP_NAME)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// GPU 兼容性处理：
// GPU command-line switches must be applied before app.ready. Do not wait for
// the async app-settings loader here, otherwise Chromium may initialize first.
const userForcesDisableGPU =
  process.env.AIVPLAYER_DISABLE_GPU === '1' ||
  process.env.ELECTRON_DISABLE_HARDWARE_ACCELERATION === '1'

function applyGpuSettingsBeforeReady(): void {
  let gpuAcceleration = true
  try {
    gpuAcceleration = readGpuAccelerationPreferenceSync(app.getPath('userData'))
  } catch {
    // Keep the safe default if Electron cannot resolve the user-data path yet.
  }

  if (!shouldDisableGpu({ forceDisable: userForcesDisableGPU, gpuAcceleration })) return
  for (const switchName of GPU_DISABLE_SWITCHES) app.commandLine.appendSwitch(switchName)
}

applyGpuSettingsBeforeReady()

const cliArgumentIndex = process.argv.indexOf('--cli')
const isCliInvocation = cliArgumentIndex !== -1

function registerIpc(): void {
  registerSettingsIpc()
  registerAppUpdaterIpc()
  registerFilmstripIpc()
  registerWaveformIpc()
  registerSceneDetectionIpc()
  registerSilenceDetectionIpc()
  registerStructureAnalysisIpc()
  registerAsrRuntimeIpc()
  registerAsrCacheIpc()
  registerAsrSubtitleIpc()
  registerAsrTranslationIpc()
  registerAsrSummaryIpc()
  registerBatchSubtitleIpc()
  registerClipExportIpc()
  registerTimelineExportIpc()
  registerEditingProjectIpc()
  registerEditingCaptionWatcherIpc()
  registerUtilityIpc()
  registerWindowControlsIpc()
  registerVisionIpc()
  registerEvidenceTaskIpc()
  registerEvidenceDraftIpc()
  registerPersonMatteIpc()
  registerDramaIpc()
  registerWebIpc()
}

if (isCliInvocation) {
  void app.whenReady().then(async () => {
    await loadAppSettings()
    const exitCode = await runCli(process.argv.slice(cliArgumentIndex + 1))
    app.exit(exitCode)
  }).catch((error) => {
    process.stderr.write(`aivcli 启动失败：${error instanceof Error ? error.message : String(error)}\n`)
    app.exit(10)
  })
} else {
  const hasSingleInstanceLock = app.requestSingleInstanceLock()

  if (!hasSingleInstanceLock) {
    app.quit()
  } else {
    app.on('open-file', (event, filePath) => { event.preventDefault(); queueIncomingMediaPaths([filePath]) })
    app.on('second-instance', (_event, commandLine) => { queueIncomingMediaPaths(commandLine); focusMainWindow() })
    void app.whenReady().then(async () => {
      await loadAppSettings()
      registerMediaProtocolHandler()
      registerIpc()
      app.setAboutPanelOptions({ applicationName: APP_NAME })
      installApplicationMenu()
      applyMacDockIcon()
      createWindow()
      startAppUpdater(false)
      app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
    })
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => { stopAppUpdater(); stopEditingCaptionWatcher(); void stopWebServer() })
