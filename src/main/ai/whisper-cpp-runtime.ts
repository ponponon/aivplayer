import { delimiter, isAbsolute, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AsrRuntime, AsrRuntimeOptions } from './asr-runtime.ts'
import { getWhisperModelDirectory, listWhisperModels, pathExists, selectWhisperModel } from './model-manager.ts'
import { getRecommendedWhisperModelManifest } from './asr-models.ts'
import { downloadWhisperModel } from './model-downloader.ts'
import { runAsrSubtitleJob } from './asr-subtitle-job.ts'
import type {
  AsrJobProgress,
  AsrModelDownloadProgress,
  AsrModelDownloadResult,
  AsrModelSourceId,
  AsrRuntimeStatus,
  AsrSubtitleRequest,
  AsrSubtitleResult
} from '../../shared/media-types.ts'

const execFileAsync = promisify(execFile)

const POSIX_BINARY_NAMES = ['whisper-cli', 'whisper-cpp', 'main']
const WINDOWS_BINARY_NAMES = ['whisper-cli.exe', 'whisper-cpp.exe', 'main.exe']
const POSIX_FFMPEG_BINARY_NAMES = ['ffmpeg']
const WINDOWS_FFMPEG_BINARY_NAMES = ['ffmpeg.exe']

function getWhisperBinaryNames(): string[] {
  return process.platform === 'win32' ? WINDOWS_BINARY_NAMES : POSIX_BINARY_NAMES
}

function getFfmpegBinaryNames(): string[] {
  return process.platform === 'win32' ? WINDOWS_FFMPEG_BINARY_NAMES : POSIX_FFMPEG_BINARY_NAMES
}

function getBundledBinaryCandidates(resourcePath: string, resourceDirectory: string, binaryNames: string[]): string[] {
  return binaryNames.map((binaryName) => join(resourcePath, resourceDirectory, binaryName))
}

function getPathBinaryCandidates(env: NodeJS.ProcessEnv, binaryNames: string[]): string[] {
  const pathValue = env.PATH ?? ''

  return pathValue
    .split(delimiter)
    .filter(Boolean)
    .flatMap((directory) => binaryNames.map((binaryName) => join(directory, binaryName)))
}

async function resolveExecutablePath(options: {
  override: string | undefined
  resourcePath: string
  resourceDirectory: string
  binaryNames: string[]
  env: NodeJS.ProcessEnv
}): Promise<string | null> {
  const candidates = [
    ...(options.override ? [options.override] : []),
    ...getBundledBinaryCandidates(options.resourcePath, options.resourceDirectory, options.binaryNames),
    ...getPathBinaryCandidates(options.env, options.binaryNames)
  ].filter((candidate) => isAbsolute(candidate))

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }

  return null
}

async function resolveWhisperBinaryPath(resourcePath: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  return resolveExecutablePath({
    override: env.AIVPLAYER_WHISPER_CPP_BIN,
    resourcePath,
    resourceDirectory: 'whisper.cpp',
    binaryNames: getWhisperBinaryNames(),
    env
  })
}

async function resolveFfmpegPath(resourcePath: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  return resolveExecutablePath({
    override: env.AIVPLAYER_FFMPEG_BIN,
    resourcePath,
    resourceDirectory: 'ffmpeg',
    binaryNames: getFfmpegBinaryNames(),
    env
  })
}

async function readWhisperVersion(binaryPath: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, ['--help'], { timeout: 4000 })
    const output = `${stdout}\n${stderr}`.trim()
    return output.split('\n')[0] || null
  } catch {
    return null
  }
}

export function createWhisperCppRuntime(options: AsrRuntimeOptions): AsrRuntime {
  const env = options.env ?? process.env
  const recommendedModelManifest = getRecommendedWhisperModelManifest()

  const getModelDirectory = (): string => env.AIVPLAYER_ASR_MODEL_DIR || getWhisperModelDirectory(options.userDataPath)

  const getSubtitleCacheDirectory = (): string => env.AIVPLAYER_ASR_CACHE_DIR || join(options.userDataPath, 'asr-cache')

  const readHealthStatus = async (): Promise<AsrRuntimeStatus> => {
    const modelDirectory = getModelDirectory()
    const [binaryPath, ffmpegPath, installedModels] = await Promise.all([
      resolveWhisperBinaryPath(options.resourcePath, env),
      resolveFfmpegPath(options.resourcePath, env),
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
        message: '未找到 whisper.cpp，可将 whisper-cli 放到 resources/whisper.cpp，或设置 AIVPLAYER_WHISPER_CPP_BIN。'
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
        message: '未找到 ffmpeg，可将 ffmpeg 放到 resources/ffmpeg，或设置 AIVPLAYER_FFMPEG_BIN。'
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
        ? `已检测到 whisper.cpp${version ? `：${version}` : ''}`
        : `已检测到 whisper.cpp 和 ffmpeg，但模型目录暂无模型；建议下载 ${recommendedModelManifest.fileName}。`
    }
  }

  return {
    healthCheck: readHealthStatus,

    async downloadModel(
      modelId: string | undefined,
      sourceId: AsrModelSourceId | undefined,
      onProgress?: (progress: AsrModelDownloadProgress) => void
    ): Promise<AsrModelDownloadResult> {
      try {
        const model = await downloadWhisperModel({
          modelDirectory: getModelDirectory(),
          modelId,
          sourceId,
          onProgress
        })

        return {
          success: true,
          message: `模型已就绪：${model.name}`,
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
          message: `还没有可用 ASR 模型，请先下载 ${status.recommendedModel}。`
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
          onProgress
        })

        return {
          success: true,
          message: '字幕生成完成。',
          subtitlePath: result.subtitlePath,
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
    }
  }
}
