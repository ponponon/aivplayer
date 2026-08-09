import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RELEASE_MANIFEST_NAME, listReleaseArtifacts } from './release-artifact-policy.mjs'

export const RELEASE_MANIFEST_SCHEMA_VERSION = 1

async function sha256(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

function assertUniqueArtifactNames(files) {
  const names = new Set()
  for (const filePath of files) {
    const name = basename(filePath)
    if (names.has(name)) throw new Error(`Duplicate release artifact name: ${name}`)
    names.add(name)
  }
}

async function buildArtifactEntries(files) {
  assertUniqueArtifactNames(files)
  const entries = await Promise.all(files.map(async (filePath) => {
    const fileStat = await stat(filePath)
    return {
      name: basename(filePath),
      sizeBytes: fileStat.size,
      sha256: await sha256(filePath)
    }
  }))
  return entries.sort((left, right) => left.name.localeCompare(right.name))
}

export async function createReleaseManifest(options = {}) {
  const artifactsDirectory = resolve(options.artifactsDir ?? process.env.ARTIFACTS_DIR ?? 'artifacts')
  const tag = options.tag ?? process.env.RELEASE_TAG
  if (!tag) throw new Error('Release tag is required to create the release manifest.')
  const files = await listReleaseArtifacts(artifactsDirectory, { includeManifest: false })
  if (files.length === 0) throw new Error(`No release artifacts found under ${artifactsDirectory}.`)
  const manifest = {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    tag,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    artifacts: await buildArtifactEntries(files)
  }
  const manifestPath = options.manifestPath ?? join(artifactsDirectory, RELEASE_MANIFEST_NAME)
  await mkdir(resolve(manifestPath, '..'), { recursive: true })
  const temporaryPath = `${manifestPath}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, manifestPath)
  return { manifest, manifestPath, files }
}

function assertManifestShape(value) {
  if (!value || typeof value !== 'object') throw new Error('Release manifest must be a JSON object.')
  if (value.schemaVersion !== RELEASE_MANIFEST_SCHEMA_VERSION) throw new Error(`Unsupported release manifest schema: ${String(value.schemaVersion)}`)
  if (typeof value.tag !== 'string' || !value.tag) throw new Error('Release manifest tag is missing.')
  if (!Array.isArray(value.artifacts) || value.artifacts.length === 0) throw new Error('Release manifest has no artifacts.')
  const names = new Set()
  for (const artifact of value.artifacts) {
    if (!artifact || typeof artifact !== 'object' || typeof artifact.name !== 'string' || !artifact.name) throw new Error('Release manifest contains an invalid artifact name.')
    if (names.has(artifact.name)) throw new Error(`Release manifest contains duplicate artifact: ${artifact.name}`)
    names.add(artifact.name)
    if (!Number.isInteger(artifact.sizeBytes) || artifact.sizeBytes < 0) throw new Error(`Invalid artifact size in manifest: ${artifact.name}`)
    if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error(`Invalid SHA-256 in manifest: ${artifact.name}`)
  }
  return value
}

export async function verifyReleaseManifest(options = {}) {
  const artifactsDirectory = resolve(options.artifactsDir ?? process.env.ARTIFACTS_DIR ?? 'artifacts')
  const manifestPath = options.manifestPath ?? join(artifactsDirectory, RELEASE_MANIFEST_NAME)
  const manifest = assertManifestShape(JSON.parse(await readFile(manifestPath, 'utf8')))
  if (options.tag && manifest.tag !== options.tag) throw new Error(`Release manifest tag mismatch: expected ${options.tag}, got ${manifest.tag}`)

  const files = await listReleaseArtifacts(artifactsDirectory, { includeManifest: false })
  assertUniqueArtifactNames(files)
  const filesByName = new Map(files.map((filePath) => [basename(filePath), filePath]))
  const expectedNames = new Set(manifest.artifacts.map((artifact) => artifact.name))
  const actualNames = new Set(filesByName.keys())
  const missing = [...expectedNames].filter((name) => !actualNames.has(name))
  const unexpected = [...actualNames].filter((name) => !expectedNames.has(name))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(`Release manifest file set mismatch. Missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`)
  }

  for (const artifact of manifest.artifacts) {
    const filePath = filesByName.get(artifact.name)
    const fileStat = await stat(filePath)
    if (fileStat.size !== artifact.sizeBytes) throw new Error(`Release artifact size changed: ${artifact.name}`)
    const actualHash = await sha256(filePath)
    if (actualHash !== artifact.sha256) throw new Error(`Release artifact SHA-256 changed: ${artifact.name}`)
  }
  return { ok: true, manifest, files }
}

function readOptions(argv) {
  const options = { verify: false }
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (item === '--verify') {
      options.verify = true
      continue
    }
    if (!value || value.startsWith('--')) continue
    if (item === '--artifacts-dir') options.artifactsDir = value
    else if (item === '--manifest-path') options.manifestPath = value
    else if (item === '--tag') options.tag = value
    else continue
    index += 1
  }
  return options
}

async function main() {
  const options = readOptions(process.argv.slice(2))
  if (options.verify) {
    const result = await verifyReleaseManifest(options)
    console.log(`Release manifest verified: ${result.manifest.artifacts.length} artifact(s), tag ${result.manifest.tag}`)
    return
  }
  const result = await createReleaseManifest(options)
  console.log(`Release manifest written: ${result.manifestPath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
