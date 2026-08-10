import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { execFile } from 'node:child_process'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { getWhisperBinaryNames } from '../src/core/ai/whisper-binary.ts'
import { VISION_MODEL_FILES, VISION_MODEL_ID, VISION_MODEL_REPOSITORY, VISION_MODEL_REVISION } from '../src/shared/vision-types.ts'

const execFileAsync = promisify(execFile)

export const RUNTIME_METADATA_FILE = 'runtime-metadata.json'
export { VISION_MODEL_FILES, VISION_MODEL_REPOSITORY, VISION_MODEL_REVISION }
export const VISION_MODEL_DIRECTORY = `vision/${VISION_MODEL_ID}`

type RuntimeBinary = {
  path: string
  sha256: string
  sizeBytes: number
}

export type RuntimeMetadata = {
  schemaVersion: 1
  generatedAt: string
  applicationVersion: string
  platform: NodeJS.Platform
  components: {
    whisperCpp: RuntimeBinary & {
      source: string
      sourceVersion: string
      sourceVersionSource: 'workflow-env' | 'local-unknown'
      license: 'MIT'
    }
    ffmpeg: RuntimeBinary & {
      source: string
      version: string
      versionLine: string
      configuration: string
      licenseProfile: 'lgpl' | 'gpl-enabled'
      license: 'LGPL-2.1-or-later' | 'GPL-enabled-build'
    }
    ffprobe: RuntimeBinary & {
      source: string
      version: string
      versionLine: string
      configuration: string
      licenseProfile: 'lgpl' | 'gpl-enabled'
      license: 'LGPL-2.1-or-later' | 'GPL-enabled-build'
    }
    libheif: {
      status: 'bundled' | 'system-fallback'
      source: string
      sourceVersion: string
      sourceVersionSource: 'workflow-env' | 'local-unknown' | 'macos-system'
      license: 'LGPL' | 'not-applicable-system'
      encoder: string
      detectedVersion?: string
      encoderBinary?: RuntimeBinary
      converterBinary?: RuntimeBinary
      fallbackBinary?: string
    }
    siglip2: {
      source: string
      repository: string
      revision: string
      license: 'Apache-2.0'
      files: Array<RuntimeBinary & { relativePath: string }>
    }
  }
}

export type WriteRuntimeMetadataOptions = {
  resourcePath?: string
  platform?: NodeJS.Platform
  applicationVersion?: string
  generatedAt?: string
  whisperVersion?: string
  libheifVersion?: string
  libheifEncoder?: string
  visionModelRevision?: string
  ffmpegPath?: string
  ffprobePath?: string
  whisperPath?: string
  heifEncoderPath?: string
  heifConverterPath?: string
  sipsPath?: string
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

async function getRuntimeBinary(filePath: string, displayPath = filePath): Promise<RuntimeBinary> {
  const fileStat = await stat(filePath)
  return {
    path: displayPath,
    sha256: await sha256(filePath),
    sizeBytes: fileStat.size
  }
}

async function runVersion(binaryPath: string, args: string[]): Promise<string> {
  const result = await execFileAsync(binaryPath, args, { timeout: 10_000, maxBuffer: 512 * 1024 })
  return `${result.stdout}\n${result.stderr}`.trim()
}

function parseFfmpegVersion(output: string): { version: string; versionLine: string; configuration: string; licenseProfile: 'lgpl' | 'gpl-enabled'; license: 'LGPL-2.1-or-later' | 'GPL-enabled-build' } {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const versionLine = lines.find((line) => /^ff(?:mpeg|probe) version\s+/i.test(line)) ?? lines[0] ?? ''
  const version = versionLine.match(/^ff(?:mpeg|probe) version\s+([^\s]+)/i)?.[1] ?? 'unknown'
  const configuration = lines.find((line) => line.startsWith('configuration:')) ?? ''
  if (configuration.includes('--enable-nonfree')) {
    throw new Error(`FFmpeg runtime is non-redistributable because its configuration contains --enable-nonfree: ${versionLine}`)
  }
  const gplEnabled = configuration.includes('--enable-gpl')
  return {
    version,
    versionLine,
    configuration,
    licenseProfile: gplEnabled ? 'gpl-enabled' : 'lgpl',
    license: gplEnabled ? 'GPL-enabled-build' : 'LGPL-2.1-or-later'
  }
}

function getPlatformBinaryName(platform: NodeJS.Platform, posixName: string, windowsName: string): string {
  return platform === 'win32' ? windowsName : posixName
}

async function findExistingPath(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.F_OK)
      return candidate
    } catch {
      // Try the next supported binary name.
    }
  }
  return null
}

async function readApplicationVersion(explicitVersion?: string): Promise<string> {
  if (explicitVersion) return explicitVersion
  const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8')) as { version?: string }
  return packageJson.version ?? 'unknown'
}

function getEnvironmentVersion(name: string, explicitVersion: string | undefined, fallback: string): { value: string; source: 'workflow-env' | 'local-unknown' } {
  if (explicitVersion) return { value: explicitVersion, source: 'workflow-env' }
  const environmentVersion = process.env[name]
  return environmentVersion ? { value: environmentVersion, source: 'workflow-env' } : { value: fallback, source: 'local-unknown' }
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

async function getVisionModelMetadata(resourcePath: string, revision: string): Promise<RuntimeMetadata['components']['siglip2']> {
  const modelDirectory = join(resourcePath, VISION_MODEL_DIRECTORY)
  const files = await Promise.all(VISION_MODEL_FILES.map(async (relativePath) => {
    const filePath = join(modelDirectory, relativePath)
    const binary = await getRuntimeBinary(filePath, relative(resourcePath, filePath))
    return { ...binary, relativePath }
  }))
  return {
    source: `https://huggingface.co/${VISION_MODEL_REPOSITORY}/tree/${revision}`,
    repository: VISION_MODEL_REPOSITORY,
    revision,
    license: 'Apache-2.0',
    files
  }
}

export async function writeRuntimeMetadata(options: WriteRuntimeMetadataOptions = {}): Promise<RuntimeMetadata> {
  const platform = options.platform ?? process.platform
  const resourcePath = resolve(options.resourcePath ?? process.env.AIVPLAYER_RESOURCE_DIR ?? 'resources')
  const ffmpegPath = options.ffmpegPath ?? join(resourcePath, 'ffmpeg', getPlatformBinaryName(platform, 'ffmpeg', 'ffmpeg.exe'))
  const ffprobePath = options.ffprobePath ?? join(resourcePath, 'ffmpeg', getPlatformBinaryName(platform, 'ffprobe', 'ffprobe.exe'))
  const whisperPath = options.whisperPath ?? await findExistingPath(getWhisperBinaryNames(platform).map((name) => join(resourcePath, 'whisper.cpp', name)))
  if (!whisperPath) throw new Error(`Whisper runtime binary is missing under ${join(resourcePath, 'whisper.cpp')}`)
  const heifEncoderPath = options.heifEncoderPath ?? join(resourcePath, 'heif', getPlatformBinaryName(platform, 'heif-enc', 'heif-enc.exe'))
  const heifConverterPath = options.heifConverterPath ?? join(resourcePath, 'heif', getPlatformBinaryName(platform, 'heif-convert', 'heif-convert.exe'))

  const ffmpegOutput = await runVersion(ffmpegPath, ['-version'])
  const ffprobeOutput = await runVersion(ffprobePath, ['-version'])
  const ffmpegVersion = parseFfmpegVersion(ffmpegOutput)
  const ffprobeVersion = parseFfmpegVersion(ffprobeOutput)
  const [ffmpeg, ffprobe, whisperCpp, visionModel] = await Promise.all([
    getRuntimeBinary(ffmpegPath, relative(resourcePath, ffmpegPath)),
    getRuntimeBinary(ffprobePath, relative(resourcePath, ffprobePath)),
    getRuntimeBinary(whisperPath, relative(resourcePath, whisperPath)),
    getVisionModelMetadata(resourcePath, options.visionModelRevision ?? process.env.VISION_MODEL_REVISION ?? VISION_MODEL_REVISION)
  ])

  const whisperVersion = getEnvironmentVersion('WHISPER_CPP_VERSION', options.whisperVersion, 'unknown')
  const libheifVersion = getEnvironmentVersion('LIBHEIF_VERSION', options.libheifVersion, 'unknown')
  const encoder = options.libheifEncoder ?? process.env.AIVPLAYER_HEIF_ENCODER ?? 'unknown'
  let libheif: RuntimeMetadata['components']['libheif']
  try {
    await access(heifEncoderPath, constants.F_OK)
    await access(heifConverterPath, constants.F_OK)
    const [encoderBinary, converterBinary] = await Promise.all([
      getRuntimeBinary(heifEncoderPath, relative(resourcePath, heifEncoderPath)),
      getRuntimeBinary(heifConverterPath, relative(resourcePath, heifConverterPath))
    ])
    const actualVersion = await runVersion(heifEncoderPath, ['--version']).catch(() => '')
    libheif = {
      status: 'bundled',
      source: 'https://github.com/strukturag/libheif',
      sourceVersion: libheifVersion.value,
      sourceVersionSource: libheifVersion.source,
      license: 'LGPL',
      encoder,
      encoderBinary,
      converterBinary,
      ...(actualVersion ? { detectedVersion: actualVersion.split(/\r?\n/)[0] } : {})
    } as RuntimeMetadata['components']['libheif']
  } catch {
    if (platform !== 'darwin') throw new Error(`Bundled libheif tools are missing: ${heifEncoderPath}, ${heifConverterPath}`)
    const fallbackPath = options.sipsPath ?? '/usr/bin/sips'
    await access(fallbackPath, constants.F_OK)
    libheif = {
      status: 'system-fallback',
      source: 'macOS system image conversion',
      sourceVersion: 'macOS system',
      sourceVersionSource: 'macos-system',
      license: 'not-applicable-system',
      encoder: 'macOS sips',
      fallbackBinary: fallbackPath
    }
  }

  const metadata: RuntimeMetadata = {
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    applicationVersion: await readApplicationVersion(options.applicationVersion),
    platform,
    components: {
      whisperCpp: {
        ...whisperCpp,
        source: 'https://github.com/ggml-org/whisper.cpp',
        sourceVersion: whisperVersion.value,
        sourceVersionSource: whisperVersion.source,
        license: 'MIT'
      },
      ffmpeg: {
        ...ffmpeg,
        source: 'https://ffmpeg.org/',
        ...ffmpegVersion
      },
      ffprobe: {
        ...ffprobe,
        source: 'https://ffmpeg.org/',
        ...ffprobeVersion
      },
      libheif,
      siglip2: visionModel
    }
  }
  await writeJsonAtomically(join(resourcePath, RUNTIME_METADATA_FILE), metadata)
  return metadata
}

function readOptions(argv: string[]): WriteRuntimeMetadataOptions {
  const options: WriteRuntimeMetadataOptions = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--resource-dir') options.resourcePath = value
    else if (item === '--platform') options.platform = value as NodeJS.Platform
    else if (item === '--whisper-version') options.whisperVersion = value
    else if (item === '--libheif-version') options.libheifVersion = value
    else if (item === '--libheif-encoder') options.libheifEncoder = value
    else if (item === '--vision-model-revision') options.visionModelRevision = value
    else continue
    index += 1
  }
  return options
}

async function main(): Promise<void> {
  const metadata = await writeRuntimeMetadata(readOptions(process.argv.slice(2)))
  console.log(`Runtime metadata written: ${join(resolve(process.env.AIVPLAYER_RESOURCE_DIR ?? 'resources'), RUNTIME_METADATA_FILE)}`)
  console.log(JSON.stringify({ platform: metadata.platform, applicationVersion: metadata.applicationVersion, ffmpeg: metadata.components.ffmpeg.version, visionModelRevision: metadata.components.siglip2.revision }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
