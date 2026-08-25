import { access, chmod, copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { bundleMachODependencies, normalizeRuntimeFilePermissions } from './macos-runtime-dependencies.ts'

const execFileAsync = promisify(execFile)
const RUNTIME_SIDECAR_EXTENSIONS = new Set(['.dll', '.dylib', '.so', '.metal'])

export type PrepareHeifRuntimeOptions = {
  resourcePath?: string
  platform?: NodeJS.Platform
  heifDirectory?: string
  heifEncoderPath?: string
  heifConverterPath?: string
}

export type PrepareHeifRuntimeResult = {
  ok: boolean
  resourcePath: string
  encoderPath: string
  converterPath: string
  copiedFiles: string[]
  message: string
}

function getBinaryNames(platform: NodeJS.Platform): { encoder: string; converter: string } {
  return platform === 'win32'
    ? { encoder: 'heif-enc.exe', converter: 'heif-convert.exe' }
    : { encoder: 'heif-enc', converter: 'heif-convert' }
}

async function pathExists(path: string, executable = false): Promise<boolean> {
  try {
    await access(path, executable ? constants.F_OK | constants.X_OK : constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function findBinary(directory: string, binaryName: string): Promise<string | null> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const match = entries.find((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name === binaryName)
  return match ? join(directory, match.name) : null
}

async function resolveBinary(options: {
  explicitPath?: string
  sourceDirectory?: string
  name: string
  component: string
  platform: NodeJS.Platform
}): Promise<string> {
  if (options.explicitPath) {
    if (!(await pathExists(options.explicitPath, options.platform !== 'win32'))) {
      throw new Error(`${options.component} binary does not exist: ${options.explicitPath}`)
    }
    return options.explicitPath
  }

  if (options.sourceDirectory) {
    const binaryPath = await findBinary(options.sourceDirectory, options.name)
    if (binaryPath && await pathExists(binaryPath, options.platform !== 'win32')) return binaryPath
    throw new Error(`Could not find ${options.name} in ${options.sourceDirectory}`)
  }

  throw new Error(`Missing ${options.component} source. Pass --heif-dir or an explicit binary path.`)
}

function isRuntimeSidecar(fileName: string): boolean {
  const lowerName = fileName.toLowerCase()
  return RUNTIME_SIDECAR_EXTENSIONS.has(extname(lowerName)) || lowerName.includes('.so.')
}

async function copySidecars(sourceDirectory: string, destinationDirectory: string): Promise<string[]> {
  const entries = await readdir(sourceDirectory, { withFileTypes: true }).catch(() => [])
  const copied: string[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !isRuntimeSidecar(entry.name)) continue
    const destinationPath = join(destinationDirectory, basename(entry.name))
    await copyFile(join(sourceDirectory, entry.name), destinationPath)
    copied.push(destinationPath)
  }
  return copied
}

async function validateTool(path: string): Promise<void> {
  try {
    await execFileAsync(path, ['--version'], { timeout: 5000, maxBuffer: 256 * 1024 })
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr ?? '') : ''
    const message = stderr.trim() || (error instanceof Error ? error.message : String(error))
    throw new Error(`${path} cannot execute: ${message.split('\n')[0]}`)
  }
}

function readOptionsFromEnvironment(): PrepareHeifRuntimeOptions {
  return {
    resourcePath: process.env.AIVPLAYER_RESOURCE_DIR,
    platform: process.env.AIVPLAYER_TARGET_PLATFORM as NodeJS.Platform | undefined,
    heifDirectory: process.env.AIVPLAYER_STAGE_HEIF_DIR,
    heifEncoderPath: process.env.AIVPLAYER_STAGE_HEIF_ENC_BIN,
    heifConverterPath: process.env.AIVPLAYER_STAGE_HEIF_CONVERT_BIN
  }
}

function readOptionsFromArgs(argv: string[]): PrepareHeifRuntimeOptions {
  const options: PrepareHeifRuntimeOptions = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--resource-dir') options.resourcePath = value
    else if (item === '--platform') options.platform = value as NodeJS.Platform
    else if (item === '--heif-dir') options.heifDirectory = value
    else if (item === '--heif-enc') options.heifEncoderPath = value
    else if (item === '--heif-convert') options.heifConverterPath = value
    else continue
    index += 1
  }
  return options
}

function mergeOptions(...optionsList: PrepareHeifRuntimeOptions[]): PrepareHeifRuntimeOptions {
  return Object.assign({}, ...optionsList)
}

export async function prepareHeifRuntime(options: PrepareHeifRuntimeOptions): Promise<PrepareHeifRuntimeResult> {
  const platform = options.platform ?? process.platform
  const names = getBinaryNames(platform)
  const resourcePath = options.resourcePath ?? resolve('resources')
  const destinationDirectory = join(resourcePath, 'heif')
  const encoderSourcePath = await resolveBinary({ explicitPath: options.heifEncoderPath, sourceDirectory: options.heifDirectory, name: names.encoder, component: 'heif-enc', platform })
  const converterSourcePath = await resolveBinary({ explicitPath: options.heifConverterPath, sourceDirectory: options.heifDirectory, name: names.converter, component: 'heif-convert', platform })
  await mkdir(destinationDirectory, { recursive: true })
  const encoderPath = join(destinationDirectory, names.encoder)
  const converterPath = join(destinationDirectory, names.converter)
  await copyFile(encoderSourcePath, encoderPath)
  await copyFile(converterSourcePath, converterPath)
  if (platform !== 'win32') {
    await chmod(encoderPath, 0o755)
    await chmod(converterPath, 0o755)
  }

  const copiedFiles = [encoderPath, converterPath]
  const sourceDirectories = Array.from(new Set([dirname(encoderSourcePath), dirname(converterSourcePath)]))
  for (const sourceDirectory of sourceDirectories) copiedFiles.push(...await copySidecars(sourceDirectory, destinationDirectory))

  const machODependencies = await bundleMachODependencies({
    platform,
    destinationDirectory,
    entries: [
      { sourcePath: encoderSourcePath, destinationPath: encoderPath },
      { sourcePath: converterSourcePath, destinationPath: converterPath }
    ]
  })
  copiedFiles.push(...machODependencies.copiedFiles)
  await normalizeRuntimeFilePermissions(copiedFiles, platform)
  await validateTool(encoderPath)
  await validateTool(converterPath)
  for (const filePath of copiedFiles) {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) throw new Error(`Prepared HEIF artifact is not a file: ${filePath}`)
  }

  return {
    ok: true,
    resourcePath,
    encoderPath,
    converterPath,
    copiedFiles: Array.from(new Set(copiedFiles)),
    message: [
      'HEIF runtime staged for release.',
      `heif-enc: ${encoderPath}`,
      `heif-convert: ${converterPath}`,
      `sidecars: ${Math.max(0, new Set(copiedFiles).size - 2)}`
    ].join('\n')
  }
}

async function main(): Promise<void> {
  const result = await prepareHeifRuntime(mergeOptions(readOptionsFromEnvironment(), readOptionsFromArgs(process.argv.slice(2))))
  console.log(result.message)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
