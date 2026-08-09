import { readdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEFAULT_MAX_MINOS = '12.0'
const RUNTIME_BINARY_NAMES = ['ffmpeg', 'ffprobe'] as const

type RunCommand = (command: string, args: string[]) => Promise<string>

type MacOSFfmpegRuntimeOptions = {
  resourceDir?: string
  maxMinos?: string
  runCommand?: RunCommand
}

function parseVersionParts(value: string, label: string): number[] {
  const normalized = String(value).trim()
  if (!/^\d+(?:\.\d+){0,2}$/.test(normalized)) {
    throw new Error(`Invalid macOS version ${label}: ${normalized}`)
  }
  return normalized.split('.').map((part) => Number(part))
}

export function compareMacOSVersions(left: string, right: string): number {
  const leftParts = parseVersionParts(left, 'left')
  const rightParts = parseVersionParts(right, 'right')
  for (let index = 0; index < 3; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1
  }
  return 0
}

export function parseMachOMinimumVersions(otoolOutput: string, filePath = '<file>'): string[] {
  const blocks = String(otoolOutput).split(/(?=^\s*cmd\s)/m)
  const versions: string[] = []

  for (const block of blocks) {
    if (/\bLC_BUILD_VERSION\b/.test(block)) {
      const match = block.match(/^\s*minos\s+(\d+(?:\.\d+){0,2})\s*$/m)
      if (match?.[1]) versions.push(match[1])
      continue
    }

    if (/\bLC_VERSION_MIN_MACOSX\b/.test(block)) {
      const match = block.match(/^\s*version\s+(\d+(?:\.\d+){0,2})\s*$/m)
      if (match?.[1]) versions.push(match[1])
    }
  }

  if (versions.length === 0) {
    throw new Error(`Could not find macOS deployment target in otool output: ${filePath}`)
  }

  return versions
}

export function parseMachOArchitectures(fileOutput: string, filePath = '<file>'): string[] {
  const output = String(fileOutput).trim()
  if (!output.includes('Mach-O')) {
    throw new Error(`Expected a Mach-O file: ${filePath}; file reported: ${output || '<empty>'}`)
  }

  const architectures: string[] = []
  for (const architecture of ['arm64', 'x86_64']) {
    if (new RegExp(`\\b${architecture}\\b`).test(output)) architectures.push(architecture)
  }

  if (architectures.length === 0) {
    throw new Error(`Unsupported or missing macOS architecture: ${filePath}; file reported: ${output}`)
  }

  return architectures
}

export function assertMacOSMinimumVersions(filePath: string, minimumVersions: string[], maxMinos: string): void {
  const invalidVersions = minimumVersions.filter((version) => compareMacOSVersions(version, maxMinos) > 0)
  if (invalidVersions.length > 0) {
    throw new Error(
      `macOS deployment target is too new for ${filePath}: `
      + `found minos ${invalidVersions.join(', ')}, maximum allowed is ${maxMinos}`
    )
  }
}

export function assertFfmpegVersionOutput(binaryPath: string, output: string): string {
  const firstLine = String(output).split('\n').map((line) => line.trim()).find(Boolean) ?? ''
  const expectedPrefix = basename(binaryPath) === 'ffprobe' ? 'ffprobe version ' : 'ffmpeg version '
  if (!firstLine.startsWith(expectedPrefix)) {
    throw new Error(`Unexpected ${basename(binaryPath)} version output from ${binaryPath}: ${firstLine || '<empty>'}`)
  }
  return firstLine
}

const runCommand: RunCommand = async (command, args) => {
  try {
    const result = await execFileAsync(command, args, {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024
    })
    return result.stdout || result.stderr || ''
  } catch (error: unknown) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr ?? '') : ''
    const detail = stderr.trim() || (error instanceof Error ? error.message : String(error))
    throw new Error(`Command failed: ${command} ${args.join(' ')}\n${detail}`)
  }
}

async function listRuntimeFiles(resourceDir: string): Promise<string[]> {
  const entries = await readdir(resourceDir, { withFileTypes: true })
  const names = entries
    .filter((entry) => entry.isFile() && (RUNTIME_BINARY_NAMES.includes(entry.name as typeof RUNTIME_BINARY_NAMES[number]) || entry.name.endsWith('.dylib')))
    .map((entry) => entry.name)
    .sort()

  const missing = RUNTIME_BINARY_NAMES.filter((name) => !names.includes(name))
  if (missing.length > 0) {
    throw new Error(`Missing macOS FFmpeg runtime binary: ${missing.join(', ')} in ${resourceDir}`)
  }

  return names.map((name) => join(resourceDir, name))
}

export async function checkMacOSFfmpegRuntime(options: MacOSFfmpegRuntimeOptions = {}) {
  const resourceDir = resolve(options.resourceDir ?? process.env.AIVPLAYER_RESOURCE_DIR ?? 'resources/ffmpeg')
  const maxMinos = options.maxMinos ?? process.env.AIVPLAYER_MACOS_MAX_MINOS ?? DEFAULT_MAX_MINOS
  parseVersionParts(maxMinos, 'maxMinos')
  const commandRunner = options.runCommand ?? runCommand
  const runtimeFiles = await listRuntimeFiles(resourceDir)
  const files: Array<{ path: string; architectures: string[]; minimumVersions: string[]; fileOutput: string }> = []

  for (const filePath of runtimeFiles) {
    const fileOutput = await commandRunner('file', [filePath])
    const architectures = parseMachOArchitectures(fileOutput, filePath)
    const otoolOutput = await commandRunner('otool', ['-l', filePath])
    const minimumVersions = parseMachOMinimumVersions(otoolOutput, filePath)
    assertMacOSMinimumVersions(filePath, minimumVersions, maxMinos)
    files.push({ path: filePath, architectures, minimumVersions, fileOutput: fileOutput.trim() })
  }

  const versions: Array<{ path: string; version: string }> = []
  for (const name of RUNTIME_BINARY_NAMES) {
    const binaryPath = join(resourceDir, name)
    const output = await commandRunner(binaryPath, ['-version'])
    versions.push({ path: binaryPath, version: assertFfmpegVersionOutput(binaryPath, output) })
  }

  return { ok: true, resourceDir, maxMinos, files, versions }
}

function readOptions(argv: string[]): MacOSFfmpegRuntimeOptions {
  const options: MacOSFfmpegRuntimeOptions = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--resource-dir') options.resourceDir = value
    else if (item === '--max-minos') options.maxMinos = value
    else continue
    index += 1
  }
  return options
}

async function main(): Promise<void> {
  const result = await checkMacOSFfmpegRuntime(readOptions(process.argv.slice(2)))
  console.log(`macOS FFmpeg runtime verified: ${result.files.length} Mach-O file(s), maximum minos ${result.maxMinos}`)
  for (const file of result.files) {
    console.log(`[file] ${file.fileOutput}`)
    console.log(`[otool -l] ${file.path}: minos ${file.minimumVersions.join(', ')}`)
  }
  for (const version of result.versions) console.log(`[${version.path} -version] ${version.version}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
