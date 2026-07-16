import { app, BrowserWindow } from 'electron'
import { registerMediaProtocolHandler, registerMediaProtocolScheme } from './media/media-protocol'
import { APP_NAME, installApplicationMenu, loadAppSettings } from './main-settings'
import { registerBatchSubtitleIpc } from './ipc-batch-subtitle'
import { registerClipExportIpc } from './ipc-clip-export'
import { registerAsrRuntimeIpc } from './ipc-asr-runtime'
import { registerAsrSubtitleIpc } from './ipc-asr-subtitles'
import { registerAsrTranslationIpc } from './ipc-asr-translation'
import { registerSettingsIpc } from './ipc-settings'
import { registerUtilityIpc } from './ipc-utility'
import { applyMacDockIcon, createWindow, focusMainWindow, queueIncomingMediaPaths } from './window-lifecycle'

registerMediaProtocolScheme()
app.setName(APP_NAME)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

function registerIpc(): void {
  registerSettingsIpc()
  registerAsrRuntimeIpc()
  registerAsrSubtitleIpc()
  registerAsrTranslationIpc()
  registerBatchSubtitleIpc()
  registerClipExportIpc()
  registerUtilityIpc()
}

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
