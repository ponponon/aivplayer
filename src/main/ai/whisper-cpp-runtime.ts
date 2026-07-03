import { delimiter, dirname, isAbsolute, join } from 'node:path'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { AsrRuntime, AsrRuntimeOptions } from './asr-runtime.ts'
import { getWhisperModelDirectory, listWhisperModels, pathExists, selectWhisperModel } from './model-manager.ts'
import { getRecommendedWhisperModelManifest } from './asr-models.ts'
import { downloadWhisperModel } from './model-downloader.ts'
import { findWhisperSubtitleCache, runAsrSubtitleJob } from './asr-subtitle-job.ts'
import { convertVttToSrt } from './subtitle-writer.ts'
import { readAsrRuntimeSettings, saveWhisperBinaryPath } from './asr-settings.ts'
import { getWhisperBinaryNames, parseWhisperBinaryReplacementName } from './whisper-binary.ts'
import { getAppCopy } from '../../shared/i18n'
import type {
  AsrJobProgress,
  AsrModelDownloadProgress,
  AsrModelDownloadResult,
  AsrModelSourceId,
  AsrRuntimeStatus,
  AsrSubtitleExportRequest,
  AsrSubtitleExportResult,
  AsrSubtitleRequest,
  AsrSubtitleResult
} from '../../shared/media-types.ts'

const execFileAsync = promisify(execFile)
const POSIX_FFMPEG_BINARY_NAMES = ['ffmpeg']
const WINDOWS_FFMPEG_BINARY_NAMES = ['ffmpeg.exe']
const POSIX_FFPROBE_BINARY_NAMES = ['ffprobe']
const WINDOWS_FFPROBE_BINARY_NAMES = ['ffprobe.exe']

function getFfmpegBinaryNames(): string[] {
  return process.platform === 'win32' ? WINDOWS_FFMPEG_BINARY_NAMES : POSIX_FFMPEG_BINARY_NAMES
}

function getFfprobeBinaryNames(): string[] {
  return process.platform === 'win32' ? WINDOWS_FFPROBE_BINARY_NAMES : POSIX_FFPROBE_BINARY_NAMES
}

function getBundledBinaryCandidates(resourcePath: string, resourceDirectory: string, binaryNames: string[]): string[] {
  return binaryNames.map((binaryName) => join(resourcePath, resourceDirectory, binaryName))
}

export function getSiblingSrtPath(filePath: string): string {
  if (filePath.endsWith('.vtt')) {
    return `${filePath.slice(0, -4)}.srt`
  }

  const lastDotIndex = filePath.lastIndexOf('.')
  return lastDotIndex > 0 ? `${filePath.slice(0, lastDotIndex)}.srt` : `${filePath}.srt`
}

function getPathBinaryCandidates(env: NodeJS.ProcessEnv, binaryNames: string[]): string[] {
  const pathValue = env.PATH ?? ''

  return pathValue
    .split(delimiter)
    .filter(Boolean)
    .flatMap((directory) => binaryNames.map((binaryName) => join(directory, binaryName)))
}

function getKnownBinaryDirectories(env: NodeJS.ProcessEnv): string[] {
  if (process.platform === 'darwin') {
    return ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin']
  }

  if (process.platform === 'win32') {
    return [
      env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links') : null,
      env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Programs', 'whisper.cpp') : null,
      env.ProgramFiles ? join(env.ProgramFiles, 'whisper.cpp') : null,
      env.ProgramFiles ? join(env.ProgramFiles, 'ffmpeg', 'bin') : null,
      env['ProgramFiles(x86)'] ? join(env['ProgramFiles(x86)'], 'whisper.cpp') : null,
      env.USERPROFILE ? join(env.USERPROFILE, 'scoop', 'shims') : null,
      'C:\\ProgramData\\chocolatey\\bin'
    ].filter((directory): directory is string => Boolean(directory))
  }

  return [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/snap/bin',
    env.HOME ? join(env.HOME, '.local', 'bin') : null
  ].filter((directory): directory is string => Boolean(directory))
}

function getDirectoryBinaryCandidates(directories: string[], binaryNames: string[]): string[] {
  return directories.flatMap((directory) => binaryNames.map((binaryName) => join(directory, binaryName)))
}

async function resolveWhisperBinaryReplacement(binaryPath: string): Promise<string | null | undefined> {
  const replacementCandidates = (replacementName: string): string[] =>
    process.platform === 'win32' && !replacementName.toLowerCase().endsWith('.exe')
      ? [replacementName, `${replacementName}.exe`]
      : [replacementName]

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, ['--help'], { timeout: 4000 })
    const replacementName = parseWhisperBinaryReplacementName(`${stdout}\n${stderr}`)

    if (!replacementName) {
      return undefined
    }

    for (const candidateName of replacementCandidates(replacementName)) {
      const replacementPath = join(dirname(binaryPath), candidateName)

      if (await pathExists(replacementPath)) {
        return replacementPath
      }
    }

    return null
  } catch (error) {
    const stdout = error instanceof Error && 'stdout' in error ? String((error as { stdout?: unknown }).stdout ?? '') : ''
    const stderr = error instanceof Error && 'stderr' in error ? String((error as { stderr?: unknown }).stderr ?? '') : ''
    const replacementName = parseWhisperBinaryReplacementName(`${stdout}\n${stderr}`)

    if (!replacementName) {
      return undefined
    }

    for (const candidateName of replacementCandidates(replacementName)) {
      const replacementPath = join(dirname(binaryPath), candidateName)

      if (await pathExists(replacementPath)) {
        return replacementPath
      }
    }

    return null
  }
}

async function resolveExecutablePath(options: {
  overrides?: Array<string | undefined>
  resourcePath: string
  resourceDirectory: string
  binaryNames: string[]
  env: NodeJS.ProcessEnv
  extraBinaryDirectories?: string[]
}): Promise<string | null> {
  const binaryDirectories = [...(options.extraBinaryDirectories ?? []), ...getKnownBinaryDirectories(options.env)]
  const candidates = [
    ...(options.overrides ?? []).filter((candidate): candidate is string => Boolean(candidate)),
    ...getBundledBinaryCandidates(options.resourcePath, options.resourceDirectory, options.binaryNames),
    ...getDirectoryBinaryCandidates(binaryDirectories, options.binaryNames),
    ...getPathBinaryCandidates(options.env, options.binaryNames)
  ].filter((candidate) => isAbsolute(candidate))

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      const replacementPath = await resolveWhisperBinaryReplacement(candidate)
      if (replacementPath === null) {
        continue
      }

      return replacementPath ?? candidate
    }
  }

  return null
}

async function resolveWhisperBinaryPath(resourcePath: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  return resolveWhisperBinaryPathWithSettings(resourcePath, env, undefined, undefined)
}

async function resolveWhisperBinaryPathWithSettings(
  resourcePath: string,
  env: NodeJS.ProcessEnv,
  userDataPath: string | undefined,
  extraBinaryDirectories: string[] | undefined
): Promise<string | null> {
  const settings = userDataPath ? await readAsrRuntimeSettings(userDataPath) : {}

  return resolveExecutablePath({
    overrides: [env.AIVPLAYER_WHISPER_CPP_BIN, settings.whisperBinaryPath],
    resourcePath,
    resourceDirectory: 'whisper.cpp',
    binaryNames: getWhisperBinaryNames(),
    env,
    extraBinaryDirectories
  })
}

export async function resolveFfmpegPath(
  resourcePath: string,
  env: NodeJS.ProcessEnv,
  extraBinaryDirectories: string[] | undefined
): Promise<string | null> {
  return resolveExecutablePath({
    overrides: [env.AIVPLAYER_FFMPEG_BIN],
    resourcePath,
    resourceDirectory: 'ffmpeg',
    binaryNames: getFfmpegBinaryNames(),
    env,
    extraBinaryDirectories
  })
}

export async function resolveFfprobePath(
  resourcePath: string,
  env: NodeJS.ProcessEnv,
  extraBinaryDirectories: string[] | undefined
): Promise<string | null> {
  return resolveExecutablePath({
    overrides: [env.AIVPLAYER_FFPROBE_BIN],
    resourcePath,
    resourceDirectory: 'ffmpeg',
    binaryNames: getFfprobeBinaryNames(),
    env,
    extraBinaryDirectories
  })
}

async function readWhisperVersion(binaryPath: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, ['--version'], { timeout: 4000 })
    const output = `${stdout}\n${stderr}`
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean)

    if (!output) {
      return null
    }

    const versionMatch = output.match(/version:\s*(.+)$/i)
    if (versionMatch?.[1]?.trim()) {
      return versionMatch[1].trim()
    }

    return output.length <= 80 && !/^usage:/i.test(output) ? output : null
  } catch {
    return null
  }
}

export function createWhisperCppRuntime(options: AsrRuntimeOptions): AsrRuntime {
  const env = options.env ?? process.env
  const recommendedModelManifest = getRecommendedWhisperModelManifest()
  const getCopy = (): ReturnType<typeof getAppCopy> => getAppCopy(options.getLocale?.())

  const getModelDirectory = (): string => env.AIVPLAYER_ASR_MODEL_DIR || getWhisperModelDirectory(options.userDataPath)

  const getSubtitleCacheDirectory = (): string => env.AIVPLAYER_ASR_CACHE_DIR || join(options.userDataPath, 'asr-cache')

  const readHealthStatus = async (): Promise<AsrRuntimeStatus> => {
    const copy = getCopy()
    const modelDirectory = getModelDirectory()
    const [binaryPath, ffmpegPath, installedModels] = await Promise.all([
      resolveWhisperBinaryPathWithSettings(
        options.resourcePath,
        env,
        options.userDataPath,
        options.extraBinaryDirectories
      ),
      resolveFfmpegPath(options.resourcePath, env, options.extraBinaryDirectories),
      listWhisperModels(modelDirectory)
    ])

    if (!binaryPath) {
      return {
        available: false,
        backend: 'whisper.cpp',
        binaryPath: null,
        ffmpegPath,
        modelDirectory,
        installedModels,
        recommendedModel: recommendedModelManifest.fileName,
        recommendedModelManifest,
        message: copy.runtime.asrEngineMissing
      }
    }

    if (!ffmpegPath) {
      return {
        available: false,
        backend: 'whisper.cpp',
        binaryPath,
        ffmpegPath: null,
        modelDirectory,
        installedModels,
        recommendedModel: recommendedModelManifest.fileName,
        recommendedModelManifest,
        message: copy.runtime.ffmpegMissing
      }
    }

    const version = await readWhisperVersion(binaryPath)
    const hasModel = installedModels.length > 0

    return {
      available: hasModel,
      backend: 'whisper.cpp',
      binaryPath,
      ffmpegPath,
      modelDirectory,
      installedModels,
      recommendedModel: recommendedModelManifest.fileName,
      recommendedModelManifest,
      message: hasModel
        ? copy.runtime.detectedWhisper(version)
        : copy.runtime.detectedWhisperWithoutModels(recommendedModelManifest.fileName)
    }
  }

  return {
    healthCheck: readHealthStatus,

    async configureWhisperBinaryPath(binaryPath: string): Promise<AsrRuntimeStatus> {
      const normalizedBinaryPath = await resolveExecutablePath({
        overrides: [binaryPath],
        resourcePath: options.resourcePath,
        resourceDirectory: 'whisper.cpp',
        binaryNames: getWhisperBinaryNames(),
        env,
        extraBinaryDirectories: options.extraBinaryDirectories
      })

      await saveWhisperBinaryPath(options.userDataPath, normalizedBinaryPath ?? binaryPath)
      return readHealthStatus()
    },

    async autoConfigureWhisperBinaryPath(): Promise<AsrRuntimeStatus> {
      const binaryPath = await resolveWhisperBinaryPathWithSettings(
        options.resourcePath,
        env,
        options.userDataPath,
        options.extraBinaryDirectories
      )

      if (binaryPath) {
        await saveWhisperBinaryPath(options.userDataPath, binaryPath)
      }

      return readHealthStatus()
    },

    async downloadModel(
      modelId: string | undefined,
      sourceId: AsrModelSourceId | undefined,
      onProgress?: (progress: AsrModelDownloadProgress) => void
    ): Promise<AsrModelDownloadResult> {
      const copy = getCopy()
      try {
        const model = await downloadWhisperModel({
          modelDirectory: getModelDirectory(),
          modelId,
          sourceId,
          onProgress,
          getLocale: options.getLocale
        })

        return {
          success: true,
          message: copy.runtime.modelDownloaded(model.name),
          sourceId,
          model
        }
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error)
        }
      }
    },

    async generateSubtitle(
      request: AsrSubtitleRequest,
      onProgress?: (progress: AsrJobProgress) => void
    ): Promise<AsrSubtitleResult> {
      const copy = getCopy()
      const status = await readHealthStatus()

      if (!status.binaryPath) {
        return {
          success: false,
          message: status.message
        }
      }

      if (!status.ffmpegPath) {
        return {
          success: false,
          message: status.message
        }
      }

      const model = selectWhisperModel(status.installedModels, request.modelId)

      if (!model) {
        return {
          success: false,
          message: copy.runtime.needModel(status.recommendedModel)
        }
      }

      try {
        const result = await runAsrSubtitleJob({
          ffmpegPath: status.ffmpegPath,
          whisperBinaryPath: status.binaryPath,
          modelPath: model.path,
          modelId: model.id,
          mediaPath: request.mediaPath,
          cacheDirectory: getSubtitleCacheDirectory(),
          language: request.language,
          onProgress,
          getLocale: options.getLocale
        })

        return {
          success: true,
          message: copy.runtime.subtitleGenerated,
          subtitlePath: result.subtitlePath,
          subtitleSrtPath: result.subtitleSrtPath,
          model
        }
      } catch (error) {
        onProgress?.({
          stage: 'failed',
          percent: null,
          message: error instanceof Error ? error.message : String(error)
        })

        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
          model
        }
      }
    },

    async resolveSubtitleCache(request: AsrSubtitleRequest): Promise<AsrSubtitleResult> {
      const copy = getCopy()
      const status = await readHealthStatus()
      const model = selectWhisperModel(status.installedModels, request.modelId)

      if (!model) {
        return {
          success: false,
          message: copy.runtime.needModel(status.recommendedModel)
        }
      }

      try {
        const cached = await findWhisperSubtitleCache({
          cacheDirectory: getSubtitleCacheDirectory(),
          mediaPath: request.mediaPath,
          modelId: model.id
        })

        if (!cached) {
          return {
            success: false,
            message: copy.runtime.subtitleCacheMiss,
            model
          }
        }

        return {
          success: true,
          message: copy.runtime.subtitleCacheHit,
          subtitlePath: cached.subtitlePath,
          subtitleSrtPath: cached.subtitleSrtPath,
          model
        }
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
          model
        }
      }
    },

    async exportSubtitleSrt(request: AsrSubtitleExportRequest): Promise<AsrSubtitleExportResult> {
      const copy = getCopy()
      try {
        const subtitleSrtPath = request.subtitleSrtPath ?? getSiblingSrtPath(request.subtitlePath)
        const subtitleVtt = await readFile(request.subtitlePath, 'utf8')
        const subtitleSrt = convertVttToSrt(subtitleVtt)

        await writeFile(subtitleSrtPath, subtitleSrt, 'utf8')

        return {
          success: true,
          message: copy.runtime.subtitleExported,
          subtitlePath: request.subtitlePath,
          subtitleSrtPath
        }
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
          subtitlePath: request.subtitlePath,
          subtitleSrtPath: request.subtitleSrtPath
        }
      }
    }
  }
}
