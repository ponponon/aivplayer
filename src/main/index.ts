import { app, BrowserWindow } from 'electron'
import { registerMediaProtocolHandler, registerMediaProtocolScheme } from './media/media-protocol'
import { APP_NAME, installApplicationMenu, loadAppSettings } from './main-settings'
import { registerBatchSubtitleIpc } from './ipc-batch-subtitle'
import { registerClipExportIpc } from './ipc-clip-export'
import { registerAsrRuntimeIpc } from './ipc-asr-runtime'
import { registerAsrCacheIpc } from './ipc-asr-cache'
import { registerAsrSubtitleIpc } from './ipc-asr-subtitles'
import { registerAsrTranslationIpc } from './ipc-asr-translation'
import { registerAsrSummaryIpc } from './ipc-asr-summary'
import { registerSettingsIpc } from './ipc-settings'
import { registerUtilityIpc } from './ipc-utility'
import { registerWindowControlsIpc } from './ipc-window-controls'
import { registerVisionIpc } from './ipc-vision'
import { registerDramaIpc } from './ipc-drama'
import { applyMacDockIcon, createWindow, focusMainWindow, queueIncomingMediaPaths } from './window-lifecycle'
import { runCli } from '../cli/cli-main'

registerMediaProtocolScheme()
app.setName(APP_NAME)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const cliArgumentIndex = process.argv.indexOf('--cli')
const isCliInvocation = cliArgumentIndex !== -1

function registerIpc(): void {
  registerSettingsIpc()
  registerAsrRuntimeIpc()
  registerAsrCacheIpc()
  registerAsrSubtitleIpc()
  registerAsrTranslationIpc()
  registerAsrSummaryIpc()
  registerBatchSubtitleIpc()
  registerClipExportIpc()
  registerUtilityIpc()
  registerWindowControlsIpc()
  registerVisionIpc()
  registerDramaIpc()
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
      app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
    })
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
