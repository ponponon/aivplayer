import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

const metadata = (version: string, name: string) => [
  `version: ${version}`,
  'files:',
  `  - url: ${name}`,
  '    sha512: fixture',
  '    size: 5',
  'releaseDate: 2026-08-09T00:00:00.000Z',
  ''
].join('\n')

async function writeEvidenceReport(root: string, sourceDirectory: string, evidenceDirectory: string, reportName: string, platform: string, packageExtensions: string[], metadataNames: string[], artifactNames: string[]) {
  const artifacts = []
  for (const name of artifactNames) {
    const content = await readFile(join(root, sourceDirectory, name))
    artifacts.push({
      name,
      sizeBytes: content.length,
      sha256: createHash('sha256').update(content).digest('hex')
    })
  }
  await writeFile(join(root, evidenceDirectory, reportName), JSON.stringify({
    schemaVersion: 1,
    ok: true,
    platform,
    generatedAt: '2026-08-09T00:00:00.000Z',
    artifactCount: artifacts.length,
    packageExtensions,
    metadata: metadataNames,
    artifacts
  }))
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'aivplayer-release-assembly-'))
  temporaryDirectories.push(root)
  for (const name of ['macos', 'windows-x64', 'windows-arm64', 'linux-x64', 'linux-arm64']) await mkdir(join(root, name), { recursive: true })
  for (const name of ['release-evidence-macos', 'release-evidence-windows', 'release-evidence-windows-arm64', 'release-evidence-linux', 'release-evidence-linux-arm64']) await mkdir(join(root, name), { recursive: true })
  await writeFile(join(root, 'macos', 'AIVPlayer-0.5.1-arm64.dmg'), 'dmg')
  await writeFile(join(root, 'macos', 'AIVPlayer-0.5.1-arm64.zip'), 'zip')
  await writeFile(join(root, 'macos', 'AIVPlayer-0.5.1-arm64.pkg'), 'pkg')
  await writeFile(join(root, 'macos', 'latest-mac.yml'), metadata('0.5.1', 'AIVPlayer-0.5.1-arm64.zip'))
  await writeFile(join(root, 'windows-x64', 'AIVPlayer Setup 0.5.1 x64.exe'), 'x64')
  await writeFile(join(root, 'windows-x64', 'latest.yml'), metadata('0.5.1', 'AIVPlayer Setup 0.5.1 x64.exe'))
  await writeFile(join(root, 'windows-arm64', 'AIVPlayer Setup 0.5.1 arm64.exe'), 'arm64')
  await writeFile(join(root, 'windows-arm64', 'latest.yml'), metadata('0.5.1', 'AIVPlayer Setup 0.5.1 arm64.exe'))
  await writeFile(join(root, 'linux-x64', 'aivplayer-0.5.1-x64.AppImage'), 'appimage-x64')
  await writeFile(join(root, 'linux-x64', 'aivplayer-0.5.1-x64.deb'), 'deb-x64')
  await writeFile(join(root, 'linux-x64', 'latest-linux.yml'), metadata('0.5.1', 'aivplayer-0.5.1-x64.AppImage'))
  await writeFile(join(root, 'linux-arm64', 'aivplayer-0.5.1-arm64.AppImage'), 'appimage-arm64')
  await writeFile(join(root, 'linux-arm64', 'aivplayer-0.5.1-arm64.deb'), 'deb-arm64')
  await writeFile(join(root, 'linux-arm64', 'latest-linux-arm64.yml'), metadata('0.5.1', 'aivplayer-0.5.1-arm64.AppImage'))
  await writeEvidenceReport(root, 'macos', 'release-evidence-macos', 'platform-release-report-macos.json', 'macos', ['.dmg', '.zip', '.pkg'], ['latest-mac.yml'], [
    'AIVPlayer-0.5.1-arm64.dmg', 'AIVPlayer-0.5.1-arm64.zip', 'AIVPlayer-0.5.1-arm64.pkg', 'latest-mac.yml'
  ])
  await writeEvidenceReport(root, 'windows-x64', 'release-evidence-windows', 'platform-release-report-windows.json', 'windows', ['.exe'], ['latest.yml'], [
    'AIVPlayer Setup 0.5.1 x64.exe', 'latest.yml'
  ])
  await writeEvidenceReport(root, 'windows-arm64', 'release-evidence-windows-arm64', 'platform-release-report-windows-arm64.json', 'windows', ['.exe'], ['latest.yml'], [
    'AIVPlayer Setup 0.5.1 arm64.exe', 'latest.yml'
  ])
  await writeEvidenceReport(root, 'linux-x64', 'release-evidence-linux', 'platform-release-report-linux.json', 'linux', ['.AppImage', '.deb'], ['latest-linux.yml'], [
    'aivplayer-0.5.1-x64.AppImage', 'aivplayer-0.5.1-x64.deb', 'latest-linux.yml'
  ])
  await writeEvidenceReport(root, 'linux-arm64', 'release-evidence-linux-arm64', 'platform-release-report-linux-arm64.json', 'linux', ['.AppImage', '.deb'], ['latest-linux-arm64.yml'], [
    'aivplayer-0.5.1-arm64.AppImage', 'aivplayer-0.5.1-arm64.deb', 'latest-linux-arm64.yml'
  ])
  await mkdir(join(root, 'windows-x64', 'release', 'win-unpacked', 'resources'), { recursive: true })
  await writeFile(join(root, 'windows-x64', 'release', 'win-unpacked', 'AIVPlayer.exe'), 'unpacked application')
  await writeFile(join(root, 'windows-x64', 'release', 'win-unpacked', 'resources', 'ffmpeg.exe'), 'unpacked runtime')
  await mkdir(join(root, 'release-manifest'), { recursive: true })
  await writeFile(join(root, 'release-manifest', 'release-manifest.json'), '{"tag":"v0.5.1"}\n')
  return root
}

async function runAssembly(inputDirectory: string, outputDirectory: string) {
  return execFileAsync(process.execPath, [
    join(projectRoot, 'scripts/assemble-release-artifacts.mjs'),
    '--input-dir', inputDirectory,
    '--output-dir', outputDirectory
  ], { cwd: projectRoot })
}

async function runEvidenceCheck(artifactsDirectory: string) {
  return execFileAsync(process.execPath, [
    join(projectRoot, 'scripts/check-platform-evidence.mjs'),
    '--artifacts-dir', artifactsDirectory
  ], { cwd: projectRoot })
}

describe('release artifact assembly', () => {
  it('assembles unique packages and architecture-aware update metadata', async () => {
    const input = await createFixture()
    const output = join(input, 'assembled')
    await runAssembly(input, output)

    const windowsMetadata = await readFile(join(output, 'latest.yml'), 'utf8')
    expect(windowsMetadata).toContain('AIVPlayer Setup 0.5.1 x64.exe')
    expect(windowsMetadata).toContain('AIVPlayer Setup 0.5.1 arm64.exe')
    expect(await readFile(join(output, 'latest-linux-arm64.yml'), 'utf8')).toContain('aivplayer-0.5.1-arm64.AppImage')
    await expect(readFile(join(output, 'release-manifest.json'), 'utf8')).resolves.toContain('v0.5.1')
    await expect(access(join(output, 'AIVPlayer.exe'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(output, 'ffmpeg.exe'))).rejects.toMatchObject({ code: 'ENOENT' })

    const evidenceResult = await runEvidenceCheck(output)
    expect(evidenceResult.stdout).toContain('Platform evidence verified: macos, windows, linux, 13 artifact(s)')
    const windowsReport = JSON.parse(await readFile(join(output, 'platform-release-report-windows.json'), 'utf8')) as { artifacts: Array<{ name: string }> }
    expect(windowsReport.artifacts.map(({ name }) => name)).toEqual([
      'AIVPlayer Setup 0.5.1 arm64.exe',
      'AIVPlayer Setup 0.5.1 x64.exe',
      'latest.yml'
    ])
  })

  it('rejects mixed Windows metadata versions before publishing', async () => {
    const input = await createFixture()
    await writeFile(join(input, 'windows-arm64', 'latest.yml'), metadata('0.5.2', 'AIVPlayer Setup 0.5.2 arm64.exe'))
    await expect(runAssembly(input, join(input, 'assembled'))).rejects.toThrow('versions differ')
  })
})
