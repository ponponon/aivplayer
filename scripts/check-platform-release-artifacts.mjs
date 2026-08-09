import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listReleaseArtifacts } from './release-artifact-policy.mjs'

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
    metadata: ['latest-linux.yml']
  }
}

function readOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--platform') options.platform = value
    else if (item === '--artifacts-dir') options.artifactsDir = value
    else continue
    index += 1
  }
  return options
}

function extensionOf(name) {
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith('.appimage')) return '.appimage'
  if (lowerName.endsWith('.blockmap')) return '.blockmap'
  return lowerName.slice(lowerName.lastIndexOf('.'))
}

export async function checkPlatformReleaseArtifacts(options = {}) {
  const platform = options.platform ?? process.env.RELEASE_PLATFORM
  const contract = PLATFORM_CONTRACTS[platform]
  if (!contract) throw new Error(`Unsupported release platform: ${String(platform)}`)
  const artifactsDirectory = resolve(options.artifactsDir ?? process.env.ARTIFACTS_DIR ?? 'release')
  const files = await listReleaseArtifacts(artifactsDirectory, { includeManifest: false })
  if (files.length === 0) throw new Error(`No platform release artifacts found under ${artifactsDirectory}.`)
  const names = files.map((file) => basename(file))
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
  if (missingPackages.length > 0 || missingMetadata.length > 0 || unexpectedMetadata.length > 0 || unexpectedPackages.length > 0) {
    throw new Error([
      `Platform ${platform} release artifact contract failed.`,
      `missing packages: ${missingPackages.join(', ') || 'none'}`,
      `missing metadata: ${missingMetadata.join(', ') || 'none'}`,
      `unexpected metadata: ${unexpectedMetadata.join(', ') || 'none'}`,
      `unexpected packages: ${unexpectedPackages.join(', ') || 'none'}`
    ].join(' '))
  }
  return {
    ok: true,
    platform,
    artifactCount: files.length,
    packageExtensions: contract.packages,
    metadata: contract.metadata
  }
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
