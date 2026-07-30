import { app, BrowserWindow } from 'electron'
import { registerMediaProtocolHandler, registerMediaProtocolScheme } from './media/media-protocol'
import { APP_NAME, installApplicationMenu, loadAppSettings } from './desktop-settings'
import { registerBatchSubtitleIpc } from './ipc-batch-subtitle'
import { registerClipExportIpc } from './ipc-clip-export'
import { registerTimelineExportIpc } from './ipc-timeline-export'
import { registerEditingProjectIpc } from './ipc-editing-project'
import { registerAsrRuntimeIpc } from './ipc-asr-runtime'
import { registerAsrCacheIpc } from './ipc-asr-cache'
import { registerAsrSubtitleIpc } from './ipc-asr-subtitles'
import { registerAsrTranslationIpc } from './ipc-asr-translation'
import { registerAsrSummaryIpc } from './ipc-asr-summary'
import { registerSettingsIpc } from './ipc-settings'
import { registerFilmstripIpc } from './ipc-filmstrip'
import { registerSceneDetectionIpc } from './ipc-scene-detection'
import { registerSilenceDetectionIpc } from './ipc-silence-detection'
import { registerUtilityIpc } from './ipc-utility'
import { registerWindowControlsIpc } from './ipc-window-controls'
import { registerVisionIpc } from './ipc-vision'
import { registerDramaIpc } from './ipc-drama'
import { applyMacDockIcon, createWindow, focusMainWindow, queueIncomingMediaPaths } from './window-lifecycle'
import { runCli } from '../cli/cli-main'
import { readAppSettings } from '../core/app-settings'

registerMediaProtocolScheme()
app.setName(APP_NAME)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// GPU 兼容性处理：
// Linux + NVIDIA 显卡存在 Chromium GPU 进程的已知兼容性问题
// 参考: https://github.com/electron/electron/issues/50462
const isLinux = process.platform === 'linux'
const userForcesDisableGPU =
  process.env.AIVPLAYER_DISABLE_GPU === '1' ||
  process.env.ELECTRON_DISABLE_HARDWARE_ACCELERATION === '1'

// 在应用启动时读取 GPU 加速设置
// 注意：app.commandLine.appendSwitch 必须在 app.whenReady() 之前调用
async function applyGpuSettings(): Promise<void> {
  if (userForcesDisableGPU) {
    app.commandLine.appendSwitch('disable-gpu')
    app.commandLine.appendSwitch('disable-gpu-compositing')
    return
  }

  if (!isLinux) {
    return
  }

  try {
    const userDataPath = app.getPath('userData')
    const settings = await readAppSettings(userDataPath, app.getPath('videos'))
    
    if (settings.playback.gpuAcceleration) {
      app.commandLine.appendSwitch('no-zygote')
    } else {
      app.commandLine.appendSwitch('disable-gpu')
      app.commandLine.appendSwitch('disable-gpu-compositing')
    }
  } catch {
    app.commandLine.appendSwitch('no-zygote')
  }
}

void applyGpuSettings()

const cliArgumentIndex = process.argv.indexOf('--cli')
const isCliInvocation = cliArgumentIndex !== -1

function registerIpc(): void {
  registerSettingsIpc()
  registerFilmstripIpc()
  registerSceneDetectionIpc()
  registerSilenceDetectionIpc()
  registerAsrRuntimeIpc()
  registerAsrCacheIpc()
  registerAsrSubtitleIpc()
  registerAsrTranslationIpc()
  registerAsrSummaryIpc()
  registerBatchSubtitleIpc()
  registerClipExportIpc()
  registerTimelineExportIpc()
  registerEditingProjectIpc()
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
