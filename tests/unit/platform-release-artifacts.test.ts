import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const projectRoot = process.cwd()
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function createFixture(names: string[]) {
  const directory = await mkdtemp(join(tmpdir(), 'aivplayer-platform-release-'))
  temporaryDirectories.push(directory)
  await mkdir(join(directory, 'nested'), { recursive: true })
  for (const name of names) await writeFile(join(directory, name), 'fixture')
  return directory
}

async function runCheck(platform: string, artifactsDirectory: string, reportPath?: string) {
  const args = [
    join(projectRoot, 'scripts/check-platform-release-artifacts.mjs'),
    '--platform', platform,
    '--artifacts-dir', artifactsDirectory
  ]
  if (reportPath) args.push('--report-path', reportPath)
  return execFileAsync(process.execPath, args, { cwd: projectRoot })
}

describe('platform release artifact contract', () => {
  it.each([
    ['macos', ['AIVPlayer-0.4.0.dmg', 'AIVPlayer-0.4.0.zip', 'AIVPlayer-0.4.0.pkg', 'AIVPlayer-0.4.0.dmg.blockmap', 'latest-mac.yml']],
    ['windows', ['AIVPlayer Setup 0.4.0.exe', 'AIVPlayer Setup 0.4.0.exe.blockmap', 'latest.yml']],
    ['linux', ['AIVPlayer-0.4.0.AppImage', 'aivplayer_0.4.0_amd64.deb', 'latest-linux.yml']]
  ])('accepts the complete %s package set', async (platform, names) => {
    const artifactsDirectory = await createFixture([...names, 'builder-debug.yml'])
    const result = await runCheck(platform, artifactsDirectory)
    expect(result.stdout).toContain(`Platform release artifacts verified: ${platform}`)
  })

  it('rejects a platform when one configured target is missing', async () => {
    const artifactsDirectory = await createFixture(['AIVPlayer-0.4.0.dmg', 'AIVPlayer-0.4.0.zip', 'latest-mac.yml'])
    await expect(runCheck('macos', artifactsDirectory)).rejects.toThrow('missing packages: .pkg')
  })

  it('rejects cross-platform package leakage and unknown platforms', async () => {
    const artifactsDirectory = await createFixture(['AIVPlayer Setup 0.4.0.exe', 'aivplayer_0.4.0_amd64.deb', 'latest.yml'])
    await expect(runCheck('windows', artifactsDirectory)).rejects.toThrow('unexpected packages: aivplayer_0.4.0_amd64.deb')
    await expect(runCheck('android', artifactsDirectory)).rejects.toThrow('Unsupported release platform')
  })

  it('writes a hashable evidence report without debug files', async () => {
    const artifactsDirectory = await createFixture(['AIVPlayer-0.4.0.dmg', 'AIVPlayer-0.4.0.zip', 'AIVPlayer-0.4.0.pkg', 'latest-mac.yml', 'builder-debug.yml'])
    const reportPath = join(artifactsDirectory, 'platform-release-report-macos.json')
    await runCheck('macos', artifactsDirectory, reportPath)
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
      schemaVersion: number
      platform: string
      artifacts: Array<{ name: string; sizeBytes: number; sha256: string }>
    }
    expect(report.schemaVersion).toBe(1)
    expect(report.platform).toBe('macos')
    expect(report.artifacts.map((artifact) => artifact.name)).toEqual([
      'AIVPlayer-0.4.0.dmg',
      'AIVPlayer-0.4.0.pkg',
      'AIVPlayer-0.4.0.zip',
      'latest-mac.yml'
    ])
    expect(report.artifacts.every((artifact) => artifact.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(artifact.sha256))).toBe(true)
  })
})
