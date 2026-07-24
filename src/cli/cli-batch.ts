import { app } from 'electron'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { getAsrRuntime, getVisionLibrary } from '../desktop/desktop-services'
import { scanVisionDirectory } from '../core/ai/vision-directory-scan'
import { isVideoFilePath } from '../core/media/file-opening'
import type { AsrErrorDetails, AsrSubtitleRequest, AsrSubtitleResult, AsrSubtitleTranslationRequest, AsrSubtitleTranslationResult } from '../shared/asr-types'
import { isBatchSubtitleRetryableError } from '../shared/batch-subtitle-utils'
import type { VisionIndexProgress } from '../shared/vision-types'
import type { ParsedCliArgs } from './cli-parser'
import { BatchPlanError, parseBatchPlan, type BatchPlan, type BatchSubtitleFormat } from './cli-batch-plan'
import {
  createBatchIndexKey,
  createBatchState,
  getBatchPlanFingerprint,
  loadBatchState,
  reconcileBatchState,
  saveBatchState,
  type BatchFileSignature,
  type BatchSavedStage,
  type BatchStateVideo,
  type CliBatchState
} from './cli-batch-state'

type SubtitleOutput = { format: 'vtt' | 'srt'; path: string }

type BatchStageOutput = {
  ok: boolean
  message?: string
  cacheHit?: boolean
  resumed?: boolean
  subtitlePath?: string
  subtitleSrtPath?: string
  sourceSubtitlePath?: string
  retries?: number
  outputs?: SubtitleOutput[]
  [key: string]: unknown
}

export type BatchItemResult = {
  path: string
  ok: boolean
  asr?: BatchStageOutput
  translate?: BatchStageOutput
  errors?: string[]
}

export type BatchResult = {
  ok: boolean
  command: 'batch'
  inputs: number
  videos: number
  completed: number
  failed: number
  stoppedEarly: boolean
  resumed: boolean
  retries: number
  stateFile: string
  options: Pick<BatchPlan, 'recursive' | 'asr' | 'translateLanguage' | 'sourceLanguage' | 'index' | 'format' | 'retryCount' | 'force' | 'failFast'>
  inputErrors: Array<{ path: string; message: string }>
  results: BatchItemResult[]
  index?: {
    ok: boolean
    progress?: VisionIndexProgress
    message?: string
  }
}

export type BatchProgressReporter = (message: string) => void

export const DEFAULT_BATCH_RETRY_DELAY_MS = 1_000
export const MAX_BATCH_RETRY_DELAY_MS = 30_000

export class BatchStageError extends Error {
  readonly details?: AsrErrorDetails

  constructor(message: string, details?: AsrErrorDetails) {
    super(message)
    this.name = 'BatchStageError'
    this.details = details
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function getBatchRetryDelayMs(
  retryNumber: number,
  baseDelayMs = DEFAULT_BATCH_RETRY_DELAY_MS,
  maxDelayMs = MAX_BATCH_RETRY_DELAY_MS
): number {
  if (!Number.isFinite(retryNumber) || retryNumber <= 0) return 0
  return Math.min(maxDelayMs, baseDelayMs * (2 ** Math.floor(retryNumber - 1)))
}

export function isRetryableBatchStageError(error: unknown): boolean {
  if (error instanceof BatchStageError && isBatchSubtitleRetryableError(error.details)) return true
  const message = errorMessage(error).toLowerCase()
  return /timeout|timed out|network|econnreset|econnrefused|eai_again|enotfound|\b429\b|\b502\b|\b503\b|\b504\b/.test(message)
}

type BatchRetryStage = 'asr' | 'translate'

export type BatchRetrySchedule = {
  stage: BatchRetryStage
  attempt: number
  maxRetries: number
  lastError: string
  nextRetryAt: number
}

export async function runBatchStageWithRetry<T>(options: {
  stage: BatchRetryStage
  maxRetries: number
  initialRetryCount: number
  mediaPath: string
  report: BatchProgressReporter
  task: () => Promise<T>
  onRetryScheduled: (retry: BatchRetrySchedule) => Promise<void>
  onRetryReady: () => Promise<void>
  wait?: (delayMs: number) => Promise<void>
}): Promise<{ value: T; retries: number }> {
  let retryCount = Math.max(0, options.initialRetryCount)
  while (true) {
    try {
      return { value: await options.task(), retries: retryCount }
    } catch (error) {
      if (retryCount >= options.maxRetries || !isRetryableBatchStageError(error)) throw error
      retryCount += 1
      const delayMs = getBatchRetryDelayMs(retryCount)
      const retry: BatchRetrySchedule = {
        stage: options.stage,
        attempt: retryCount,
        maxRetries: options.maxRetries,
        lastError: errorMessage(error),
        nextRetryAt: Date.now() + delayMs
      }
      await options.onRetryScheduled(retry)
      options.report(`${basename(options.mediaPath)}：${options.stage === 'asr' ? 'ASR' : '翻译'}失败，${delayMs}ms 后进行第 ${retryCount}/${options.maxRetries} 次重试`)
      if (delayMs > 0) {
        if (options.wait) await options.wait(delayMs)
        else await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, delayMs))
      }
      await options.onRetryReady()
    }
  }
}

function selectSubtitlePaths(
  result: { subtitlePath?: string; subtitleSrtPath?: string },
  format: BatchSubtitleFormat
): SubtitleOutput[] {
  const outputs: SubtitleOutput[] = []
  if ((format === 'both' || format === 'vtt') && result.subtitlePath) outputs.push({ format: 'vtt', path: result.subtitlePath })
  if ((format === 'both' || format === 'srt') && result.subtitleSrtPath) outputs.push({ format: 'srt', path: result.subtitleSrtPath })
  return outputs
}

async function copySubtitleOutputs(
  mediaPath: string,
  outputs: SubtitleOutput[],
  outputDirectory: string,
  outputSuffix = ''
): Promise<SubtitleOutput[]> {
  await mkdir(outputDirectory, { recursive: true })
  const stem = basename(mediaPath, extname(mediaPath))
  const copied: SubtitleOutput[] = []
  for (const output of outputs) {
    const outputPath = join(outputDirectory, `${stem}${outputSuffix}.${output.format}`)
    await copyFile(output.path, outputPath)
    copied.push({ format: output.format, path: outputPath })
  }
  return copied
}

async function findSiblingVttPath(mediaPath: string): Promise<string | null> {
  const candidate = `${mediaPath.slice(0, -extname(mediaPath).length)}.vtt`
  try {
    const subtitleStat = await stat(candidate)
    return subtitleStat.isFile() ? candidate : null
  } catch {
    return null
  }
}

async function findSiblingSubtitlePath(mediaPath: string): Promise<string | undefined> {
  const basePath = mediaPath.slice(0, -extname(mediaPath).length)
  for (const extension of ['.vtt', '.srt']) {
    const candidate = `${basePath}${extension}`
    try {
      const subtitleStat = await stat(candidate)
      if (subtitleStat.isFile()) return candidate
    } catch {
      // Continue with the next sidecar extension.
    }
  }
  return undefined
}

async function collectBatchFileSignatures(
  files: string[],
  inputErrors: Array<{ path: string; message: string }>
): Promise<{ files: string[]; signatures: BatchFileSignature[] }> {
  const validFiles: string[] = []
  const signatures: BatchFileSignature[] = []
  for (const filePath of files) {
    try {
      const file = await stat(filePath)
      if (!file.isFile()) throw new Error('路径不再是文件')
      validFiles.push(filePath)
      signatures.push({ path: filePath, sizeBytes: file.size, mtimeMs: file.mtimeMs })
    } catch (error) {
      inputErrors.push({ path: filePath, message: errorMessage(error) })
    }
  }
  return { files: validFiles, signatures }
}

function getDefaultBatchStatePath(): string {
  return join(app.getPath('userData'), 'aivcli-batch-state.json')
}

function getStateStageOutput(stage: BatchSavedStage, resumed = true): BatchStageOutput {
  return {
    ok: true,
    resumed,
    cacheHit: true,
    retries: stage.retries,
    subtitlePath: stage.subtitlePath,
    subtitleSrtPath: stage.subtitleSrtPath,
    sourceSubtitlePath: stage.sourceSubtitlePath,
    outputs: stage.outputs
  }
}

async function hasStateStageFiles(stage: BatchSavedStage): Promise<boolean> {
  const paths = [stage.subtitlePath, stage.subtitleSrtPath, stage.sourceSubtitlePath, ...stage.outputs.map((output) => output.path)]
    .filter((path): path is string => Boolean(path))
  if (paths.length === 0) return false
  for (const path of paths) {
    try {
      if (!(await stat(path)).isFile()) return false
    } catch {
      return false
    }
  }
  return true
}

function saveStageOutput(output: BatchStageOutput): BatchSavedStage {
  return {
    completedAt: Date.now(),
    retries: output.retries,
    subtitlePath: output.subtitlePath,
    subtitleSrtPath: output.subtitleSrtPath,
    sourceSubtitlePath: output.sourceSubtitlePath,
    outputs: output.outputs ?? []
  }
}

async function createCurrentIndexKey(
  signatures: BatchFileSignature[],
  subtitlePaths: ReadonlyMap<string, string>
): Promise<string> {
  const subtitleSources: Array<{ videoPath: string; subtitlePath?: string; sizeBytes?: number; mtimeMs?: number }> = []
  for (const signature of signatures) {
    const subtitlePath = subtitlePaths.get(signature.path) ?? await findSiblingSubtitlePath(signature.path)
    if (!subtitlePath) {
      subtitleSources.push({ videoPath: signature.path })
      continue
    }
    try {
      const subtitleFile = await stat(subtitlePath)
      subtitleSources.push({ videoPath: signature.path, subtitlePath, sizeBytes: subtitleFile.size, mtimeMs: subtitleFile.mtimeMs })
    } catch {
      subtitleSources.push({ videoPath: signature.path, subtitlePath })
    }
  }
  return createBatchIndexKey(signatures, subtitleSources)
}

async function prepareBatchState(
  plan: BatchPlan,
  statePath: string,
  signatures: BatchFileSignature[]
): Promise<{ state: CliBatchState; resumed: boolean }> {
  if (plan.resume) {
    let state: CliBatchState | null
    try {
      state = await loadBatchState(statePath)
    } catch (error) {
      throw new BatchPlanError(`无法读取状态文件：${statePath}：${errorMessage(error)}。如需覆盖，请使用 --reset-state`, 3)
    }
    if (!state) throw new BatchPlanError(`找不到状态文件：${statePath}`, 3)
    if (state.planFingerprint !== getBatchPlanFingerprint(plan)) {
      throw new BatchPlanError(`状态文件与当前 batch 参数不匹配：${statePath}。如需重新开始，请使用 --reset-state`)
    }
    reconcileBatchState(state, signatures)
    await saveBatchState(statePath, state)
    return { state, resumed: true }
  }

  if (!plan.resetState) {
    let existing: CliBatchState | null
    try {
      existing = await loadBatchState(statePath)
    } catch (error) {
      throw new BatchPlanError(`无法读取状态文件：${statePath}：${errorMessage(error)}。如需覆盖，请使用 --reset-state`, 3)
    }
    if (existing) throw new BatchPlanError(`状态文件已存在：${statePath}。继续任务请使用 --resume，重新开始请使用 --reset-state`)
  }

  const state = createBatchState(plan, signatures)
  await saveBatchState(statePath, state)
  return { state, resumed: false }
}

async function collectBatchMediaPaths(
  plan: BatchPlan,
  report: BatchProgressReporter
): Promise<{ files: string[]; errors: Array<{ path: string; message: string }> }> {
  const files: string[] = []
  const errors: Array<{ path: string; message: string }> = []
  for (const input of plan.inputs) {
    const inputPath = resolve(input)
    try {
      const inputStat = await stat(inputPath)
      if (inputStat.isFile()) {
        if (!isVideoFilePath(inputPath)) throw new Error(`不是支持的视频文件：${inputPath}`)
        files.push(inputPath)
        continue
      }
      if (!inputStat.isDirectory()) throw new Error(`不是有效的视频或目录：${inputPath}`)
      const scan = await scanVisionDirectory(inputPath, plan.recursive, new AbortController().signal, (progress) => {
        report(`扫描 ${progress.directoryPath}：${progress.discoveredVideos} 个视频`)
      })
      files.push(...scan.files)
    } catch (error) {
      const message = errorMessage(error)
      if (plan.failFast) return { files: Array.from(new Set(files)), errors: [{ path: inputPath, message }] }
      errors.push({ path: inputPath, message })
    }
  }
  return { files: Array.from(new Set(files)), errors }
}

async function runAsrTask(
  runtime: ReturnType<typeof getAsrRuntime>,
  mediaPath: string,
  plan: BatchPlan,
  report: BatchProgressReporter
): Promise<{ result: AsrSubtitleResult; output: BatchStageOutput }> {
  const request: AsrSubtitleRequest = { mediaPath, modelId: plan.modelId, language: plan.language }
  const cached = plan.force ? null : await runtime.resolveSubtitleCache(request)
  const result = cached?.success === true
    ? cached
    : await runtime.generateSubtitle(request, (progress) => {
        if (progress.percent == null) report(`${basename(mediaPath)}：${progress.message}`)
        else report(`${basename(mediaPath)}：${progress.percent}% ${progress.message}`)
      })
  if (!result.success) throw new BatchStageError(result.message, result.errorDetails)

  let outputs = selectSubtitlePaths(result, plan.format)
  if (plan.outputDirectory) outputs = await copySubtitleOutputs(mediaPath, outputs, resolve(plan.outputDirectory))
  report(`${cached?.success === true ? '命中字幕缓存' : '字幕完成'}：${mediaPath}`)
  return {
    result,
    output: {
      ok: true,
      cacheHit: cached?.success === true,
      subtitleLanguage: result.subtitleLanguage,
      model: result.model,
      generationStats: result.generationStats,
      subtitlePath: result.subtitlePath,
      subtitleSrtPath: result.subtitleSrtPath,
      outputs
    }
  }
}

async function runTranslateTask(
  runtime: ReturnType<typeof getAsrRuntime>,
  mediaPath: string,
  sourceSubtitlePath: string,
  plan: BatchPlan,
  report: BatchProgressReporter
): Promise<BatchStageOutput> {
  const targetLanguage = plan.translateLanguage
  if (!targetLanguage) throw new Error('未配置目标翻译语言')
  const request: AsrSubtitleTranslationRequest = {
    mediaPath,
    subtitlePath: sourceSubtitlePath,
    sourceLanguage: plan.sourceLanguage,
    targetLanguage
  }
  const cached = plan.force ? null : await runtime.resolveTranslatedSubtitleCache(request)
  const result: AsrSubtitleTranslationResult = cached?.success === true
    ? cached
    : await runtime.translateSubtitle(request, {
        onProgress: (progress) => {
          if (progress.percent == null) report(`${basename(mediaPath)}：${progress.message}`)
          else report(`${basename(mediaPath)}：${progress.percent}% ${progress.message}`)
        }
      })
  if (!result.success) throw new BatchStageError(result.message, result.errorDetails)

  let outputs = selectSubtitlePaths(result, plan.format)
  if (plan.outputDirectory) outputs = await copySubtitleOutputs(mediaPath, outputs, resolve(plan.outputDirectory), `.${targetLanguage}`)
  report(`${cached?.success === true ? '命中译文缓存' : '翻译完成'}：${mediaPath}`)
  return {
    ok: true,
    cacheHit: cached?.success === true,
    sourceSubtitlePath,
    sourceLanguage: result.sourceLanguage,
    targetLanguage: result.targetLanguage,
    translationModel: result.translationModel,
    translationStats: result.translationStats,
    subtitlePath: result.subtitlePath,
    subtitleSrtPath: result.subtitleSrtPath,
    outputs
  }
}

function createBaseResult(
  plan: BatchPlan,
  inputErrors: Array<{ path: string; message: string }>,
  files: string[],
  stateFile: string,
  resumed: boolean
): BatchResult {
  return {
    ok: false,
    command: 'batch',
    inputs: plan.inputs.length,
    videos: files.length,
    completed: 0,
    failed: inputErrors.length,
    stoppedEarly: false,
    resumed,
    retries: 0,
    stateFile,
    options: {
      recursive: plan.recursive,
      asr: plan.asr,
      translateLanguage: plan.translateLanguage,
      sourceLanguage: plan.sourceLanguage,
      index: plan.index,
      format: plan.format,
      retryCount: plan.retryCount,
      force: plan.force,
      failFast: plan.failFast
    },
    inputErrors,
    results: []
  }
}

export async function runBatch(parsed: ParsedCliArgs, report: BatchProgressReporter): Promise<BatchResult> {
  const plan = parseBatchPlan(parsed)
  const collected = await collectBatchMediaPaths(plan, report)
  const inputErrors = [...collected.errors]
  const signaturesResult = await collectBatchFileSignatures(collected.files, inputErrors)
  const stateFile = resolve(plan.stateFile ?? getDefaultBatchStatePath())
  if (signaturesResult.files.length === 0) {
    if (inputErrors.length > 0) return createBaseResult(plan, inputErrors, [], stateFile, false)
    throw new BatchPlanError('没有找到可处理的视频', 3)
  }

  const preparedState = await prepareBatchState(plan, stateFile, signaturesResult.signatures)
  const result = createBaseResult(plan, inputErrors, signaturesResult.files, stateFile, preparedState.resumed)
  const state = preparedState.state

  const runtime = plan.asr || plan.translateLanguage ? getAsrRuntime() : null
  const indexSubtitlePaths = new Map<string, string>()
  let stoppedEarly = inputErrors.length > 0 && plan.failFast
  for (const mediaPath of signaturesResult.files) {
    if (stoppedEarly) break
    const item: BatchItemResult = { path: mediaPath, ok: true }
    const stateVideo = state.videos[mediaPath] as BatchStateVideo
    let asrResult: AsrSubtitleResult | null = null
    const recordStageError = (error: unknown): void => {
      item.ok = false
      item.errors = [...(item.errors ?? []), errorMessage(error)]
      if (plan.failFast) stoppedEarly = true
    }

    if (plan.asr && runtime && !stoppedEarly) {
      if (stateVideo.asr && await hasStateStageFiles(stateVideo.asr)) {
        item.asr = getStateStageOutput(stateVideo.asr)
        result.retries += stateVideo.asr.retries ?? 0
        asrResult = {
          success: true,
          message: '从断点状态恢复',
          subtitlePath: stateVideo.asr.subtitlePath,
          subtitleSrtPath: stateVideo.asr.subtitleSrtPath
        }
        if (asrResult.subtitlePath) indexSubtitlePaths.set(mediaPath, asrResult.subtitlePath)
        report(`跳过已完成 ASR：${mediaPath}`)
      } else {
        const initialRetryCount = stateVideo.retry?.stage === 'asr' ? stateVideo.retry.attempt : 0
        stateVideo.asr = undefined
        stateVideo.translate = undefined
        if (stateVideo.retry?.stage !== 'asr') stateVideo.retry = undefined
        else stateVideo.retry = { ...stateVideo.retry, nextRetryAt: 0 }
        state.index = undefined
        await saveBatchState(stateFile, state)
        try {
          report(`开始 ASR：${mediaPath}`)
          const asr = await runBatchStageWithRetry({
            stage: 'asr',
            maxRetries: plan.retryCount,
            initialRetryCount,
            mediaPath,
            report,
            task: () => runAsrTask(runtime, mediaPath, plan, report),
            onRetryScheduled: async (retry) => {
              stateVideo.retry = retry
              stateVideo.lastError = { stage: 'asr', message: retry.lastError, at: Date.now() }
              state.index = undefined
              await saveBatchState(stateFile, state)
            },
            onRetryReady: async () => {
              if (stateVideo.retry) stateVideo.retry = { ...stateVideo.retry, nextRetryAt: 0 }
              await saveBatchState(stateFile, state)
            }
          })
          asrResult = asr.value.result
          item.asr = { ...asr.value.output, retries: asr.retries }
          result.retries += asr.retries
          stateVideo.asr = saveStageOutput(item.asr)
          stateVideo.translate = undefined
          stateVideo.retry = undefined
          stateVideo.lastError = undefined
          state.index = undefined
          if (asrResult.subtitlePath) indexSubtitlePaths.set(mediaPath, asrResult.subtitlePath)
          await saveBatchState(stateFile, state)
        } catch (error) {
          stateVideo.asr = undefined
          stateVideo.translate = undefined
          stateVideo.retry = undefined
          stateVideo.lastError = { stage: 'asr', message: errorMessage(error), at: Date.now() }
          state.index = undefined
          await saveBatchState(stateFile, state)
          recordStageError(error)
        }
      }
    }

    if (plan.translateLanguage && runtime && !stoppedEarly) {
      if (stateVideo.translate && await hasStateStageFiles(stateVideo.translate)) {
        item.translate = getStateStageOutput(stateVideo.translate)
        result.retries += stateVideo.translate.retries ?? 0
        const indexSubtitlePath = stateVideo.translate.outputs.find((output) => output.format === 'vtt')?.path ?? stateVideo.translate.subtitlePath
        if (indexSubtitlePath) indexSubtitlePaths.set(mediaPath, indexSubtitlePath)
        report(`跳过已完成翻译：${mediaPath}`)
      } else {
        const initialRetryCount = stateVideo.retry?.stage === 'translate' ? stateVideo.retry.attempt : 0
        stateVideo.translate = undefined
        if (stateVideo.retry?.stage !== 'translate') stateVideo.retry = undefined
        else stateVideo.retry = { ...stateVideo.retry, nextRetryAt: 0 }
        state.index = undefined
        await saveBatchState(stateFile, state)
        try {
          const sourceSubtitlePath = asrResult?.subtitlePath ?? stateVideo.asr?.subtitlePath ?? await findSiblingVttPath(mediaPath)
          if (!sourceSubtitlePath) throw new Error(`未找到原文 VTT：${mediaPath}。请先指定 --asr，或在视频旁放置同名 .vtt 文件`)
          report(`开始翻译：${mediaPath}`)
          const translated = await runBatchStageWithRetry({
            stage: 'translate',
            maxRetries: plan.retryCount,
            initialRetryCount,
            mediaPath,
            report,
            task: () => runTranslateTask(runtime, mediaPath, sourceSubtitlePath, plan, report),
            onRetryScheduled: async (retry) => {
              stateVideo.retry = retry
              stateVideo.lastError = { stage: 'translate', message: retry.lastError, at: Date.now() }
              state.index = undefined
              await saveBatchState(stateFile, state)
            },
            onRetryReady: async () => {
              if (stateVideo.retry) stateVideo.retry = { ...stateVideo.retry, nextRetryAt: 0 }
              await saveBatchState(stateFile, state)
            }
          })
          item.translate = { ...translated.value, retries: translated.retries }
          result.retries += translated.retries
          stateVideo.translate = saveStageOutput(item.translate)
          stateVideo.retry = undefined
          stateVideo.lastError = undefined
          state.index = undefined
          const translatedVttPath = item.translate.outputs?.find((output) => output.format === 'vtt')?.path
          const indexSubtitlePath = translatedVttPath ?? item.translate.subtitlePath
          if (indexSubtitlePath) indexSubtitlePaths.set(mediaPath, indexSubtitlePath)
          await saveBatchState(stateFile, state)
        } catch (error) {
          stateVideo.translate = undefined
          stateVideo.retry = undefined
          stateVideo.lastError = { stage: 'translate', message: errorMessage(error), at: Date.now() }
          state.index = undefined
          await saveBatchState(stateFile, state)
          recordStageError(error)
        }
      }
    }
    result.results.push(item)
  }

  if (plan.index && !stoppedEarly) {
    const indexKey = await createCurrentIndexKey(signaturesResult.signatures, indexSubtitlePaths)
    if (state.index?.key === indexKey) {
      result.index = { ok: true, message: '从断点状态恢复，跳过已完成索引' }
        report(`跳过已完成影视库索引：${signaturesResult.files.length} 个视频`)
    } else {
      state.index = undefined
      await saveBatchState(stateFile, state)
      try {
        report(`开始影视库索引：${signaturesResult.files.length} 个视频`)
        const progress = await getVisionLibrary().indexVideos(
          signaturesResult.files,
          plan.intervalSeconds,
          new AbortController().signal,
          (value) => report(value.message ?? `${value.stage}：${value.currentVideoIndex}/${value.totalVideos}`),
          { subtitlePaths: indexSubtitlePaths }
        )
        result.index = { ok: progress.status === 'completed', progress, message: progress.message }
        if (result.index.ok) {
          state.index = { key: indexKey, completedAt: Date.now() }
          await saveBatchState(stateFile, state)
        } else {
          result.failed += 1
        }
      } catch (error) {
        result.index = { ok: false, message: errorMessage(error) }
        result.failed += 1
      }
    }
  }

  result.stoppedEarly = stoppedEarly
  result.failed += result.results.filter((item) => !item.ok).length
  result.completed = result.results.filter((item) => item.ok).length
  result.ok = result.failed === 0 && !stoppedEarly
  return result
}

export function formatBatchResult(result: BatchResult): string {
  const lines = [`批量任务${result.ok ? '完成' : '结束但有失败'}：${result.completed}/${result.videos} 个视频成功`]
  lines.push(`${result.resumed ? '断点续跑' : '状态文件'}：${result.stateFile}`)
  lines.push(`重试：${result.retries} 次（单阶段最多 ${result.options.retryCount} 次）`)
  if (result.stoppedEarly) lines.push('已按 --fail-fast 提前停止')
  for (const inputError of result.inputErrors) lines.push(`输入失败：${inputError.path}：${inputError.message}`)
  for (const item of result.results) {
    lines.push(`${item.ok ? '完成' : '失败'}：${item.path}`)
    for (const error of item.errors ?? []) lines.push(`  错误：${error}`)
    for (const stage of [item.asr, item.translate]) {
      if (!stage) continue
      const outputs = stage.outputs ?? []
      for (const output of outputs) lines.push(`  ${output.format}：${output.path}`)
    }
  }
  if (result.index) lines.push(`影视库索引：${result.index.ok ? '完成' : `失败（${result.index.message ?? '未知错误'}）`}`)
  return lines.join('\n')
}
