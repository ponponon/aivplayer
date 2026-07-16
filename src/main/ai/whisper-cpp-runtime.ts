import { delimiter, dirname, isAbsolute, join } from 'node:path'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { AsrRuntime, AsrRuntimeOptions, AsrTranslationJobOptions } from './asr-runtime.ts'
import { getWhisperModelDirectory, listWhisperModels, pathExists, selectWhisperModel } from './model-manager.ts'
import { getRecommendedWhisperModelManifest } from './asr-models.ts'
import { downloadWhisperModel } from './model-downloader.ts'
import {
  findWhisperSubtitleCache,
  readWhisperSubtitleLanguage,
  runAsrSubtitleJob
} from './asr-subtitle-job.ts'
import { convertVttToSrt } from './subtitle-writer.ts'
import { readAsrRuntimeSettings, saveWhisperBinaryPath } from './asr-settings.ts'
import { getWhisperBinaryNames, parseWhisperBinaryReplacementName } from './whisper-binary.ts'
import { getAppCopy } from '../../shared/i18n'
import type {
  AsrJobProgress,
  AsrErrorDetails,
  AsrModelDownloadProgress,
  AsrModelDownloadResult,
  AsrModelSourceId,
  AsrRuntimeStatus,
  AsrSubtitleExportRequest,
  AsrSubtitleExportResult,
  AsrSubtitleTranslationRequest,
  AsrSubtitleTranslationResult,
  AsrSubtitleSummaryRequest,
  AsrSubtitleSummaryResult,
  AsrTranslationServiceTestRequest,
  AsrTranslationServiceTestResult,
  AsrSubtitleRequest,
  AsrSubtitleResult
} from '../../shared/media-types.ts'
import {
  createOpenAiCompatibleTranslationProvider,
  createSubtitleTranslationProviderRef,
  findSubtitleTranslationCache,
  runSubtitleTranslationJob,
  SubtitleTranslationError
} from './subtitle-translation.ts'
import {
  createOpenAiCompatibleSummaryProvider,
  createSubtitleSummaryProviderRef,
  findSubtitleSummaryCache,
  runSubtitleSummaryJob,
  SubtitleSummaryError
} from './subtitle-summary.ts'

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
  validate?: (binaryPath: string) => Promise<boolean>
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

      const resolvedPath = replacementPath ?? candidate
      if (options.validate && !(await options.validate(resolvedPath))) {
        continue
      }

      return resolvedPath
    }
  }

  return null
}

async function canExecuteMediaBinary(binaryPath: string): Promise<boolean> {
  try {
    await execFileAsync(binaryPath, ['-version'], {
      timeout: 5000,
      maxBuffer: 256 * 1024
    })
    return true
  } catch {
    return false
  }
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
    extraBinaryDirectories,
    validate: canExecuteMediaBinary
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
    extraBinaryDirectories,
    validate: canExecuteMediaBinary
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

function getTranslationServiceProbeText(sourceLanguage: string): string {
  switch (sourceLanguage) {
    case 'ja':
      return '今日はいい天気ですね。字幕の翻訳を試しています。'
    case 'zh':
      return '今天的天气很好，我们正在测试字幕翻译。'
    case 'ko':
      return '오늘은 날씨가 정말 좋네요. 자막 번역을 시험하고 있습니다.'
    case 'en':
    default:
      return 'When you hear the word technology, you think about phones, you think about air.'
  }
}

function summarizeTranslationServiceEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim()

  if (!trimmed) {
    return ''
  }

  try {
    const url = new URL(trimmed)
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, '')
  } catch {
    return trimmed.replace(/[?#].*$/, '')
  }
}

function formatTranslationServiceError(
  copy: ReturnType<typeof getAppCopy>,
  error: unknown
): { message: string; errorDetails?: AsrErrorDetails } {
  if (error instanceof SubtitleTranslationError) {
    const errorDetails: AsrErrorDetails = {
      code: error.code,
      status: error.status,
      statusText: error.statusText,
      responseBody: error.responseBody
        ?.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_API_KEY]') || undefined
    }

    switch (error.code) {
      case 'cancelled':
        return { message: copy.runtime.subtitleTranslationCanceled, errorDetails }
      case 'network-error':
        return { message: copy.runtime.translationServiceNetworkError, errorDetails }
      case 'http-error':
        return {
          message: copy.runtime.translationServiceHttpError(error.status ?? 0, error.statusText ?? null),
          errorDetails
        }
      case 'invalid-json':
        return { message: copy.runtime.translationServiceInvalidJson, errorDetails }
      case 'invalid-response':
        return { message: copy.runtime.translationServiceInvalidResponse, errorDetails }
      default:
        return { message: error.message, errorDetails }
    }
  }

  if (error instanceof Error) {
    return { message: error.message }
  }

  return { message: String(error) }
}

function formatSummaryServiceError(
  copy: ReturnType<typeof getAppCopy>,
  error: unknown
): { message: string; errorDetails?: AsrErrorDetails } {
  if (error instanceof SubtitleSummaryError) {
    const errorDetails: AsrErrorDetails = {
      code: error.code,
      status: error.status,
      statusText: error.statusText,
      responseBody: error.responseBody
        ?.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_API_KEY]') || undefined
    }

    switch (error.code) {
      case 'cancelled': return { message: copy.runtime.subtitleSummaryCanceled, errorDetails }
      case 'network-error': return { message: copy.runtime.summaryServiceNetworkError, errorDetails }
      case 'http-error': return { message: copy.runtime.summaryServiceHttpError(error.status ?? 0, error.statusText ?? null), errorDetails }
      case 'invalid-json': return { message: copy.runtime.summaryServiceInvalidJson, errorDetails }
      case 'invalid-response': return { message: copy.runtime.summaryServiceInvalidResponse, errorDetails }
      default: return { message: error.message, errorDetails }
    }
  }

  return { message: error instanceof Error ? error.message : String(error) }
}

export function createWhisperCppRuntime(options: AsrRuntimeOptions): AsrRuntime {
  const env = options.env ?? process.env
  const recommendedModelManifest = getRecommendedWhisperModelManifest()
  const getCopy = (): ReturnType<typeof getAppCopy> => getAppCopy(options.getLocale?.())

  const getModelDirectory = (): string => env.AIVPLAYER_ASR_MODEL_DIR || getWhisperModelDirectory(options.userDataPath)

  const getSubtitleCacheDirectory = (): string => env.AIVPLAYER_ASR_CACHE_DIR || join(options.userDataPath, 'asr-cache')

  const getTranslationServiceConfig = (): {
    baseUrl: string | null
    apiKey: string | null
    model: string | null
    glossary: string | null
  } => {
    const translationSettings = options.getTranslationServiceSettings?.()
    return {
      baseUrl: translationSettings?.translationBaseUrl?.trim() || env.AIVPLAYER_TRANSLATION_BASE_URL?.trim() || null,
      apiKey: translationSettings?.translationApiKey?.trim() || env.AIVPLAYER_TRANSLATION_API_KEY?.trim() || null,
      model: translationSettings?.translationModel?.trim() || env.AIVPLAYER_TRANSLATION_MODEL?.trim() || null,
      glossary:
        translationSettings?.translationGlossary?.trim() || env.AIVPLAYER_TRANSLATION_GLOSSARY?.trim() || null
    }
  }

  const getTranslationModel = (): string | null => {
    return getTranslationServiceConfig().model
  }

  const createTranslationProvider = () => {
    const { baseUrl, apiKey, model, glossary } = getTranslationServiceConfig()

    if (!baseUrl || !apiKey || !model) {
      return null
    }

    return createOpenAiCompatibleTranslationProvider({
      baseUrl,
      apiKey,
      model,
      glossary,
      fetchImpl: options.translationFetch
    })
  }

  const getTranslationProviderRef = () => {
    const config = getTranslationServiceConfig()
    return createSubtitleTranslationProviderRef(config.model, config.glossary)
  }

  const createSummaryProvider = () => {
    const { baseUrl, apiKey, model } = getTranslationServiceConfig()
    if (!baseUrl || !apiKey || !model) return null
    return createOpenAiCompatibleSummaryProvider({ baseUrl, apiKey, model, fetchImpl: options.translationFetch })
  }

  const getSummaryProviderRef = () => createSubtitleSummaryProviderRef(getTranslationServiceConfig().model)

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
        whisperVersion: null,
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
        whisperVersion: null,
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
      whisperVersion: version,
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
      onProgress?: (progress: AsrJobProgress) => void,
      jobOptions: { signal?: AbortSignal } = {}
    ): Promise<AsrSubtitleResult> {
      const startedAt = performance.now()
      const createFailureStats = () => ({
        elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
        subtitleCueCount: 0,
        cacheHit: false
      })
      const copy = getCopy()
      const status = await readHealthStatus()

      if (!status.binaryPath) {
        return {
          success: false,
          message: status.message,
          generationStats: createFailureStats()
        }
      }

      if (!status.ffmpegPath) {
        return {
          success: false,
          message: status.message,
          generationStats: createFailureStats()
        }
      }

      const model = selectWhisperModel(status.installedModels, request.modelId)

      if (!model) {
        return {
          success: false,
          message: copy.runtime.needModel(status.recommendedModel),
          generationStats: createFailureStats()
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
          signal: jobOptions.signal,
          onProgress,
          getLocale: options.getLocale
        })

        return {
          success: true,
          message: copy.runtime.subtitleGenerated,
          subtitlePath: result.subtitlePath,
          subtitleSrtPath: result.subtitleSrtPath,
          subtitleLanguage: result.subtitleLanguage,
          model,
          generationStats: result.generationStats
        }
      } catch (error) {
        const canceled = jobOptions.signal?.aborted === true
        onProgress?.({
          stage: canceled ? 'cancelled' : 'failed',
          percent: null,
          message: canceled ? copy.runtime.subtitleGenerationCanceled : error instanceof Error ? error.message : String(error)
        })

        return {
          success: false,
          message: canceled ? copy.runtime.subtitleGenerationCanceled : error instanceof Error ? error.message : String(error),
          canceled,
          model,
          generationStats: createFailureStats()
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
          subtitleLanguage: (await readWhisperSubtitleLanguage(cached.outputBase)) ?? undefined,
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

    async resolveTranslatedSubtitleCache(
      request: AsrSubtitleTranslationRequest
    ): Promise<AsrSubtitleTranslationResult> {
      const copy = getCopy()
      const sourceLanguage = request.sourceLanguage ?? 'auto'
      const provider = getTranslationProviderRef()
      const translationGlossary = getTranslationServiceConfig().glossary ?? undefined

      if (!provider) {
        return {
          success: false,
          message: copy.runtime.translationServiceMissing,
          sourceSubtitlePath: request.subtitlePath,
          sourceLanguage,
          targetLanguage: request.targetLanguage,
          translationGlossary
        }
      }

      try {
        const cached = await findSubtitleTranslationCache({
          cacheDirectory: getSubtitleCacheDirectory(),
          sourceSubtitlePath: request.subtitlePath,
          sourceLanguage,
          targetLanguage: request.targetLanguage,
          provider
        })

        if (!cached) {
          return {
            success: false,
            message: copy.runtime.subtitleCacheMiss,
            sourceSubtitlePath: request.subtitlePath,
            sourceLanguage,
            targetLanguage: request.targetLanguage,
            translationModel: provider.model,
            translationGlossary: provider.glossary ?? undefined
          }
        }

        return {
          success: true,
          message: copy.runtime.subtitleTranslated,
          sourceSubtitlePath: request.subtitlePath,
          sourceLanguage,
          targetLanguage: request.targetLanguage,
          translationModel: provider.model,
          translationGlossary: provider.glossary ?? undefined,
          subtitlePath: cached.subtitlePath,
          subtitleSrtPath: cached.subtitleSrtPath
        }
      } catch (error) {
        return {
          success: false,
          ...formatTranslationServiceError(copy, error),
          sourceSubtitlePath: request.subtitlePath,
          sourceLanguage,
          targetLanguage: request.targetLanguage,
          translationModel: provider.model,
          translationGlossary: provider.glossary ?? undefined
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
    },

    async translateSubtitle(
      request: AsrSubtitleTranslationRequest,
      jobOptions: AsrTranslationJobOptions = {}
    ): Promise<AsrSubtitleTranslationResult> {
      const copy = getCopy()
      const sourceLanguage = request.sourceLanguage ?? 'auto'
      const provider = createTranslationProvider()

      if (!provider) {
        return {
          success: false,
          message: copy.runtime.translationServiceMissing,
          sourceSubtitlePath: request.subtitlePath,
          sourceLanguage,
          targetLanguage: request.targetLanguage,
          translationGlossary: getTranslationServiceConfig().glossary ?? undefined
        }
      }

      try {
        jobOptions.onProgress?.({
          stage: 'translating',
          percent: 0,
          message: copy.asrPanel.translatingSubtitle
        })

        const result = await runSubtitleTranslationJob({
          sourceSubtitlePath: request.subtitlePath,
          cacheDirectory: getSubtitleCacheDirectory(),
          sourceLanguage,
          targetLanguage: request.targetLanguage,
          provider,
          signal: jobOptions.signal,
          onProgress: (progress) => {
            jobOptions.onProgress?.({
              stage: 'translating',
              percent: progress.percent,
              message: copy.asrPanel.translationProgress(
                progress.completedBatches,
                progress.totalBatches
              )
            })
          }
        })

        jobOptions.onProgress?.({
          stage: 'completed',
          percent: 1,
          message: copy.runtime.subtitleTranslated
        })

        return {
          success: true,
          message: copy.runtime.subtitleTranslated,
          sourceSubtitlePath: request.subtitlePath,
          sourceLanguage,
          targetLanguage: request.targetLanguage,
          translationModel: provider.model,
          translationGlossary: provider.glossary ?? undefined,
          translationStats: result.translationStats,
          subtitlePath: result.subtitlePath,
          subtitleSrtPath: result.subtitleSrtPath
        }
      } catch (error) {
        const failure = formatTranslationServiceError(copy, error)
        const canceled = error instanceof SubtitleTranslationError && error.code === 'cancelled'
        jobOptions.onProgress?.({
          stage: canceled ? 'cancelled' : 'failed',
          percent: null,
          message: failure.message
        })

        return {
          success: false,
          message: failure.message,
          canceled,
          sourceSubtitlePath: request.subtitlePath,
          sourceLanguage,
          targetLanguage: request.targetLanguage,
          translationModel: provider.model,
          translationGlossary: provider.glossary ?? undefined
        }
      }
    },
    async resolveSubtitleSummaryCache(
      request: AsrSubtitleSummaryRequest
    ): Promise<AsrSubtitleSummaryResult> {
      const copy = getCopy()
      const sourceLanguage = request.sourceLanguage ?? 'auto'
      const mode = request.mode ?? 'quick'
      const provider = getSummaryProviderRef()
      if (!provider) return { success: false, message: copy.runtime.summaryServiceMissing, sourceSubtitlePath: request.subtitlePath, sourceLanguage, targetLanguage: request.targetLanguage, mode }
      const summary = await findSubtitleSummaryCache({
        sourceSubtitlePath: request.subtitlePath,
        cacheDirectory: getSubtitleCacheDirectory(),
        sourceLanguage,
        targetLanguage: request.targetLanguage,
        mode,
        provider
      })
      if (!summary) return { success: false, message: copy.runtime.subtitleSummaryCacheMiss, sourceSubtitlePath: request.subtitlePath, sourceLanguage, targetLanguage: request.targetLanguage, mode, summaryModel: provider.model }
      return { success: true, message: copy.runtime.subtitleSummaryCacheHit, sourceSubtitlePath: request.subtitlePath, sourceLanguage, targetLanguage: request.targetLanguage, mode, summaryModel: provider.model, summary }
    },
    async summarizeSubtitle(
      request: AsrSubtitleSummaryRequest,
      jobOptions: AsrTranslationJobOptions = {}
    ): Promise<AsrSubtitleSummaryResult> {
      const copy = getCopy()
      const sourceLanguage = request.sourceLanguage ?? 'auto'
      const mode = request.mode ?? 'quick'
      const provider = createSummaryProvider()
      if (!provider) return { success: false, message: copy.runtime.summaryServiceMissing, sourceSubtitlePath: request.subtitlePath, sourceLanguage, targetLanguage: request.targetLanguage, mode }
      try {
        jobOptions.onProgress?.({ stage: 'summarizing', percent: 0, message: copy.asrPanel.summarizingSubtitle })
        const result = await runSubtitleSummaryJob({
          sourceSubtitlePath: request.subtitlePath,
          cacheDirectory: getSubtitleCacheDirectory(),
          sourceLanguage,
          targetLanguage: request.targetLanguage,
          mode,
          force: request.force,
          provider,
          signal: jobOptions.signal,
          onProgress: (progress) => jobOptions.onProgress?.({ stage: 'summarizing', percent: progress.percent, message: copy.asrPanel.summaryProgress(progress.completedSteps, progress.totalSteps) })
        })
        jobOptions.onProgress?.({ stage: 'completed', percent: 1, message: copy.runtime.subtitleSummaryGenerated })
        return { success: true, message: copy.runtime.subtitleSummaryGenerated, sourceSubtitlePath: request.subtitlePath, sourceLanguage, targetLanguage: request.targetLanguage, mode, summaryModel: provider.model, summary: result.summary, summaryStats: result.summaryStats }
      } catch (error) {
        const failure = formatSummaryServiceError(copy, error)
        const canceled = error instanceof SubtitleSummaryError && error.code === 'cancelled'
        jobOptions.onProgress?.({ stage: canceled ? 'cancelled' : 'failed', percent: null, message: failure.message })
        return { success: false, message: failure.message, canceled, sourceSubtitlePath: request.subtitlePath, sourceLanguage, targetLanguage: request.targetLanguage, mode, summaryModel: provider.model, errorDetails: failure.errorDetails }
      }
    },
    async testTranslationService(
      request: AsrTranslationServiceTestRequest
    ): Promise<AsrTranslationServiceTestResult> {
      const copy = getCopy()
      const sourceLanguage = request.sourceLanguage ?? 'auto'
      const translationServiceConfig = getTranslationServiceConfig()
      const provider =
        translationServiceConfig.baseUrl && translationServiceConfig.apiKey && translationServiceConfig.model
          ? createOpenAiCompatibleTranslationProvider({
              baseUrl: translationServiceConfig.baseUrl,
              apiKey: translationServiceConfig.apiKey,
              model: translationServiceConfig.model,
              glossary: translationServiceConfig.glossary,
              fetchImpl: options.translationFetch
            })
          : null
      const translationModel = provider?.model ?? translationServiceConfig.model ?? undefined
      const translationBaseUrlSummary = translationServiceConfig.baseUrl
        ? summarizeTranslationServiceEndpoint(translationServiceConfig.baseUrl)
        : undefined
      const sampleSourceText = getTranslationServiceProbeText(sourceLanguage)

      if (!provider) {
        return {
          success: false,
          message: copy.runtime.translationServiceMissing,
          sourceLanguage,
          targetLanguage: request.targetLanguage,
          translationModel,
          translationBaseUrlSummary,
          sampleSourceText
        }
      }

      try {
        const translatedSegments = await provider.translateBatch({
          sourceLanguage,
          targetLanguage: request.targetLanguage,
          segments: [{ id: 'cue-1', text: sampleSourceText }]
        })
        const sampleTranslatedText = translatedSegments[0]?.text?.trim()

        if (!sampleTranslatedText) {
          return {
            success: false,
            message: copy.runtime.translationServiceEmptyResponse,
            sourceLanguage,
            targetLanguage: request.targetLanguage,
            translationModel,
            translationBaseUrlSummary,
            sampleSourceText
          }
        }

        return {
          success: true,
          message: copy.runtime.translationServiceReady(provider.model),
          sourceLanguage,
          targetLanguage: request.targetLanguage,
          translationModel,
          translationBaseUrlSummary,
          sampleSourceText,
          sampleTranslatedText
        }
      } catch (error) {
        const failure = formatTranslationServiceError(copy, error)

        return {
          success: false,
          message: failure.message,
          sourceLanguage,
          targetLanguage: request.targetLanguage,
          translationModel,
          translationBaseUrlSummary,
          sampleSourceText,
          errorDetails: failure.errorDetails
        }
      }
    }
  }
}
