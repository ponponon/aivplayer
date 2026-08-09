import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listReleaseArtifacts } from './release-artifact-policy.mjs'

const UPDATE_METADATA_PATTERN = /^latest(?:-[^/]+)?\.yml$/i
const PACKAGE_FILE_PATTERN = /\.(?:dmg|zip|pkg|exe|AppImage|deb|blockmap)$/i
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

function readOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--artifacts-dir') options.artifactsDir = value
    else if (item === '--tag') options.tag = value
    else if (item === '--package-json') options.packageJson = value
    else continue
    index += 1
  }
  return options
}

function parseMetadataVersion(content, fileName) {
  const match = content.match(/^version:\s*(['"]?)([^'"\s]+)\1\s*$/m)
  if (!match) throw new Error(`Update metadata has no version field: ${fileName}`)
  return match[2]
}

function extractMetadataReferences(content) {
  const references = []
  const pattern = /^\s*(?:-\s+)?(?:url|path):\s*(['"]?)([^'"\s]+)\1\s*$/gm
  for (const match of content.matchAll(pattern)) references.push({ field: match[0].includes('path:') ? 'path' : 'url', value: match[2] })
  return references
}

function referenceFileName(reference) {
  try {
    const parsed = new URL(reference)
    return decodeURIComponent(basename(parsed.pathname))
  } catch {
    return decodeURIComponent(basename(reference.split('#', 1)[0].split('?', 1)[0]))
  }
}

function assertUniqueNames(files) {
  const names = new Set()
  for (const file of files) {
    const name = basename(file)
    if (names.has(name)) throw new Error(`Release artifacts contain duplicate names: ${name}`)
    names.add(name)
  }
  return names
}

export async function checkReleaseVersion(options = {}) {
  const artifactsDirectory = resolve(options.artifactsDir ?? process.env.ARTIFACTS_DIR ?? 'artifacts')
  const packageJsonPath = resolve(options.packageJson ?? 'package.json')
  const tag = options.tag ?? process.env.RELEASE_TAG
  if (!tag) throw new Error('Release tag is required.')
  if (!/^v/.test(tag)) throw new Error(`Release tag must start with v: ${tag}`)

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  const packageVersion = packageJson?.version
  if (typeof packageVersion !== 'string' || !VERSION_PATTERN.test(packageVersion)) {
    throw new Error(`Invalid package version: ${String(packageVersion)}`)
  }
  if (tag !== `v${packageVersion}`) throw new Error(`Release tag/version mismatch: tag ${tag}, package ${packageVersion}`)

  const files = await listReleaseArtifacts(artifactsDirectory, { includeManifest: false })
  if (files.length === 0) throw new Error(`No release artifacts found under ${artifactsDirectory}.`)
  const artifactNames = assertUniqueNames(files)
  const metadataFiles = files.filter((file) => UPDATE_METADATA_PATTERN.test(basename(file)))
  if (metadataFiles.length === 0) throw new Error('No electron-updater latest*.yml metadata found in release artifacts.')

  const metadata = []
  for (const file of metadataFiles) {
    const fileName = basename(file)
    const content = await readFile(file, 'utf8')
    const metadataVersion = parseMetadataVersion(content, fileName)
    if (metadataVersion !== packageVersion) throw new Error(`Update metadata version mismatch: ${fileName} has ${metadataVersion}, expected ${packageVersion}`)
    const references = extractMetadataReferences(content)
    if (references.length === 0) throw new Error(`Update metadata has no package references: ${fileName}`)
    for (const reference of references) {
      const referencedName = referenceFileName(reference.value)
      if (!artifactNames.has(referencedName)) throw new Error(`Update metadata ${fileName} references missing artifact: ${referencedName}`)
    }
    metadata.push({ name: fileName, version: metadataVersion, references: references.map((reference) => referenceFileName(reference.value)) })
  }

  const packageFiles = files.filter((file) => PACKAGE_FILE_PATTERN.test(basename(file)))
  for (const file of packageFiles) {
    if (!basename(file).includes(packageVersion)) throw new Error(`Release artifact filename does not contain package version ${packageVersion}: ${basename(file)}`)
  }
  return { ok: true, tag, packageVersion, artifactCount: files.length, metadata }
}

async function main() {
  const cliOptions = readOptions(process.argv.slice(2))
  const result = await checkReleaseVersion({
    ...cliOptions,
    tag: cliOptions.tag ?? process.env.RELEASE_TAG
  })
  console.log(`Release version verified: ${result.tag}, ${result.metadata.length} update metadata file(s)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
