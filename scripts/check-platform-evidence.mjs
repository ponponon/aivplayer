import { readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PLATFORM_CONTRACTS } from './check-platform-release-artifacts.mjs'
import { RELEASE_MANIFEST_NAME, listReleaseArtifacts } from './release-artifact-policy.mjs'
import { sha256File } from './release-manifest.mjs'

const EVIDENCE_REPORT_PATTERN = /^platform-release-report-(macos|windows|linux)\.json$/

function readOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--artifacts-dir') options.artifactsDir = value
    else continue
    index += 1
  }
  return options
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right))
}

function assertReportShape(report, platform, reportPath) {
  const contract = PLATFORM_CONTRACTS[platform]
  if (!report || typeof report !== 'object') throw new Error(`Evidence report is not an object: ${reportPath}`)
  if (report.schemaVersion !== 1 || report.platform !== platform) throw new Error(`Evidence report header mismatch: ${reportPath}`)
  if (JSON.stringify(sorted(report.packageExtensions ?? [])) !== JSON.stringify(sorted(contract.packages))) throw new Error(`Evidence report package contract mismatch: ${reportPath}`)
  if (JSON.stringify(sorted(report.metadata ?? [])) !== JSON.stringify(sorted(contract.metadata))) throw new Error(`Evidence report metadata contract mismatch: ${reportPath}`)
  if (!Array.isArray(report.artifacts) || report.artifacts.length === 0) throw new Error(`Evidence report has no artifacts: ${reportPath}`)
  if (report.artifactCount !== report.artifacts.length) throw new Error(`Evidence report artifact count mismatch: ${reportPath}`)
  const names = new Set()
  for (const artifact of report.artifacts) {
    if (!artifact || typeof artifact !== 'object' || typeof artifact.name !== 'string' || !artifact.name) throw new Error(`Evidence report contains invalid artifact: ${reportPath}`)
    if (names.has(artifact.name)) throw new Error(`Evidence report contains duplicate artifact: ${artifact.name}`)
    names.add(artifact.name)
    if (!Number.isInteger(artifact.sizeBytes) || artifact.sizeBytes < 0 || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error(`Evidence report contains invalid hash entry: ${artifact.name}`)
  }
  return report
}

export async function checkPlatformEvidence(options = {}) {
  const artifactsDirectory = resolve(options.artifactsDir ?? process.env.ARTIFACTS_DIR ?? 'artifacts')
  const reportPaths = new Map()
  for (const platform of Object.keys(PLATFORM_CONTRACTS)) {
    const reportPath = join(artifactsDirectory, `platform-release-report-${platform}.json`)
    try {
      const report = assertReportShape(JSON.parse(await readFile(reportPath, 'utf8')), platform, reportPath)
      reportPaths.set(platform, { report, reportPath })
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`Missing platform evidence report: ${basename(reportPath)}`)
      throw error
    }
  }

  const files = await listReleaseArtifacts(artifactsDirectory, { includeManifest: false })
  const filesByName = new Map()
  for (const file of files) {
    const name = basename(file)
    if (filesByName.has(name)) throw new Error(`Merged release artifacts contain duplicate names: ${name}`)
    filesByName.set(name, file)
  }

  const expectedByName = new Map()
  for (const { report } of reportPaths.values()) {
    for (const artifact of report.artifacts) {
      if (expectedByName.has(artifact.name)) throw new Error(`Platform evidence reports overlap on artifact: ${artifact.name}`)
      expectedByName.set(artifact.name, artifact)
    }
  }
  const expectedNames = new Set(expectedByName.keys())
  const actualNames = new Set(filesByName.keys())
  const missing = sorted([...expectedNames].filter((name) => !actualNames.has(name)))
  const unexpected = sorted([...actualNames].filter((name) => !expectedNames.has(name) && name !== RELEASE_MANIFEST_NAME))
  if (missing.length > 0 || unexpected.length > 0) throw new Error(`Merged release evidence file set mismatch. Missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`)

  for (const [name, expected] of expectedByName) {
    const filePath = filesByName.get(name)
    const fileStat = await stat(filePath)
    if (fileStat.size !== expected.sizeBytes) throw new Error(`Merged release evidence size changed: ${name}`)
    const actualHash = await sha256File(filePath)
    if (actualHash !== expected.sha256) throw new Error(`Merged release evidence SHA-256 changed: ${name}`)
  }
  return {
    ok: true,
    platforms: [...reportPaths.keys()],
    artifactCount: expectedByName.size,
    reports: [...reportPaths.values()].map(({ reportPath }) => basename(reportPath))
  }
}

async function main() {
  const result = await checkPlatformEvidence(readOptions(process.argv.slice(2)))
  console.log(`Platform evidence verified: ${result.platforms.join(', ')}, ${result.artifactCount} artifact(s)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
