import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('GPU acceleration source constraints', () => {
  it('applies GPU switches synchronously before Electron ready', () => {
    const mainSource = readSource('src/desktop/index.ts')

    expect(mainSource).toContain('applyGpuSettingsBeforeReady')
    expect(mainSource).toContain('readGpuAccelerationPreferenceSync')
    expect(mainSource).not.toContain('void applyGpuSettings()')
    expect(mainSource).not.toContain("appendSwitch('no-zygote')")
  })

  it('persists the GPU setting before requesting a real app relaunch', () => {
    const settingsSource = readSource('src/renderer/src/app/settings-dialog.tsx')
    const actionsSource = readSource('src/renderer/src/app/use-settings-actions.ts')
    const ipcSource = readSource('src/desktop/ipc-settings.ts')

    expect(settingsSource).toContain('onRestartWithGpuAcceleration')
    expect(settingsSource).not.toContain('window.location.reload()')
    expect(actionsSource).toContain('await window.aiv.setAppSettings(nextSettings)')
    expect(actionsSource).toContain('await window.aiv.restartApp()')
    expect(ipcSource).toContain('app.relaunch()')
    expect(ipcSource).toContain('app.exit(0)')
  })

  it('keeps electron-vite dev alive across a GPU restart', () => {
    const packageSource = readSource('package.json')
    const supervisorSource = readSource('scripts/dev-supervisor.js')
    const ipcSource = readSource('src/desktop/ipc-settings.ts')

    expect(packageSource).toContain('scripts/dev-supervisor.js')
    expect(supervisorSource).toContain('AIVPLAYER_DEV_SUPERVISOR')
    expect(supervisorSource).toContain('DEV_RESTART_EXIT_CODE')
    expect(supervisorSource).toContain('setTimeout(startDevServer, 100)')
    expect(ipcSource).toContain("process.env.AIVPLAYER_DEV_SUPERVISOR === '1'")
    expect(ipcSource).toContain('app.exit(DEV_RESTART_EXIT_CODE)')
  })
})
