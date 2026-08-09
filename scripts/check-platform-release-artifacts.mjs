import { mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isReleaseArtifact } from './release-artifact-policy.mjs'
import { sha256File } from './release-manifest.mjs'

export const PLATFORM_CONTRACTS = {
  macos: {
    packages: ['.dmg', '.zip', '.pkg'],
    metadata: ['latest-mac.yml']
  },
  windows: {
    packages: ['.exe'],
    metadata: ['latest.yml']
  },
  linux: {
    packages: ['.AppImage', '.deb'],
    metadata: ['latest-linux.yml', 'latest-linux-arm64.yml']
  }
}

function readOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--platform') options.platform = value
    else if (item === '--architecture') options.architecture = value
    else if (item === '--artifacts-dir') options.artifactsDir = value
    else if (item === '--report-path') options.reportPath = value
    else continue
    index += 1
  }
  return options
}

function getPlatformContract(platform, architecture) {
  const contract = PLATFORM_CONTRACTS[platform]
  if (!contract) throw new Error(`Unsupported release platform: ${String(platform)}`)
  if (!architecture) return contract
  if (architecture !== 'x64' && architecture !== 'arm64') throw new Error(`Unsupported release architecture: ${String(architecture)}`)
  if (platform === 'linux') {
    return {
      ...contract,
      metadata: architecture === 'arm64' ? ['latest-linux-arm64.yml'] : ['latest-linux.yml']
    }
  }
  return contract
}

function extensionOf(name) {
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith('.appimage')) return '.appimage'
  if (lowerName.endsWith('.blockmap')) return '.blockmap'
  return lowerName.slice(lowerName.lastIndexOf('.'))
}

async function listTopLevelReleaseArtifacts(directory) {
  const root = resolve(directory)
  const entries = await readdir(root, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && isReleaseArtifact(entry.name) && entry.name !== 'release-manifest.json')
    .map((entry) => join(root, entry.name))
    .sort((left, right) => left.localeCompare(right))
}

export async function checkPlatformReleaseArtifacts(options = {}) {
  const platform = options.platform ?? process.env.RELEASE_PLATFORM
  const architecture = options.architecture ?? process.env.RELEASE_ARCHITECTURE
  const contract = getPlatformContract(platform, architecture)
  const artifactsDirectory = resolve(options.artifactsDir ?? process.env.ARTIFACTS_DIR ?? 'release')
  const files = await listTopLevelReleaseArtifacts(artifactsDirectory)
  if (files.length === 0) throw new Error(`No platform release artifacts found under ${artifactsDirectory}.`)
  const names = files.map((file) => basename(file))
  const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index)
  if (duplicateNames.length > 0) throw new Error(`Platform ${platform} release artifacts contain duplicate names: ${[...new Set(duplicateNames)].join(', ')}`)
  const lowerNames = names.map((name) => name.toLowerCase())
  const requiredPackages = contract.packages.map((extension) => extension.toLowerCase())
  const foundPackages = requiredPackages.filter((extension) => lowerNames.some((name) => name.endsWith(extension)))
  const missingPackages = requiredPackages.filter((extension) => !foundPackages.includes(extension))
  const missingMetadata = contract.metadata.filter((name) => !names.includes(name))
  const expectedMetadata = new Set(contract.metadata)
  const unexpectedMetadata = names.filter((name) => /^latest(?:-[^/]+)?\.yml$/i.test(name) && !expectedMetadata.has(name))
  const allowedExtensions = new Set([...requiredPackages, '.blockmap'])
  const unexpectedPackages = names.filter((name) => {
    const extension = extensionOf(name)
    return extension !== '.yml' && !allowedExtensions.has(extension)
  })
  const packageNames = names.filter((name) => requiredPackages.some((extension) => name.toLowerCase().endsWith(extension)))
  const wrongArchitecturePackages = architecture
    ? packageNames.filter((name) => !name.toLowerCase().includes(architecture.toLowerCase()))
    : []
  if (missingPackages.length > 0 || missingMetadata.length > 0 || unexpectedMetadata.length > 0 || unexpectedPackages.length > 0 || wrongArchitecturePackages.length > 0) {
    throw new Error([
      `Platform ${platform} release artifact contract failed.`,
      `missing packages: ${missingPackages.join(', ') || 'none'}`,
      `missing metadata: ${missingMetadata.join(', ') || 'none'}`,
      `unexpected metadata: ${unexpectedMetadata.join(', ') || 'none'}`,
      `unexpected packages: ${unexpectedPackages.join(', ') || 'none'}`,
      `wrong architecture packages: ${wrongArchitecturePackages.join(', ') || 'none'}`
    ].join(' '))
  }
  const artifacts = await Promise.all(files.map(async (file) => ({
    name: basename(file),
    sizeBytes: (await stat(file)).size,
    sha256: await sha256File(file)
  })))
  const result = {
    schemaVersion: 1,
    ok: true,
    platform,
    ...(architecture ? { architecture } : {}),
    generatedAt: new Date().toISOString(),
    artifactCount: artifacts.length,
    packageExtensions: contract.packages,
    metadata: contract.metadata,
    artifacts
  }
  if (options.reportPath) {
    const reportPath = resolve(options.reportPath)
    await mkdir(dirname(reportPath), { recursive: true })
    const temporaryPath = `${reportPath}.${process.pid}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, reportPath)
  }
  return result
}

async function main() {
  const result = await checkPlatformReleaseArtifacts(readOptions(process.argv.slice(2)))
  console.log(`Platform release artifacts verified: ${result.platform}, ${result.artifactCount} artifact(s)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
