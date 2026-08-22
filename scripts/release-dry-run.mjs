import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { checkPlatformEvidence } from './check-platform-evidence.mjs'
import { checkPlatformReleaseArtifacts, PLATFORM_CONTRACTS } from './check-platform-release-artifacts.mjs'
import { checkReleasePackageFormats } from './check-release-package-formats.mjs'
import { checkReleaseVersion } from './check-release-version.mjs'
import { createReleaseManifest, verifyReleaseManifest } from './release-manifest.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE_SIGNATURES = {
  '.dmg': () => {
    const buffer = Buffer.alloc(512)
    buffer.write('koly')
    return buffer
  },
  '.zip': () => Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  '.exe': () => Buffer.from('MZdry-run'),
  '.AppImage': () => Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
  '.deb': () => Buffer.from('!<arch>\ndry-run'),
  '.snap': () => Buffer.from('hsqs' + 'dry-run-snap')
}

function packageName(version, suffix) {
  return `AIVPlayer-${version}-${suffix}`
}

function metadataContent(version, artifactNames) {
  const names = Array.isArray(artifactNames) ? artifactNames : [artifactNames]
  return [
    `version: ${version}`,
    'files:',
    ...names.flatMap((name) => [`  - url: ${name}`, '    sha512: dry-run', `    size: ${name.length}`]),
    ''
  ].join('\n')
}

async function writePackage(directory, name) {
  const extension = Object.keys(PACKAGE_SIGNATURES).find((candidate) => name.endsWith(candidate))
  if (!extension) throw new Error(`Unsupported dry-run package extension: ${name}`)
  await writeFile(join(directory, name), PACKAGE_SIGNATURES[extension]())
}

async function writeDryRunArtifacts(directory, version, platform) {
  const macZip = packageName(version, 'arm64-mac.zip')
  const windowsX64Exe = packageName(version, 'x64.exe')
  const windowsArm64Exe = packageName(version, 'arm64.exe')
  const linuxX64AppImage = packageName(version, 'x64.AppImage')
  const linuxArm64AppImage = packageName(version, 'arm64.AppImage')
  const fixtures = {
    macos: [
      ['package', packageName(version, 'arm64.dmg')],
      ['package', macZip],
      ['metadata', 'latest-mac.yml', macZip]
    ],
    windows: [
      ['package', windowsX64Exe],
      ['package', windowsArm64Exe],
      ['metadata', 'latest.yml', [windowsX64Exe, windowsArm64Exe]]
    ],
    linux: [
      ['package', linuxX64AppImage],
      ['package', packageName(version, 'x64.deb')],
      ['package', packageName(version, 'x64.snap')],
      ['metadata', 'latest-linux.yml', linuxX64AppImage],
      ['package', linuxArm64AppImage],
      ['package', packageName(version, 'arm64.deb')],
      ['metadata', 'latest-linux-arm64.yml', linuxArm64AppImage]
    ]
  }[platform]
  if (!fixtures) throw new Error(`Unsupported dry-run platform: ${platform}`)
  await Promise.all(fixtures.map(([kind, name, artifactName]) => kind === 'package'
    ? writePackage(directory, name)
    : writeFile(join(directory, name), metadataContent(version, artifactName))))
}

export async function runReleaseDryRun(options = {}) {
  const packageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
  const version = packageJson?.version
  if (typeof version !== 'string' || !version) throw new Error('package.json version is required for release dry-run.')
  const tag = `v${version}`
  const directory = options.artifactsDir ? resolve(options.artifactsDir) : await mkdtemp(join(tmpdir(), 'aivplayer-release-dry-run-'))
  const ownsDirectory = !options.artifactsDir

  try {
    const platformDirectories = Object.fromEntries(Object.keys(PLATFORM_CONTRACTS).map((platform) => [platform, join(directory, platform)]))
    await Promise.all(Object.entries(platformDirectories).map(async ([platform, platformDirectory]) => {
      await mkdir(platformDirectory, { recursive: true })
      await writeDryRunArtifacts(platformDirectory, version, platform)
    }))
    const platformResults = {}
    for (const platform of Object.keys(PLATFORM_CONTRACTS)) {
      const platformDirectory = platformDirectories[platform]
      platformResults[platform] = {
        contract: await checkPlatformReleaseArtifacts({
          platform,
          artifactsDir: platformDirectory,
          reportPath: join(platformDirectory, `platform-release-report-${platform}.json`)
        }),
        formats: await checkReleasePackageFormats({ platform, artifactsDir: platformDirectory })
      }
      for (const fileName of await readdir(platformDirectory)) {
        await copyFile(join(platformDirectory, fileName), join(directory, fileName))
      }
      await rm(platformDirectory, { recursive: true, force: true })
    }
    const evidence = await checkPlatformEvidence({ artifactsDir: directory })
    const versionCheck = await checkReleaseVersion({ artifactsDir: directory, packageJson: join(projectRoot, 'package.json'), tag })
    const manifestResult = await createReleaseManifest({
      artifactsDir: directory,
      tag,
      generatedAt: '2000-01-01T00:00:00.000Z',
      commit: '0'.repeat(40),
      repository: 'local/aivplayer',
      workflow: 'Local release dry-run',
      workflowRunId: '1',
      workflowRunAttempt: '1'
    })
    const manifestCheck = await verifyReleaseManifest({
      artifactsDir: directory,
      manifestPath: manifestResult.manifestPath,
      tag
    })
    return {
      ok: true,
      artifactsDir: directory,
      tag,
      artifactCount: manifestCheck.manifest.artifacts.length,
      platforms: Object.fromEntries(Object.entries(platformResults).map(([platform, result]) => [platform, {
        artifactCount: result.contract.artifactCount,
        packageCount: result.formats.checked.length
      }])),
      evidence,
      versionCheck,
      manifest: manifestCheck.manifest,
      manifestPath: manifestResult.manifestPath
    }
  } finally {
    if (ownsDirectory && !options.keepDirectory) await rm(directory, { recursive: true, force: true })
  }
}

function readOptions(argv) {
  const options = {}
  for (const item of argv) {
    if (item === '--keep-dir') options.keepDirectory = true
  }
  return options
}

async function main() {
  const result = await runReleaseDryRun(readOptions(process.argv.slice(2)))
  const directoryMessage = result.artifactsDir && readOptions(process.argv.slice(2)).keepDirectory
    ? `, artifacts kept at ${result.artifactsDir}`
    : ', temporary artifacts removed'
  console.log(`Release dry-run passed: ${result.artifactCount} artifact(s), ${Object.keys(result.platforms).length} platform(s)${directoryMessage}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
