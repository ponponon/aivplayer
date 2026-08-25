import { mkdir, open, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { sha256File } from './release-manifest.mjs'

function readOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--architecture') options.architecture = value
    else if (item === '--artifacts-dir') options.artifactsDir = value
    else if (item === '--report-path') options.reportPath = value
    else continue
    index += 1
  }
  return options
}

function hasArchitectureToken(name, architecture) {
  const lowerName = name.toLowerCase()
  return architecture === 'arm64'
    ? lowerName.includes('arm64') || lowerName.includes('aarch64')
    : lowerName.includes('x64') || lowerName.includes('amd64') || lowerName.includes('x86_64')
}

export async function checkSnapReleaseArtifact(options = {}) {
  const architecture = options.architecture ?? process.env.RELEASE_ARCHITECTURE
  if (architecture !== 'x64' && architecture !== 'arm64') throw new Error(`Unsupported Snap architecture: ${String(architecture)}`)
  const artifactsDirectory = resolve(options.artifactsDir ?? process.env.ARTIFACTS_DIR ?? 'release')
  const names = await readdir(artifactsDirectory)
  const snapNames = names.filter((name) => name.toLowerCase().endsWith('.snap'))
  if (snapNames.length !== 1) throw new Error(`Expected exactly one Snap artifact under ${artifactsDirectory}, found ${snapNames.length}.`)
  const name = snapNames[0]
  if (!hasArchitectureToken(name, architecture)) throw new Error(`Snap artifact has wrong architecture: ${name}`)
  const filePath = join(artifactsDirectory, name)
  const fileStat = await stat(filePath)
  const handle = await open(filePath, 'r')
  const prefix = Buffer.alloc(4)
  try {
    await handle.read(prefix, 0, prefix.length, 0)
  } finally {
    await handle.close()
  }
  if (fileStat.size === 0 || prefix.toString() !== 'hsqs') throw new Error(`Snap artifact is not a valid SquashFS file: ${name}`)
  const report = {
    schemaVersion: 1,
    ok: true,
    platform: 'linux',
    architecture,
    generatedAt: new Date().toISOString(),
    artifactCount: 1,
    packageExtensions: ['.snap'],
    metadata: [],
    artifacts: [{ name, sizeBytes: fileStat.size, sha256: await sha256File(filePath) }]
  }
  if (options.reportPath) {
    const reportPath = resolve(options.reportPath)
    await mkdir(dirname(reportPath), { recursive: true })
    const temporaryPath = `${reportPath}.${process.pid}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, reportPath)
  }
  return report
}

async function main() {
  const result = await checkSnapReleaseArtifact(readOptions(process.argv.slice(2)))
  console.log(`Snap release artifact verified: ${result.architecture}, ${result.artifacts[0].name}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
