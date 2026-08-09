import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const projectRoot = process.cwd()
const temporaryDirectories: string[] = []

const platformFiles = {
  macos: ['AIVPlayer-0.4.0.dmg', 'AIVPlayer-0.4.0.zip', 'AIVPlayer-0.4.0.pkg', 'latest-mac.yml'],
  windows: ['AIVPlayer Setup 0.4.0.exe', 'latest.yml'],
  linux: ['AIVPlayer-0.4.0.AppImage', 'aivplayer_0.4.0_amd64.deb', 'latest-linux.yml']
} as const

const platformContracts = {
  macos: { packages: ['.dmg', '.zip', '.pkg'], metadata: ['latest-mac.yml'] },
  windows: { packages: ['.exe'], metadata: ['latest.yml'] },
  linux: { packages: ['.AppImage', '.deb'], metadata: ['latest-linux.yml'] }
} as const

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'aivplayer-platform-evidence-'))
  temporaryDirectories.push(directory)
  for (const names of Object.values(platformFiles)) {
    for (const name of names) await writeFile(join(directory, name), `fixture:${name}`)
  }
  for (const [platform, names] of Object.entries(platformFiles)) {
    const artifacts = []
    for (const name of names) {
      const content = await readFile(join(directory, name))
      artifacts.push({
        name,
        sizeBytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex')
      })
    }
    await writeFile(join(directory, `platform-release-report-${platform}.json`), JSON.stringify({
      schemaVersion: 1,
      ok: true,
      platform,
      generatedAt: '2026-08-09T00:00:00.000Z',
      artifactCount: artifacts.length,
      packageExtensions: platformContracts[platform as keyof typeof platformContracts].packages,
      metadata: platformContracts[platform as keyof typeof platformContracts].metadata,
      artifacts
    }))
  }
  return directory
}

async function runCheck(artifactsDirectory: string) {
  return execFileAsync(process.execPath, [
    join(projectRoot, 'scripts/check-platform-evidence.mjs'),
    '--artifacts-dir', artifactsDirectory
  ], { cwd: projectRoot })
}

describe('merged platform evidence', () => {
  it('matches all three Runner reports against the merged artifact directory', async () => {
    const artifactsDirectory = await createFixture()
    const result = await runCheck(artifactsDirectory)
    expect(result.stdout).toContain('Platform evidence verified: macos, windows, linux, 9 artifact(s)')
  })

  it('rejects missing reports and changed files before manifest creation', async () => {
    const artifactsDirectory = await createFixture()
    await unlink(join(artifactsDirectory, 'platform-release-report-linux.json'))
    await expect(runCheck(artifactsDirectory)).rejects.toThrow('Missing platform evidence report: platform-release-report-linux.json')

    const secondDirectory = await createFixture()
    await writeFile(join(secondDirectory, 'AIVPlayer-0.4.0.dmg'), 'changed after Runner report')
    await expect(runCheck(secondDirectory)).rejects.toThrow('Merged release evidence SHA-256 changed: AIVPlayer-0.4.0.dmg')
  })

  it('rejects report overlap and unreported merged files', async () => {
    const artifactsDirectory = await createFixture()
    const windowsReportPath = join(artifactsDirectory, 'platform-release-report-windows.json')
    const windowsReport = JSON.parse(await readFile(windowsReportPath, 'utf8')) as { artifactCount: number; artifacts: Array<Record<string, unknown>> }
    windowsReport.artifacts.push({ name: 'AIVPlayer-0.4.0.dmg', sizeBytes: 1, sha256: '0'.repeat(64) })
    windowsReport.artifactCount = windowsReport.artifacts.length
    await writeFile(windowsReportPath, JSON.stringify(windowsReport))
    await expect(runCheck(artifactsDirectory)).rejects.toThrow('reports overlap on artifact: AIVPlayer-0.4.0.dmg')

    const secondDirectory = await createFixture()
    await writeFile(join(secondDirectory, 'unreported-0.4.0.dmg'), 'extra')
    await expect(runCheck(secondDirectory)).rejects.toThrow('unexpected: unreported-0.4.0.dmg')
  })
})
