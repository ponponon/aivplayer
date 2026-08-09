import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isReleaseArtifact, listReleaseArtifacts } from './release-artifact-policy.mjs'

const PACKAGE_EXTENSIONS = ['.dmg', '.zip', '.pkg', '.exe', '.AppImage', '.deb', '.blockmap']

function readOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--input-dir') options.inputDir = value
    else if (item === '--output-dir') options.outputDir = value
    else continue
    index += 1
  }
  return options
}

function isPackageArtifact(name) {
  return PACKAGE_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension.toLowerCase()))
}

async function findMetadata(directory, candidates, label) {
  const files = await readdir(directory)
  for (const candidate of candidates) {
    if (files.includes(candidate)) return join(directory, candidate)
  }
  throw new Error(`Missing ${label} update metadata under ${directory}: ${candidates.join(', ')}`)
}

function parseWindowsMetadata(content, fileName) {
  const version = content.match(/^version:\s*([^\s]+)\s*$/m)?.[1]
  if (!version) throw new Error(`Windows update metadata has no version: ${fileName}`)

  const lines = content.split(/\r?\n/)
  const filesIndex = lines.findIndex((line) => line.trim() === 'files:')
  if (filesIndex < 0) throw new Error(`Windows update metadata has no files section: ${fileName}`)

  const entries = []
  let current = []
  for (let index = filesIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line && !/^\s/.test(line)) break
    if (/^\s+-\s+/.test(line)) {
      if (current.length > 0) entries.push(current)
      current = [line]
    } else if (current.length > 0 && line.trim()) {
      current.push(line)
    }
  }
  if (current.length > 0) entries.push(current)
  if (entries.length === 0) throw new Error(`Windows update metadata has no file entries: ${fileName}`)

  const releaseDate = lines.find((line) => /^releaseDate:\s*/.test(line))?.trim()
  return { version, entries, releaseDate }
}

function mergeWindowsMetadata(values) {
  const versions = new Set(values.map((value) => value.version))
  if (versions.size !== 1) throw new Error(`Windows update metadata versions differ: ${[...versions].join(', ')}`)
  const entries = values.flatMap((value) => value.entries)
  const names = entries.map((entry) => entry.find((line) => /url:\s*/.test(line))?.trim())
  if (names.some((name) => !name) || new Set(names).size !== names.length) {
    throw new Error('Windows update metadata contains missing or duplicate file URLs.')
  }
  const releaseDate = values.find((value) => value.releaseDate)?.releaseDate
  return [
    `version: ${values[0].version}`,
    'files:',
    ...entries.flat(),
    ...(releaseDate ? [releaseDate] : [])
  ].join('\n') + '\n'
}

async function copyUnique(sourcePath, outputDirectory, copiedNames) {
  const name = basename(sourcePath)
  if (copiedNames.has(name)) throw new Error(`Release artifact name collision during assembly: ${name}`)
  if (!isReleaseArtifact(name)) return
  await mkdir(outputDirectory, { recursive: true })
  await copyFile(sourcePath, join(outputDirectory, name))
  copiedNames.add(name)
}

async function copyPackages(sourceDirectories, outputDirectory) {
  const copiedNames = new Set()
  for (const directory of sourceDirectories) {
    const files = await listReleaseArtifacts(directory, { includeManifest: false, recursive: false })
    for (const file of files) {
      if (isPackageArtifact(basename(file))) await copyUnique(file, outputDirectory, copiedNames)
    }
  }
  return copiedNames
}

export async function assembleReleaseArtifacts(options = {}) {
  const inputDirectory = resolve(options.inputDir ?? process.env.ARTIFACT_INPUT_DIR ?? 'artifacts')
  const outputDirectory = resolve(options.outputDir ?? process.env.ARTIFACT_OUTPUT_DIR ?? join(inputDirectory, 'assembled'))
  const sourceNames = ['macos', 'windows-x64', 'windows-arm64', 'linux-x64', 'linux-arm64']
  for (const sourceName of sourceNames) {
    try {
      await readdir(join(inputDirectory, sourceName))
    } catch {
      throw new Error(`Missing release build artifact directory: ${sourceName}`)
    }
  }

  await rm(outputDirectory, { recursive: true, force: true })
  await mkdir(outputDirectory, { recursive: true })
  const copiedNames = await copyPackages(sourceNames.map((sourceName) => join(inputDirectory, sourceName)), outputDirectory)

  try {
    await copyUnique(join(inputDirectory, 'release-manifest', 'release-manifest.json'), outputDirectory, copiedNames)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  await copyUnique(join(inputDirectory, 'macos', 'latest-mac.yml'), outputDirectory, copiedNames)

  const windowsMetadata = await Promise.all(['windows-x64', 'windows-arm64'].map(async (sourceName) => {
    const path = await findMetadata(join(inputDirectory, sourceName), ['latest.yml'], `${sourceName} Windows`)
    return parseWindowsMetadata(await readFile(path, 'utf8'), basename(path))
  }))
  await writeFile(join(outputDirectory, 'latest.yml'), mergeWindowsMetadata(windowsMetadata), 'utf8')
  copiedNames.add('latest.yml')

  const linuxMetadata = [
    ['linux-x64', ['latest-linux.yml'], 'Linux x64', 'latest-linux.yml'],
    ['linux-arm64', ['latest-linux-arm64.yml', 'latest-linux.yml'], 'Linux arm64', 'latest-linux-arm64.yml']
  ]
  for (const [sourceName, candidates, label, targetName] of linuxMetadata) {
    const path = await findMetadata(join(inputDirectory, sourceName), candidates, label)
    if (copiedNames.has(targetName)) throw new Error(`Release artifact name collision during assembly: ${targetName}`)
    await copyFile(path, join(outputDirectory, targetName))
    copiedNames.add(targetName)
  }

  return { inputDirectory, outputDirectory, artifactCount: copiedNames.size, artifacts: [...copiedNames].sort() }
}

async function main() {
  const result = await assembleReleaseArtifacts(readOptions(process.argv.slice(2)))
  console.log(`Release artifacts assembled: ${result.artifactCount} artifact(s) at ${result.outputDirectory}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

export { mergeWindowsMetadata, parseWindowsMetadata }
