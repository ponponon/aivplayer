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

  it('downloads in the background and installs only after explicit restart', () => {
    const updaterSource = readSource('src/desktop/app-updater.ts')

    expect(updaterSource).toContain("process.platform !== 'darwin'")
    expect(updaterSource).toContain('!process.windowsStore')
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
    expect(workflowSource).toContain('release/latest*.yml')
    expect(workflowSource).toContain('release/*.blockmap')
    expect(workflowSource).toContain('artifacts/assembled/latest*.yml')
    expect(workflowSource).toContain('artifacts/assembled/*.blockmap')
    expect(workflowSource).toContain('artifacts/assembled/release-manifest.json')
    expect(workflowSource).toContain('FFMPEG_WIN64_URL')
    expect(workflowSource).toContain("Get-ChildItem -Path $ffmpegRoot -Filter 'ffmpeg.exe'")
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
