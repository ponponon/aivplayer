import { describe, expect, it } from 'vitest'
import { createInitialAppUpdateState } from '../../src/shared/app-update-types'
import { readSource } from './test-source-utils'

describe('app update source constraints', () => {
  it('starts with an idle state and the current version', () => {
    expect(createInitialAppUpdateState('0.3.1')).toEqual({
      status: 'idle',
      currentVersion: '0.3.1'
    })
  })

  it('prompts before downloading and installs only after explicit restart', () => {
    const updaterSource = readSource('src/desktop/app-updater.ts')

    expect(updaterSource).not.toContain("process.platform !== 'darwin'")
    expect(updaterSource).toContain('!process.windowsStore')
    expect(updaterSource).toContain('autoUpdatePreference')
    expect(updaterSource).toContain('updateAppUpdaterPreference')
    expect(updaterSource).toContain('startAutomaticUpdateChecks')
    expect(updaterSource).toContain("status: 'available'")
    expect(updaterSource).toContain('downloadAppUpdate')
    expect(updaterSource).toContain('skipAppUpdate')
    expect(updaterSource).toContain('writeSkippedUpdateVersion')
    expect(updaterSource).toContain('autoUpdater.autoDownload = false')
    expect(updaterSource).toContain('autoUpdater.autoInstallOnAppQuit = false')
    expect(updaterSource).toContain('await pkg.autoUpdater.downloadUpdate()')
    expect(updaterSource).toContain('autoUpdater.quitAndInstall(true, true)')
  })

  it('uses a low-frequency automatic check and persists a reminder cooldown', () => {
    const updaterSource = readSource('src/desktop/app-updater.ts')

    expect(updaterSource).toContain('const INITIAL_UPDATE_CHECK_DELAY_MS = 60 * 1000')
    expect(updaterSource).toContain('const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000')
    expect(updaterSource).toContain('const UPDATE_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000')
    expect(updaterSource).toContain("checkForAppUpdate('automatic')")
    expect(updaterSource).toContain("checkForAppUpdate('manual')")
    expect(updaterSource).toContain('dismissedVersion')
    expect(updaterSource).toContain('dismissedAt')
    expect(updaterSource).toContain('isDismissedUpdateReminderActive')
  })

  it('exposes the ChatGPT-style update dialog actions', () => {
    const dialogSource = readSource('src/renderer/src/app/app-update-dialog.tsx')
    const dialogStyleSource = readSource('src/renderer/src/styles/player/app-update-dialog.css')
    const overlaySource = readSource('src/renderer/src/app/app-overlays.tsx')
    const notificationStyleSource = readSource('src/renderer/src/styles/player/app-notification-stack.css')
    const channelSource = readSource('src/shared/ipc-channels.ts')

    expect(dialogSource).toContain('skipVersion')
    expect(dialogSource).toContain('remindLater')
    expect(dialogSource).toContain('autoInstall')
    expect(dialogSource).toContain('downloadAction')
    expect(dialogSource).toContain('onDownload')
    expect(dialogSource).not.toContain('useModalFocusTrap')
    expect(dialogSource).not.toContain('aria-modal="true"')
    expect(dialogSource).not.toContain('app-update-dialog-backdrop')
    expect(dialogStyleSource).toContain('width: min(460px, 100%)')
    expect(overlaySource).toContain("const isUpdatePromptVisible = updateState.status === 'available'")
    expect(overlaySource).toContain('app-notification-stack')
    expect(notificationStyleSource).toContain('pointer-events: none')
    expect(notificationStyleSource).toContain('overscroll-behavior: contain')
    expect(dialogStyleSource).toContain('prefers-reduced-motion: no-preference')
    expect(channelSource).toContain("APP_UPDATE_DOWNLOAD: 'app-update:download'")
    expect(channelSource).toContain("APP_UPDATE_DISMISS: 'app-update:dismiss'")
    expect(channelSource).toContain("APP_UPDATE_SKIP: 'app-update:skip'")
  })

  it('publishes update metadata required by electron-updater', () => {
    const builderSource = readSource('electron-builder.yml')
    const workflowSource = readSource('.github/workflows/release.yml')

    expect(builderSource).toContain('provider: github')
    expect(builderSource).toContain('repo: aivplayer')
    expect(workflowSource).toContain('release/latest*.yml')
    expect(workflowSource).toContain('release/*.blockmap')
    expect(workflowSource).toContain('artifacts/assembled/latest*.yml')
    expect(workflowSource).toContain('artifacts/assembled/*.blockmap')
    expect(workflowSource).toContain('artifacts/assembled/release-manifest.json')
    expect(workflowSource).toContain('FFMPEG_WIN64_URL')
    expect(workflowSource).toContain("Get-ChildItem -Path $ffmpegRoot -Filter 'ffmpeg.exe'")
  })

  it('includes app-update.yml in the signed macOS app', () => {
    const builderSource = readSource('electron-builder.yml')
    const configSource = readSource('resources/app-update.yml')
    const workflowSource = readSource('.github/workflows/release.yml')
    const checkSource = readSource('scripts/check-packaged-resources.ts')

    expect(builderSource).toContain('mac:\n  category: public.app-category.video\n  icon: brand/icon.icns\n  extraResources:\n    - from: resources/app-update.yml\n      to: app-update.yml')
    expect(configSource).toContain('provider: github')
    expect(workflowSource).toContain('npx electron-builder --dir --publish never')
    expect(workflowSource).not.toContain('write-app-update-config')
    expect(checkSource).toContain("join(resourcePath, 'app-update.yml')")
  })

  it('keeps GitHub release metadata as the only update source', () => {
    const workflowSource = readSource('.github/workflows/release.yml')

    expect(workflowSource).toContain('Verify GitHub remote assets')
  })

  it('repairs the Windows libheif compatibility executable after CMake install', () => {
    const heifBuildSource = readSource('scripts/build-heif-source.ts')

    expect(heifBuildSource).toContain("platform !== 'win32'")
    expect(heifBuildSource).toContain("'heif-convert.exe'")
    expect(heifBuildSource).toContain("'heif-dec.exe'")
    expect(heifBuildSource).toContain('copyFile(decoderPath, converterPath)')
  })
})
