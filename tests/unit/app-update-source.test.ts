import { describe, expect, it } from 'vitest'
import { createInitialAppUpdateState } from '../../src/shared/app-update-types'
import { readSource } from './test-source-utils'

describe('app update source constraints', () => {
  it('starts with an idle state and the current version', () => {
    expect(createInitialAppUpdateState('0.3.0')).toEqual({
      status: 'idle',
      currentVersion: '0.3.0'
    })
  })

  it('downloads in the background and installs only after explicit restart', () => {
    const updaterSource = readSource('src/desktop/app-updater.ts')

    expect(updaterSource).toContain('autoUpdater.autoDownload = false')
    expect(updaterSource).toContain('autoUpdater.autoInstallOnAppQuit = false')
    expect(updaterSource).toContain('void autoUpdater.downloadUpdate()')
    expect(updaterSource).toContain('autoUpdater.quitAndInstall(false, true)')
  })

  it('publishes update metadata required by electron-updater', () => {
    const builderSource = readSource('electron-builder.yml')
    const workflowSource = readSource('.github/workflows/release.yml')

    expect(builderSource).toContain('provider: github')
    expect(builderSource).toContain('repo: aivplayer')
    expect(workflowSource).toContain('release/*.yml')
    expect(workflowSource).toContain('release/*.blockmap')
    expect(workflowSource).toContain('artifacts/*.yml')
    expect(workflowSource).toContain('artifacts/*.blockmap')
  })
})
