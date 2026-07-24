import { access, chmod, copyFile, mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkBundledAsrRuntime } from './check-bundled-asr-runtime.ts'
import {
  getWhisperBinaryDestinationName,
  getWhisperBinaryNames as getSupportedWhisperBinaryNames
} from '../src/core/ai/whisper-binary.ts'
import { bundleMachODependencies, clearRuntimeSidecars } from './macos-runtime-dependencies.ts'

export type PrepareAsrRuntimeOptions = {
  resourcePath?: string
  platform?: NodeJS.Platform
  whisperBinaryPath?: string
  whisperDirectory?: string
  ffmpegBinaryPath?: string
  ffmpegDirectory?: string
}

export type PrepareAsrRuntimeResult = {
  ok: boolean
  resourcePath: string
  whisperBinaryPath: string
  ffmpegPath: string
  ffprobePath: string
  copiedFiles: string[]
  message: string
}

const POSIX_FFMPEG_BINARY_NAMES = ['ffmpeg']
const WINDOWS_FFMPEG_BINARY_NAMES = ['ffmpeg.exe']
const POSIX_FFPROBE_BINARY_NAMES = ['ffprobe']
const WINDOWS_FFPROBE_BINARY_NAMES = ['ffprobe.exe']
const RUNTIME_SIDECAR_EXTENSIONS = new Set(['.dll', '.dylib', '.metal'])

function getFfmpegBinaryNames(platform: NodeJS.Platform): string[] {
  return platform === 'win32' ? WINDOWS_FFMPEG_BINARY_NAMES : POSIX_FFMPEG_BINARY_NAMES
}

function getFfprobeBinaryNames(platform: NodeJS.Platform): string[] {
  return platform === 'win32' ? WINDOWS_FFPROBE_BINARY_NAMES : POSIX_FFPROBE_BINARY_NAMES
}

function getFfmpegDestinationName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

function getFfprobeDestinationName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
}

function isLinuxSharedObject(fileName: string): boolean {
  return fileName.endsWith('.so') || fileName.includes('.so.')
}

function isRuntimeSidecar(fileName: string): boolean {
  return RUNTIME_SIDECAR_EXTENSIONS.has(extname(fileName).toLowerCase()) || isLinuxSharedObject(fileName)
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function ensureExecutable(path: string, platform: NodeJS.Platform): Promise<void> {
  if (platform !== 'win32') {
    await chmod(path, 0o755)
  }
}

async function findBinaryInDirectory(directory: string, binaryNames: string[], maxDepth = 3): Promise<string | null> {
  const queue: Array<{ directory: string; depth: number }> = [{ directory, depth: 0 }]

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      continue
    }

    const entries = await readdir(current.directory, { withFileTypes: true }).catch(() => [])

    for (const binaryName of binaryNames) {
      const match = entries.find(
        (entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name === binaryName
      )

      if (match) {
        return join(current.directory, match.name)
      }
    }

    for (const entry of entries) {
      const entryPath = join(current.directory, entry.name)

      if (entry.isDirectory() && current.depth < maxDepth) {
        queue.push({ directory: entryPath, depth: current.depth + 1 })
      }
    }
  }

  return null
}

async function resolveRuntimeBinary(options: {
  explicitBinaryPath?: string
  sourceDirectory?: string
  binaryNames: string[]
  componentName: string
}): Promise<string> {
  if (options.explicitBinaryPath) {
    if (!(await pathExists(options.explicitBinaryPath))) {
      throw new Error(`${options.componentName} binary does not exist: ${options.explicitBinaryPath}`)
    }

    return options.explicitBinaryPath
  }

  if (options.sourceDirectory) {
    const binaryPath = await findBinaryInDirectory(options.sourceDirectory, options.binaryNames)

    if (binaryPath) {
      return binaryPath
    }

    throw new Error(
      `Could not find ${options.componentName} binary in ${options.sourceDirectory}. Expected one of: ${options.binaryNames.join(', ')}`
    )
  }

  throw new Error(`Missing ${options.componentName} source. Pass a binary path or directory.`)
}

async function copyRuntimeBinary(options: {
  sourcePath: string
  destinationDirectory: string
  platform: NodeJS.Platform
  destinationName?: string
}): Promise<string> {
  await mkdir(options.destinationDirectory, { recursive: true })
  const destinationPath = join(
    options.destinationDirectory,
    options.destinationName ?? getWhisperBinaryDestinationName(options.sourcePath, options.platform)
  )
  await unlink(destinationPath).catch(() => undefined)
  await copyFile(options.sourcePath, destinationPath)
  await ensureExecutable(destinationPath, options.platform)
  return destinationPath
}

async function copySidecars(sourceBinaryPath: string, destinationDirectory: string): Promise<string[]> {
  const sourceDirectory = dirname(sourceBinaryPath)
  const entries = await readdir(sourceDirectory, { withFileTypes: true }).catch(() => [])
  const copied: string[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !isRuntimeSidecar(entry.name)) {
      continue
    }

    const sourcePath = join(sourceDirectory, entry.name)
    const destinationPath = join(destinationDirectory, basename(entry.name))
    await copyFile(sourcePath, destinationPath)
    copied.push(destinationPath)
  }

  return copied
}

function readOptionsFromEnvironment(): PrepareAsrRuntimeOptions {
  return {
    resourcePath: process.env.AIVPLAYER_RESOURCE_DIR,
    whisperBinaryPath: process.env.AIVPLAYER_STAGE_WHISPER_BIN,
    whisperDirectory: process.env.AIVPLAYER_STAGE_WHISPER_DIR,
    ffmpegBinaryPath: process.env.AIVPLAYER_STAGE_FFMPEG_BIN,
    ffmpegDirectory: process.env.AIVPLAYER_STAGE_FFMPEG_DIR
  }
}

function readOptionsFromArgs(argv: string[]): PrepareAsrRuntimeOptions {
  const options: PrepareAsrRuntimeOptions = {}

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]

    if (!value || value.startsWith('--')) {
      continue
    }

    if (item === '--resource-dir') {
      options.resourcePath = value
      index += 1
    } else if (item === '--platform') {
      options.platform = value as NodeJS.Platform
      index += 1
    } else if (item === '--whisper-bin') {
      options.whisperBinaryPath = value
      index += 1
    } else if (item === '--whisper-dir') {
      options.whisperDirectory = value
      index += 1
    } else if (item === '--ffmpeg-bin') {
      options.ffmpegBinaryPath = value
      index += 1
    } else if (item === '--ffmpeg-dir') {
      options.ffmpegDirectory = value
      index += 1
    }
  }

  return options
}

function mergeOptions(...optionsList: PrepareAsrRuntimeOptions[]): PrepareAsrRuntimeOptions {
  return Object.assign({}, ...optionsList)
}

export async function prepareAsrRuntime(options: PrepareAsrRuntimeOptions): Promise<PrepareAsrRuntimeResult> {
  const platform = options.platform ?? process.platform
  const resourcePath = options.resourcePath ?? resolve('resources')
  const whisperDestinationDirectory = join(resourcePath, 'whisper.cpp')
  const ffmpegDestinationDirectory = join(resourcePath, 'ffmpeg')
  const whisperSourcePath = await resolveRuntimeBinary({
    explicitBinaryPath: options.whisperBinaryPath,
    sourceDirectory: options.whisperDirectory,
    binaryNames: getSupportedWhisperBinaryNames(platform),
    componentName: 'whisper.cpp'
  })
  const ffmpegSourcePath = await resolveRuntimeBinary({
    explicitBinaryPath: options.ffmpegBinaryPath,
    sourceDirectory: options.ffmpegDirectory,
    binaryNames: getFfmpegBinaryNames(platform),
    componentName: 'ffmpeg'
  })
  const ffprobeSourcePath = await resolveRuntimeBinary({
    sourceDirectory: dirname(ffmpegSourcePath),
    binaryNames: getFfprobeBinaryNames(platform),
    componentName: 'ffprobe'
  })
  const [whisperBinaryPath, ffmpegPath, ffprobePath] = await Promise.all([
    copyRuntimeBinary({
      sourcePath: whisperSourcePath,
      destinationDirectory: whisperDestinationDirectory,
      platform
    }),
    copyRuntimeBinary({
      sourcePath: ffmpegSourcePath,
      destinationDirectory: ffmpegDestinationDirectory,
      destinationName: getFfmpegDestinationName(platform),
      platform
    }),
    copyRuntimeBinary({
      sourcePath: ffprobeSourcePath,
      destinationDirectory: ffmpegDestinationDirectory,
      destinationName: getFfprobeDestinationName(platform),
      platform
    })
  ])
  if (platform === 'darwin') {
    await clearRuntimeSidecars(ffmpegDestinationDirectory)
  }

  const whisperSidecars = await copySidecars(whisperSourcePath, whisperDestinationDirectory)
  const ffmpegSidecars = await copySidecars(ffmpegSourcePath, ffmpegDestinationDirectory)
  const ffmpegDependencies = await bundleMachODependencies({
    platform,
    destinationDirectory: ffmpegDestinationDirectory,
    entries: [
      { sourcePath: ffmpegSourcePath, destinationPath: ffmpegPath },
      { sourcePath: ffprobeSourcePath, destinationPath: ffprobePath }
    ]
  })
  const check = await checkBundledAsrRuntime({ resourcePath, platform })

  if (!check.ok) {
    throw new Error(check.message)
  }

  const copiedFiles = [
    whisperBinaryPath,
    ffmpegPath,
    ffprobePath,
    ...whisperSidecars,
    ...ffmpegSidecars,
    ...ffmpegDependencies.copiedFiles
  ]
  const message = [
    'ASR runtime staged for release.',
    `whisper.cpp: ${whisperBinaryPath}`,
    `ffmpeg: ${ffmpegPath}`,
    `ffprobe: ${ffprobePath}`,
    copiedFiles.length > 3 ? `sidecars: ${copiedFiles.length - 3}` : 'sidecars: 0'
  ].join('\n')

  for (const filePath of copiedFiles) {
    const fileStat = await stat(filePath)

    if (!fileStat.isFile()) {
      throw new Error(`Prepared runtime artifact is not a file: ${filePath}`)
    }
  }

  return {
    ok: true,
    resourcePath,
    whisperBinaryPath,
    ffmpegPath,
    ffprobePath,
    copiedFiles,
    message
  }
}

async function main(): Promise<void> {
  const options = mergeOptions(readOptionsFromEnvironment(), readOptionsFromArgs(process.argv.slice(2)))
  const result = await prepareAsrRuntime(options)
  console.log(result.message)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
