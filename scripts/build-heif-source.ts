import { access, copyFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { promisify } from 'node:util'
import { prepareHeifRuntime } from './prepare-heif-runtime.ts'

const execFileAsync = promisify(execFile)
const DEFAULT_MACOS_DEPLOYMENT_TARGET = '12.0'

type HeifEncoder = 'x265' | 'kvazaar'

export type BuildHeifSourceOptions = {
  sourceDirectory: string
  buildDirectory?: string
  installDirectory?: string
  resourcePath?: string
  platform?: NodeJS.Platform
  encoder?: HeifEncoder
  toolchainFile?: string
  vcpkgTriplet?: string
  x265Library?: string
  staticLink?: boolean
  generator?: string
  jobs?: number
}

function readOptionsFromEnvironment(): Partial<BuildHeifSourceOptions> {
  return {
    sourceDirectory: process.env.AIVPLAYER_HEIF_SOURCE_DIR,
    buildDirectory: process.env.AIVPLAYER_HEIF_BUILD_DIR,
    installDirectory: process.env.AIVPLAYER_HEIF_INSTALL_DIR,
    resourcePath: process.env.AIVPLAYER_RESOURCE_DIR,
    platform: process.env.AIVPLAYER_TARGET_PLATFORM as NodeJS.Platform | undefined,
    encoder: (process.env.AIVPLAYER_HEIF_ENCODER as HeifEncoder | undefined) ?? 'x265',
    toolchainFile: process.env.AIVPLAYER_CMAKE_TOOLCHAIN_FILE,
    vcpkgTriplet: process.env.AIVPLAYER_VCPKG_TRIPLET,
    x265Library: process.env.AIVPLAYER_X265_LIBRARY,
    staticLink: process.env.AIVPLAYER_HEIF_STATIC_LINK === '1',
    generator: process.env.AIVPLAYER_CMAKE_GENERATOR,
    jobs: parsePositiveInteger(process.env.AIVPLAYER_HEIF_BUILD_JOBS)
  }
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function readOptionsFromArgs(argv: string[]): Partial<BuildHeifSourceOptions> {
  const options: Partial<BuildHeifSourceOptions> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    if (item === '--static-link') {
      options.staticLink = true
      continue
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--source-dir') options.sourceDirectory = value
    else if (item === '--build-dir') options.buildDirectory = value
    else if (item === '--install-dir') options.installDirectory = value
    else if (item === '--resource-dir') options.resourcePath = value
    else if (item === '--platform') options.platform = value as NodeJS.Platform
    else if (item === '--encoder') options.encoder = value as HeifEncoder
    else if (item === '--toolchain-file') options.toolchainFile = value
    else if (item === '--vcpkg-triplet') options.vcpkgTriplet = value
    else if (item === '--x265-library') options.x265Library = value
    else if (item === '--generator') options.generator = value
    else if (item === '--jobs') options.jobs = parsePositiveInteger(value)
    else continue
    index += 1
  }
  return options
}

function mergeOptions(...optionsList: Partial<BuildHeifSourceOptions>[]): BuildHeifSourceOptions {
  const options = Object.assign({}, ...optionsList)
  const sourceDirectory = options.sourceDirectory
  if (!sourceDirectory) throw new Error('Missing libheif source. Pass --source-dir.')
  return {
    sourceDirectory,
    buildDirectory: options.buildDirectory,
    installDirectory: options.installDirectory,
    resourcePath: options.resourcePath,
    platform: options.platform,
    encoder: options.encoder === 'kvazaar' ? 'kvazaar' : 'x265',
    toolchainFile: options.toolchainFile,
    vcpkgTriplet: options.vcpkgTriplet,
    x265Library: options.x265Library,
    staticLink: options.staticLink ?? false,
    generator: options.generator,
    jobs: options.jobs
  }
}

async function run(command: string, args: string[], cwd?: string): Promise<void> {
  try {
    const result = await execFileAsync(command, args, { cwd, maxBuffer: 8 * 1024 * 1024 })
    if (result.stdout.trim()) process.stdout.write(result.stdout)
    if (result.stderr.trim()) process.stderr.write(result.stderr)
  } catch (error) {
    if (error && typeof error === 'object' && 'stdout' in error && String(error.stdout).trim()) process.stdout.write(String(error.stdout))
    if (error && typeof error === 'object' && 'stderr' in error && String(error.stderr).trim()) process.stderr.write(String(error.stderr))
    throw error
  }
}

function getCmakeOptions(options: BuildHeifSourceOptions, installDirectory: string): string[] {
  const encoderIsX265 = options.encoder === 'x265'
  const cmakeOptions = [
    `-DCMAKE_INSTALL_PREFIX=${installDirectory}`,
    '-DCMAKE_INSTALL_BINDIR=bin',
    '-DCMAKE_BUILD_TYPE=Release',
    '-DBUILD_SHARED_LIBS=OFF',
    '-DBUILD_TESTING=OFF',
    '-DBUILD_DOCUMENTATION=OFF',
    '-DENABLE_PLUGIN_LOADING=OFF',
    '-DWITH_EXAMPLES=ON',
    '-DWITH_EXAMPLE_HEIF_THUMB=OFF',
    '-DWITH_EXAMPLE_HEIF_VIEW=OFF',
    '-DWITH_GDK_PIXBUF=OFF',
    '-DWITH_LIBDE265=ON',
    '-DWITH_LIBDE265_PLUGIN=OFF',
    `-DWITH_X265=${encoderIsX265 ? 'ON' : 'OFF'}`,
    '-DWITH_X265_PLUGIN=OFF',
    `-DWITH_KVAZAAR=${encoderIsX265 ? 'OFF' : 'ON'}`,
    '-DWITH_KVAZAAR_PLUGIN=OFF',
    '-DWITH_JPEG_DECODER=ON',
    '-DWITH_JPEG_DECODER_PLUGIN=OFF',
    '-DWITH_JPEG_ENCODER=ON',
    '-DWITH_JPEG_ENCODER_PLUGIN=OFF',
    '-DWITH_AOM_DECODER=OFF',
    '-DWITH_AOM_ENCODER=OFF',
    '-DWITH_DAV1D=OFF',
    '-DWITH_RAV1E=OFF',
    '-DWITH_SvtEnc=OFF',
    '-DWITH_OPENJPEG_DECODER=OFF',
    '-DWITH_OPENJPEG_ENCODER=OFF',
    '-DWITH_FFMPEG_DECODER=OFF',
    '-DWITH_OpenH264_DECODER=OFF',
    '-DWITH_LIBSHARPYUV=OFF'
  ]
  if (options.generator) cmakeOptions.unshift('-G', options.generator)
  if (options.toolchainFile) cmakeOptions.push(`-DCMAKE_TOOLCHAIN_FILE=${options.toolchainFile}`)
  if (options.vcpkgTriplet) cmakeOptions.push(`-DVCPKG_TARGET_TRIPLET=${options.vcpkgTriplet}`)
  if (options.x265Library) cmakeOptions.push(`-DX265_LIBRARY=${options.x265Library}`)
  if (options.platform === 'darwin') {
    const deploymentTarget = process.env.MACOSX_DEPLOYMENT_TARGET ?? DEFAULT_MACOS_DEPLOYMENT_TARGET
    cmakeOptions.push(`-DCMAKE_OSX_DEPLOYMENT_TARGET=${deploymentTarget}`)
  }
  if (options.platform === 'win32') cmakeOptions.push('-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded')
  if (options.staticLink) cmakeOptions.push('-DCMAKE_EXE_LINKER_FLAGS=-static -static-libgcc -static-libstdc++')
  return cmakeOptions
}

async function ensureWindowsHeifConverter(installDirectory: string, platform: NodeJS.Platform): Promise<void> {
  if (platform !== 'win32') return

  const binDirectory = join(installDirectory, 'bin')
  const converterPath = join(binDirectory, 'heif-convert.exe')
  try {
    await access(converterPath)
    return
  } catch {
    // libheif creates this compatibility executable from heif-dec during install.
    // Keep the release build deterministic when that CMake install step does not.
  }

  const decoderPath = join(binDirectory, 'heif-dec.exe')
  await copyFile(decoderPath, converterPath)
}

export async function buildHeifSource(options: BuildHeifSourceOptions): Promise<string> {
  const platform = options.platform ?? process.platform
  const buildDirectory = options.buildDirectory ?? join(options.sourceDirectory, 'build-aivplayer')
  const installDirectory = options.installDirectory ?? join(buildDirectory, 'install')
  const buildJobs = options.jobs ?? availableParallelism()
  await mkdir(buildDirectory, { recursive: true })
  await run('cmake', ['-S', options.sourceDirectory, '-B', buildDirectory, ...getCmakeOptions({ ...options, platform }, installDirectory)])
  await run('cmake', [
    '--build',
    buildDirectory,
    '--config',
    'Release',
    '--target',
    'heif-info',
    'heif-dec',
    'heif-enc',
    '--parallel',
    String(buildJobs)
  ])
  await run('cmake', ['--install', buildDirectory, '--config', 'Release'])
  await ensureWindowsHeifConverter(installDirectory, platform)
  const result = await prepareHeifRuntime({
    platform,
    resourcePath: options.resourcePath ?? resolve('resources'),
    heifDirectory: join(installDirectory, 'bin')
  })
  return result.message
}

async function main(): Promise<void> {
  console.log(await buildHeifSource(mergeOptions(readOptionsFromEnvironment(), readOptionsFromArgs(process.argv.slice(2)))))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
