import { open, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listReleaseArtifacts } from './release-artifact-policy.mjs'
import { PLATFORM_CONTRACTS } from './check-platform-release-artifacts.mjs'

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

function hasPrefix(buffer, expected) {
  return buffer.subarray(0, expected.length).equals(Buffer.from(expected))
}

function hasDmgTrailer(buffer) {
  return buffer.subarray(0, 4).equals(Buffer.from('koly'))
}

async function readFileEdges(filePath, fileSize) {
  const handle = await open(filePath, 'r')
  try {
    const prefix = Buffer.alloc(Math.min(8, fileSize))
    const trailer = Buffer.alloc(Math.min(512, fileSize))
    await handle.read(prefix, 0, prefix.length, 0)
    await handle.read(trailer, 0, trailer.length, Math.max(0, fileSize - trailer.length))
    return { prefix, trailer }
  } finally {
    await handle.close()
  }
}

function validateEdges(extension, edges) {
  switch (extension.toLowerCase()) {
    case '.dmg':
      return hasDmgTrailer(edges.trailer)
    case '.zip':
      return hasPrefix(edges.prefix, 'PK\u0003\u0004') || hasPrefix(edges.prefix, 'PK\u0005\u0006') || hasPrefix(edges.prefix, 'PK\u0007\u0008')
    case '.exe':
      return hasPrefix(edges.prefix, 'MZ')
    case '.appimage':
      return edges.prefix.length >= 4 && edges.prefix[0] === 0x7f && edges.prefix.subarray(1, 4).equals(Buffer.from('ELF'))
    case '.deb':
      return hasPrefix(edges.prefix, '!<arch>\n')
    case '.snap':
      // Squashfs superblock magic (little-endian 0x73717368 -> "hsqs")
      return hasPrefix(edges.prefix, 'hsqs')
    default:
      return false
  }
}

function packageExtension(name) {
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith('.appimage')) return '.appimage'
  return lowerName.slice(lowerName.lastIndexOf('.'))
}

export async function checkReleasePackageFormats(options = {}) {
  const platform = options.platform ?? process.env.RELEASE_PLATFORM
  const contract = PLATFORM_CONTRACTS[platform]
  if (!contract) throw new Error(`Unsupported release platform: ${String(platform)}`)
  const artifactsDirectory = resolve(options.artifactsDir ?? process.env.ARTIFACTS_DIR ?? 'release')
  const files = await listReleaseArtifacts(artifactsDirectory, { includeManifest: false })
  const packageFiles = files.filter((file) => contract.packages.some((extension) => packageExtension(basename(file)) === extension.toLowerCase()))
  if (packageFiles.length === 0) throw new Error(`No package files found for platform ${platform}.`)

  const failures = []
  const checked = []
  for (const file of packageFiles) {
    const fileName = basename(file)
    const fileStat = await stat(file)
    const extension = packageExtension(fileName)
    const valid = fileStat.size > 0 && validateEdges(extension, await readFileEdges(file, fileStat.size))
    checked.push(fileName)
    if (!valid) failures.push(fileName)
  }
  if (failures.length > 0) throw new Error(`Release package format check failed for ${platform}: ${failures.join(', ')}`)
  return { ok: true, platform, checked }
}

async function main() {
  const result = await checkReleasePackageFormats(readOptions(process.argv.slice(2)))
  console.log(`Release package formats verified: ${result.platform}, ${result.checked.length} package(s)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
