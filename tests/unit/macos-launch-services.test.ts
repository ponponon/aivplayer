import { describe, expect, it } from 'vitest'
import {
  cleanupMacApplicationRegistrations,
  compareMacApplicationVersions,
  getMacApplicationBundlePath,
  type MacApplicationBundle
} from '../../src/desktop/macos-launch-services'

const bundle = (path: string, version: string): MacApplicationBundle => ({
  path,
  version,
  bundleId: 'cn.quniv.aivplayer'
})

describe('macOS LaunchServices cleanup', () => {
  it('resolves the packaged app bundle from Electron executable path', () => {
    expect(getMacApplicationBundlePath('/Applications/AIVPlayer.app/Contents/MacOS/AIVPlayer'))
      .toBe('/Applications/AIVPlayer.app')
  })

  it('compares numeric application versions', () => {
    expect(compareMacApplicationVersions('0.6.1', '0.6.0')).toBe(1)
    expect(compareMacApplicationVersions('0.6.0', '0.6.1')).toBe(-1)
    expect(compareMacApplicationVersions('v0.6.1', '0.6.1')).toBe(0)
  })

  it('unregisters mounted older and duplicate copies but keeps newer copies', () => {
    const commands: string[][] = []
    const applications = [
      bundle('/Volumes/AIVPlayer 0.6.0-arm64/AIVPlayer.app', '0.6.0'),
      bundle('/Volumes/AIVPlayer 0.6.3-arm64/AIVPlayer.app', '0.6.3'),
      bundle('/Applications/AIVPlayer.app', '0.6.3'),
      bundle('/Applications/AIVPlayer 0.5.6.app', '0.5.6')
    ]

    const removed = cleanupMacApplicationRegistrations({
      currentApplicationPath: '/Applications/AIVPlayer.app',
      currentVersion: '0.6.3',
      applications,
      lsregisterPath: '/usr/bin/lsregister-test-double',
      runCommand: (_command, args) => {
        commands.push(args)
        return true
      }
    })

    expect(removed).toEqual([
      '/Volumes/AIVPlayer 0.6.0-arm64/AIVPlayer.app',
      '/Volumes/AIVPlayer 0.6.3-arm64/AIVPlayer.app',
      '/Applications/AIVPlayer 0.5.6.app'
    ])
    expect(commands).toEqual([
      ['-u', '/Volumes/AIVPlayer 0.6.0-arm64/AIVPlayer.app'],
      ['-u', '/Volumes/AIVPlayer 0.6.3-arm64/AIVPlayer.app'],
      ['-u', '/Applications/AIVPlayer 0.5.6.app'],
      ['-f', '/Applications/AIVPlayer.app']
    ])
  })

  it('does not unregister a newer app when an older app is launched directly', () => {
    const commands: string[][] = []

    cleanupMacApplicationRegistrations({
      currentApplicationPath: '/Volumes/AIVPlayer 0.6.0-arm64/AIVPlayer.app',
      currentVersion: '0.6.0',
      lsregisterPath: '/usr/bin/lsregister-test-double',
      applications: [
        bundle('/Applications/AIVPlayer.app', '0.6.1'),
        bundle('/Volumes/AIVPlayer 0.6.0-arm64/AIVPlayer.app', '0.6.0')
      ],
      runCommand: (_command, args) => {
        commands.push(args)
        return true
      }
    })

    expect(commands).toEqual([])
  })
})
