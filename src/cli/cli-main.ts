import { app } from 'electron'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { createMediaProbeMetadata } from '../main/media/media-metadata'
import { getAsrRuntime, getVisionLibrary, resolveResourcePath } from '../main/main-services'
import { convertVttToSrt } from '../main/ai/subtitle-writer'
import { getSiblingSrtPath } from '../main/ai/whisper-cpp-runtime'
import { scanVisionDirectory } from '../main/ai/vision-directory-scan'
import { isVideoFilePath } from '../main/media/file-opening'
import type { AsrSubtitleResult, AsrSubtitleTranslationRequest, AsrSubtitleTranslationResult } from '../shared/asr-types'
import { getCliOption, hasCliOption, parseCliArgs, type ParsedCliArgs } from './cli-parser'
import { formatBatchResult, runBatch } from './cli-batch'
import { BatchPlanError } from './cli-batch-plan'
import { runDrama } from './cli-drama'

const FALLBACK_CLI_VERSION = '0.1.0'

function getVersion(): string {
  return app.getVersion() || FALLBACK_CLI_VERSION
}

export class CliError extends Error {
  readonly exitCode: number
  readonly details?: unknown

  constructor(message: string, exitCode = 2, details?: unknown) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
    this.details = details
  }
}

function writeStdout(value: string): void {
  process.stdout.write(`${value}\n`)
}

function writeStderr(value: string): void {
  process.stderr.write(`${value}\n`)
}

function printJson(parsed: ParsedCliArgs, value: unknown): void {
  if (parsed.global.json) {
    writeStdout(JSON.stringify(value, null, 2))
  }
}

function printHuman(parsed: ParsedCliArgs, value: string): void {
  if (!parsed.global.json) writeStdout(value)
}

function reportProgress(parsed: ParsedCliArgs, message: string): void {
  if (!parsed.global.quiet) writeStderr(message)
}

function optionOr(parsed: ParsedCliArgs, key: string, fallback: string): string {
  return getCliOption(parsed, key) ?? fallback
}

function requirePositionals(parsed: ParsedCliArgs, count: number, usage: string): void {
  if (parsed.positionals.length < count) throw new CliError(`缺少参数。用法：${usage}`)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '未知'
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainingSeconds = total % 60
  return hours > 0 ? `${hours}小时${minutes}分${remainingSeconds}秒` : `${minutes}分${remainingSeconds}秒`
}

function printHelp(): void {
  writeStdout(`aivcli ${getVersion()}

用法：
  aivcli doctor [--json]
  aivcli media info <video>
  aivcli asr <video...> [--language auto] [--model id] [--format both|vtt|srt] [--output-dir dir] [--force]
  aivcli subtitle convert <input.vtt> [--output output.srt]
  aivcli subtitle translate <input.vtt> --to zh|en|ja|ko [--from auto] [--output-dir dir] [--force]
  aivcli batch <directory-or-video...> --asr [--translate zh] [--index] [--recursive] [--resume]
             [--retry N] [--state-file path] [--reset-state] [--fail-fast]
  aivcli library status
  aivcli library scan <directory> [--recursive]
  aivcli library index <directory-or-video...> [--recursive] [--interval seconds]
  aivcli library search <text> [--limit 24] [--mode hybrid|visual]
  aivcli library search --image <image> [--limit 24]
  aivcli drama list
  aivcli drama create <title> [--intro text] [--genre name] [--episodes N] [--duration seconds]
  aivcli drama import <project-id> <novel.txt>
  aivcli drama show <project-id>
  aivcli drama provider show|test
  aivcli drama events generate <project-id> [--force]
  aivcli drama plan generate <project-id> --stage skeleton|adaptation [--force]
  aivcli drama script generate <project-id> --episode N [--force]
  aivcli drama assets generate <project-id> [--force]
  aivcli drama storyboard generate <project-id> --episode N [--force]
  aivcli drama run <project-id> --episode N [--force]

全局选项：
  --json       将结果输出为机器可读 JSON
  --quiet      不输出进度信息
  --no-color   禁用终端颜色（预留）
  -h, --help   显示帮助
`)
}

function normalizeLanguage(parsed: ParsedCliArgs): string | undefined {
  const language = getCliOption(parsed, 'language')
  return language && language !== 'auto' ? language : undefined
}

function selectSubtitlePaths(
  result: { subtitlePath?: string; subtitleSrtPath?: string },
  format: string
): Array<{ format: 'vtt' | 'srt'; path: string }> {
  const paths: Array<{ format: 'vtt' | 'srt'; path: string }> = []
  if ((format === 'both' || format === 'vtt') && result.subtitlePath) paths.push({ format: 'vtt', path: result.subtitlePath })
  if ((format === 'both' || format === 'srt') && result.subtitleSrtPath) paths.push({ format: 'srt', path: result.subtitleSrtPath })
  return paths
}

async function copySubtitleOutputs(
  inputPath: string,
  outputs: Array<{ format: 'vtt' | 'srt'; path: string }>,
  outputDirectory: string
): Promise<Array<{ format: 'vtt' | 'srt'; path: string }>> {
  await mkdir(outputDirectory, { recursive: true })
  const stem = basename(inputPath, extname(inputPath))
  const copied: Array<{ format: 'vtt' | 'srt'; path: string }> = []
  for (const output of outputs) {
    const targetPath = join(outputDirectory, `${stem}.${output.format}`)
    await copyFile(output.path, targetPath)
    copied.push({ format: output.format, path: targetPath })
  }
  return copied
}

async function runDoctor(parsed: ParsedCliArgs): Promise<number> {
  const [asr, vision] = await Promise.all([getAsrRuntime().healthCheck(), getVisionLibrary().getStatus()])
  const result = {
    ok: asr.available && vision.available,
    version: getVersion(),
    asr,
    vision
  }
  printJson(parsed, result)
  printHuman(parsed, [
    `aivcli ${getVersion()}`,
    `ASR：${asr.available ? '可用' : '不可用'}${asr.message ? `（${asr.message}）` : ''}`,
    `whisper.cpp：${asr.binaryPath ?? '未找到'}`,
    `ffmpeg：${asr.ffmpegPath ?? '未找到'}`,
    `模型：${asr.installedModels.length} 个，目录 ${asr.modelDirectory}`,
    `影视库：${vision.available ? '可用' : '不可用'}，${vision.indexedVideoCount} 个视频，${vision.indexedFrameCount} 帧`,
    `影视库目录：${vision.indexDirectory}`
  ].join('\n'))
  return result.ok ? 0 : 4
}

async function runMediaInfo(parsed: ParsedCliArgs): Promise<number> {
  requirePositionals(parsed, 1, 'aivcli media info <video>')
  const filePath = resolve(parsed.positionals[0] as string)
  const metadata = await createMediaProbeMetadata(filePath, { resourcePath: resolveResourcePath(), env: process.env })
  if (!metadata) throw new CliError(`文件不存在：${filePath}`, 3)
  const result = { ok: true, path: filePath, metadata }
  printJson(parsed, result)
  printHuman(parsed, [
    `文件：${filePath}`,
    `大小：${formatBytes(metadata.fileSizeBytes)}`,
    `时长：${formatDuration(metadata.durationSeconds)}`,
    `探测来源：${metadata.probeSource ?? '无'}`,
    `视频：${metadata.video ? `${metadata.video.codec ?? '未知'} ${metadata.video.width ?? '?'}x${metadata.video.height ?? '?'}` : '无'}`,
    `音频：${metadata.audio ? `${metadata.audio.codec ?? '未知'} ${metadata.audio.channelLayout ?? ''}`.trim() : '无'}`
  ].join('\n'))
  return 0
}

async function runAsr(parsed: ParsedCliArgs): Promise<number> {
  requirePositionals(parsed, 1, 'aivcli asr <video...>')
  const format = optionOr(parsed, 'format', 'both')
  if (!['both', 'vtt', 'srt'].includes(format)) throw new CliError('--format 只能是 both、vtt 或 srt')
  const outputDirectoryValue = getCliOption(parsed, 'output-dir')
  const outputDirectory = outputDirectoryValue ? resolve(outputDirectoryValue) : undefined
  const runtime = getAsrRuntime()
  const results: Array<Record<string, unknown>> = []
  let failed = false

  for (const rawPath of parsed.positionals) {
    const mediaPath = resolve(rawPath)
    if (!isVideoFilePath(mediaPath)) {
      failed = true
      results.push({ ok: false, path: mediaPath, error: { code: 'INVALID_MEDIA', message: `不是支持的视频文件：${mediaPath}` } })
      continue
    }
    try {
      const mediaStat = await stat(mediaPath)
      if (!mediaStat.isFile()) throw new Error('不是文件')
    } catch {
      failed = true
      results.push({ ok: false, path: mediaPath, error: { code: 'INPUT_NOT_FOUND', message: `文件不存在：${mediaPath}` } })
      continue
    }

    reportProgress(parsed, `开始生成字幕：${mediaPath}`)
    const request = { mediaPath, modelId: getCliOption(parsed, 'model'), language: normalizeLanguage(parsed) }
    const cached: AsrSubtitleResult | null = hasCliOption(parsed, 'force') ? null : await runtime.resolveSubtitleCache(request)
    const result = cached?.success === true
      ? cached
      : await runtime.generateSubtitle(request, (progress) => {
          if (progress.percent == null) reportProgress(parsed, `${mediaPath}：${progress.message}`)
          else reportProgress(parsed, `${mediaPath}：${progress.percent}% ${progress.message}`)
        })
    if (!result.success) {
      failed = true
      results.push({ ok: false, path: mediaPath, message: result.message, canceled: result.canceled === true })
      continue
    }

    let outputs = selectSubtitlePaths(result, format)
    if (outputDirectory) outputs = await copySubtitleOutputs(mediaPath, outputs, outputDirectory)
    results.push({
      ok: true,
      path: mediaPath,
      subtitleLanguage: result.subtitleLanguage,
      model: result.model,
      generationStats: result.generationStats,
      outputs
    })
    reportProgress(parsed, cached?.success === true ? `命中字幕缓存：${mediaPath}` : `字幕完成：${mediaPath}`)
  }

  const payload = { ok: !failed, command: 'asr', results }
  printJson(parsed, payload)
  if (!parsed.global.json) {
    for (const result of results) {
      if (result.ok) {
        const outputs = result.outputs as Array<{ format: string; path: string }>
        printHuman(parsed, `${String(result.path)}\n${outputs.map((output) => `  ${output.format}: ${output.path}`).join('\n')}`)
      } else {
        printHuman(parsed, `${String(result.path)}：失败${result.message ? `，${String(result.message)}` : ''}`)
      }
    }
  }
  return failed ? 4 : 0
}

async function runSubtitle(parsed: ParsedCliArgs): Promise<number> {
  const action = parsed.positionals[0]
  if (action === 'translate') return runSubtitleTranslate(parsed)
  if (action !== 'convert') throw new CliError('目前只支持 subtitle convert 和 subtitle translate')
  requirePositionals({ ...parsed, positionals: parsed.positionals.slice(1) }, 1, 'aivcli subtitle convert <input.vtt>')
  const inputPath = resolve(parsed.positionals[1] as string)
  if (extname(inputPath).toLowerCase() !== '.vtt') throw new CliError('subtitle convert 目前只接受 VTT 文件')
  const outputPath = resolve(getCliOption(parsed, 'output') ?? getSiblingSrtPath(inputPath))
  const content = await readFile(inputPath, 'utf8')
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, convertVttToSrt(content), 'utf8')
  const result = { ok: true, inputPath, outputPath, format: 'srt' }
  printJson(parsed, result)
  printHuman(parsed, `已转换：${outputPath}`)
  return 0
}

function normalizeTargetLanguage(value: string | undefined): AsrSubtitleTranslationRequest['targetLanguage'] {
  const aliases: Record<string, AsrSubtitleTranslationRequest['targetLanguage']> = {
    zh: 'zh',
    'zh-CN': 'zh',
    en: 'en',
    'en-US': 'en',
    ja: 'ja',
    'ja-JP': 'ja',
    ko: 'ko',
    'ko-KR': 'ko'
  }
  const normalized = value ? aliases[value] : undefined
  if (!normalized) throw new CliError('--to 必须是 zh、en、ja 或 ko')
  return normalized
}

async function runSubtitleTranslate(parsed: ParsedCliArgs): Promise<number> {
  requirePositionals({ ...parsed, positionals: parsed.positionals.slice(1) }, 1, 'aivcli subtitle translate <input.vtt> --to zh|en|ja|ko')
  const subtitlePath = resolve(parsed.positionals[1] as string)
  const targetLanguage = normalizeTargetLanguage(getCliOption(parsed, 'to') ?? getCliOption(parsed, 'target-language'))
  const sourceLanguage = getCliOption(parsed, 'from') ?? 'auto'
  const request: AsrSubtitleTranslationRequest = {
    mediaPath: resolve(getCliOption(parsed, 'media') ?? subtitlePath),
    subtitlePath,
    sourceLanguage,
    targetLanguage
  }
  try {
    const subtitleStat = await stat(subtitlePath)
    if (!subtitleStat.isFile()) throw new Error('不是文件')
  } catch {
    throw new CliError(`字幕文件不存在：${subtitlePath}`, 3)
  }

  const runtime = getAsrRuntime()
  const cached: AsrSubtitleTranslationResult | null = hasCliOption(parsed, 'force') ? null : await runtime.resolveTranslatedSubtitleCache(request)
  const result = cached?.success === true
    ? cached
    : await runtime.translateSubtitle(request, {
        onProgress: (progress) => {
          if (progress.percent == null) reportProgress(parsed, progress.message)
          else reportProgress(parsed, `${progress.percent}% ${progress.message}`)
        }
      })
  if (!result.success) {
    const payload = { ok: false, command: 'subtitle translate', inputPath: subtitlePath, targetLanguage, message: result.message, errorDetails: result.errorDetails }
    printJson(parsed, payload)
    printHuman(parsed, `翻译失败：${result.message}`)
    return 5
  }

  let outputs = selectSubtitlePaths(result, optionOr(parsed, 'format', 'both'))
  const outputDirectoryValue = getCliOption(parsed, 'output-dir')
  if (outputDirectoryValue) outputs = await copySubtitleOutputs(subtitlePath, outputs, resolve(outputDirectoryValue))
  const payload = {
    ok: true,
    command: 'subtitle translate',
    inputPath: subtitlePath,
    sourceLanguage: result.sourceLanguage,
    targetLanguage: result.targetLanguage,
    translationModel: result.translationModel,
    translationStats: result.translationStats,
    cacheHit: cached?.success === true,
    outputs
  }
  printJson(parsed, payload)
  printHuman(parsed, `${cached?.success === true ? '命中译文缓存' : '翻译完成'}：\n${outputs.map((output) => `  ${output.format}: ${output.path}`).join('\n')}`)
  return 0
}

async function collectLibraryPaths(parsed: ParsedCliArgs, values: string[]): Promise<string[]> {
  const recursive = hasCliOption(parsed, 'recursive') && !hasCliOption(parsed, 'no-recursive')
  const paths: string[] = []
  for (const value of values) {
    const inputPath = resolve(value)
    let fileStat
    try {
      fileStat = await stat(inputPath)
    } catch {
      throw new CliError(`路径不存在：${inputPath}`, 3)
    }
    if (fileStat.isDirectory()) {
      const scan = await scanVisionDirectory(inputPath, recursive, new AbortController().signal, (progress) => {
        reportProgress(parsed, `扫描 ${progress.directoryPath}：${progress.discoveredVideos} 个视频`)
      })
      paths.push(...scan.files)
    } else if (fileStat.isFile() && isVideoFilePath(inputPath)) {
      paths.push(inputPath)
    } else {
      throw new CliError(`不是有效的视频或目录：${inputPath}`, 3)
    }
  }
  return Array.from(new Set(paths))
}

async function runLibrary(parsed: ParsedCliArgs): Promise<number> {
  const action = parsed.positionals[0] ?? 'status'
  const library = getVisionLibrary()

  if (action === 'status') {
    const status = await library.getStatus()
    const result = { ok: status.available, command: 'library status', status }
    printJson(parsed, result)
    printHuman(parsed, `影视库：${status.available ? '可用' : '不可用'}\n视频：${status.indexedVideoCount}\n帧：${status.indexedFrameCount}\n目录：${status.indexDirectory}`)
    return status.available ? 0 : 4
  }

  if (action === 'scan') {
    requirePositionals({ ...parsed, positionals: parsed.positionals.slice(1) }, 1, 'aivcli library scan <directory>')
    const directoryPath = resolve(parsed.positionals[1] as string)
    const recursive = hasCliOption(parsed, 'recursive') && !hasCliOption(parsed, 'no-recursive')
    const scan = await scanVisionDirectory(directoryPath, recursive, new AbortController().signal, (progress) => {
      reportProgress(parsed, `扫描 ${progress.directoryPath}：${progress.discoveredVideos} 个视频`)
    })
    const result = { ok: true, command: 'library scan', ...scan }
    printJson(parsed, result)
    printHuman(parsed, `扫描完成：${scan.discoveredVideos} 个视频`)
    if (!parsed.global.json) scan.files.forEach((filePath) => writeStdout(filePath))
    return 0
  }

  if (action === 'index') {
    requirePositionals({ ...parsed, positionals: parsed.positionals.slice(1) }, 1, 'aivcli library index <directory-or-video...>')
    const paths = await collectLibraryPaths(parsed, parsed.positionals.slice(1))
    if (paths.length === 0) throw new CliError('没有找到可建立索引的视频', 3)
    const interval = Number(getCliOption(parsed, 'interval') ?? 3)
    if (!Number.isFinite(interval) || interval <= 0) throw new CliError('--interval 必须是大于 0 的数字')
    const progress = await library.indexVideos(paths, interval, new AbortController().signal, (value) => {
      reportProgress(parsed, value.message ?? `${value.stage}：${value.currentVideoIndex}/${value.totalVideos}`)
    })
    const result = { ok: progress.status === 'completed', command: 'library index', progress }
    printJson(parsed, result)
    printHuman(parsed, progress.message ?? `索引完成：${progress.processedFrames} 帧`)
    return progress.status === 'completed' ? 0 : 4
  }

  if (action === 'search') {
    const imagePath = getCliOption(parsed, 'image')
    const limit = Number(getCliOption(parsed, 'limit') ?? 24)
    if (!Number.isInteger(limit) || limit < 1) throw new CliError('--limit 必须是大于 0 的整数')
    const mode = optionOr(parsed, 'mode', 'hybrid')
    if (mode !== 'hybrid' && mode !== 'visual') throw new CliError('--mode 只能是 hybrid 或 visual')
    const results = imagePath
      ? await library.searchImage(resolve(imagePath), limit)
      : await library.searchText(parsed.positionals.slice(1).join(' '), limit, mode)
    const payload = { ok: true, command: 'library search', results }
    printJson(parsed, payload)
    if (!parsed.global.json) {
      printHuman(parsed, results.length === 0 ? '没有找到匹配结果' : results.map((item, index) => `${index + 1}. ${item.fileName} @ ${item.timestampSeconds.toFixed(1)}s\n   ${item.videoPath}${item.matchedText ? `\n   字幕：${item.matchedText}` : ''}`).join('\n'))
    }
    return 0
  }

  throw new CliError(`未知的 library 子命令：${action}`)
}

async function runCommand(parsed: ParsedCliArgs): Promise<number> {
  if (hasCliOption(parsed, 'help')) {
    printHelp()
    return 0
  }
  if (parsed.command === 'help' || parsed.command === '-h' || parsed.command === '--help') {
    printHelp()
    return 0
  }
  if (parsed.command === 'version' || parsed.command === '-v' || parsed.command === '--version') {
    writeStdout(getVersion())
    return 0
  }
  if (parsed.command === 'doctor') return runDoctor(parsed)
  if (parsed.command === 'media') {
    if (parsed.positionals[0] !== 'info') throw new CliError('目前只支持 media info')
    return runMediaInfo({ ...parsed, positionals: parsed.positionals.slice(1) })
  }
  if (parsed.command === 'asr') return runAsr(parsed)
  if (parsed.command === 'subtitle') return runSubtitle(parsed)
  if (parsed.command === 'batch') {
    const result = await runBatch(parsed, (message) => reportProgress(parsed, message))
    printJson(parsed, result)
    printHuman(parsed, formatBatchResult(result))
    return result.ok ? 0 : 4
  }
  if (parsed.command === 'library') return runLibrary(parsed)
  if (parsed.command === 'drama') return runDrama(parsed, (message) => reportProgress(parsed, message))
  throw new CliError(`未知命令：${parsed.command}`)
}

export async function runCli(rawArgs: readonly string[]): Promise<number> {
  const parsed = parseCliArgs(rawArgs)
  try {
    return await runCommand(parsed)
  } catch (error) {
    const cliError = error instanceof CliError
      ? error
      : error instanceof BatchPlanError
        ? new CliError(error.message, error.exitCode)
        : new CliError(error instanceof Error ? error.message : String(error), 10)
    const payload = { ok: false, error: { code: cliError.exitCode, message: cliError.message, details: cliError.details } }
    if (parsed.global.json) writeStdout(JSON.stringify(payload, null, 2))
    else writeStderr(`错误：${cliError.message}`)
    return cliError.exitCode
  }
}
