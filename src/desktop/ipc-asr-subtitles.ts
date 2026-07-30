import { ipcMain } from 'electron'
import { unlink } from 'node:fs/promises'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { AsrJobProgress, AsrSubtitleCheckpointRequest, AsrSubtitleExportRequest, AsrSubtitleExportResult, AsrSubtitleIncrementalTranslationResult, AsrSubtitleRequest, AsrSubtitleTranslationRequest, AsrSubtitleTranslationResult } from '../shared/media-types'
import { appendAsrDiagnosticLog, getAsrLogDirectoryPath, redactAsrErrorDetails } from '../core/ai/asr-diagnostics'
import { createMediaFile } from './media/media-protocol'
import { getAsrRuntime } from './desktop-services'
import { desktopState } from './desktop-state'
import { app } from 'electron'

const streamingTranslationBatchSize = 6

function withSubtitleUrls<T extends { subtitlePath?: string; subtitleSrtPath?: string }>(result: T): T & { subtitleUrl?: string; subtitleSrtUrl?: string } {
  if (!result.subtitlePath) return result
  const subtitleFile = createMediaFile(result.subtitlePath)
  const subtitleSrtFile = result.subtitleSrtPath ? createMediaFile(result.subtitleSrtPath) : null
  return { ...result, subtitleUrl: subtitleFile.url, subtitleSrtUrl: subtitleSrtFile?.url }
}

function withStreamingTranslationUrls<T extends { streamingTranslation?: { subtitlePath?: string; subtitleSrtPath?: string } }>(result: T): T {
  if (!result.streamingTranslation?.subtitlePath) return result
  return { ...result, streamingTranslation: withSubtitleUrls(result.streamingTranslation) }
}

function createStreamingTranslationCoordinator(options: {
  request: AsrSubtitleRequest
  runtime: ReturnType<typeof getAsrRuntime>
  signal: AbortSignal
  sendProgress: (progress: AsrJobProgress) => void
}): {
  enqueue: (progress: AsrJobProgress) => void | Promise<void>
  decorateProgress: (progress: AsrJobProgress) => AsrJobProgress
  finish: (result: { subtitlePath?: string; subtitleSrtPath?: string; subtitleLanguage?: string }) => Promise<AsrSubtitleIncrementalTranslationResult | null>
  cleanupPriority: () => Promise<void>
  cleanup: () => Promise<void>
} | null {
  const targetLanguage = options.request.streamTranslationTargetLanguage
  if (!targetLanguage) return null

  let outputSubtitlePath: string | undefined
  let outputSubtitleSrtPath: string | undefined
  let translatedCueCount = 0
  let revision = 0
  let pendingProgress: AsrJobProgress | null = null
  let drainPromise: Promise<void> | null = null
  let disabled = false
  let priorityTranslationPromise: Promise<void> | null = null
  let priorityTranslationSourcePath: string | undefined
  let priorityTranslatedSubtitlePath: string | undefined
  let priorityTranslatedSubtitleSrtPath: string | undefined
  let priorityRevision = 0
  let priorityTranslationMetadata: Pick<AsrJobProgress, 'priorityTranslatedSubtitlePath' | 'priorityTranslatedSubtitleSrtPath' | 'priorityTranslatedSubtitleRevision' | 'priorityTranslationSourcePath' | 'priorityTranslationSourceLanguage' | 'priorityTranslationTargetLanguage'> | null = null

  const emitPartialTranslation = (result: AsrSubtitleIncrementalTranslationResult, sourceSubtitlePath: string): void => {
    if (!result.success || !result.changed || !result.subtitlePath) return
    outputSubtitlePath = result.subtitlePath
    outputSubtitleSrtPath = result.subtitleSrtPath
    translatedCueCount = result.translatedCueCount
    revision += 1
    options.sendProgress({
      stage: 'translating',
      percent: null,
      message: result.message,
      mediaPath: options.request.mediaPath,
      partialTranslatedSubtitlePath: result.subtitlePath,
      partialTranslatedSubtitleSrtPath: result.subtitleSrtPath,
      partialTranslatedSubtitleCueCount: translatedCueCount,
      partialTranslatedSubtitleRevision: revision,
      partialTranslationSourcePath: sourceSubtitlePath,
      partialTranslationSourceLanguage: options.request.language ?? 'auto',
      partialTranslationTargetLanguage: targetLanguage
    })
  }

  const translateSnapshot = async (progress: AsrJobProgress): Promise<void> => {
    if (disabled || !progress.partialSubtitlePath || (progress.partialSubtitleCueCount ?? 0) < streamingTranslationBatchSize) return
    const result = await options.runtime.translateSubtitleIncremental({
      sourceSubtitlePath: progress.partialSubtitlePath,
      sourceLanguage: options.request.language,
      targetLanguage,
      outputSubtitlePath,
      outputSubtitleSrtPath,
      previousTranslatedSubtitlePath: outputSubtitlePath,
      translatedCueCount,
      batchSize: streamingTranslationBatchSize,
      flush: false,
      mediaPath: options.request.mediaPath
    }, { signal: options.signal })
    if (!result.success) {
      disabled = true
      return
    }
    emitPartialTranslation(result, progress.partialSubtitlePath)
  }

  const translatePrioritySnapshot = async (progress: AsrJobProgress): Promise<void> => {
    if (disabled || !progress.prioritySubtitleReady || !progress.prioritySubtitlePath || priorityTranslationSourcePath === progress.prioritySubtitlePath) return
    priorityTranslationSourcePath = progress.prioritySubtitlePath
    const result = await options.runtime.translateSubtitleIncremental({
      sourceSubtitlePath: progress.prioritySubtitlePath,
      sourceLanguage: options.request.language,
      targetLanguage,
      batchSize: streamingTranslationBatchSize,
      flush: true,
      mediaPath: options.request.mediaPath
    }, { signal: options.signal })
    if (!result.success || !result.subtitlePath) return
    priorityTranslatedSubtitlePath = result.subtitlePath
    priorityTranslatedSubtitleSrtPath = result.subtitleSrtPath
    priorityRevision += 1
    priorityTranslationMetadata = {
      priorityTranslatedSubtitlePath: result.subtitlePath,
      priorityTranslatedSubtitleSrtPath: result.subtitleSrtPath,
      priorityTranslatedSubtitleRevision: priorityRevision,
      priorityTranslationSourcePath: progress.prioritySubtitlePath,
      priorityTranslationSourceLanguage: options.request.language ?? 'auto',
      priorityTranslationTargetLanguage: targetLanguage
    }
    options.sendProgress({
      stage: 'translating',
      percent: null,
      message: result.message,
      mediaPath: options.request.mediaPath,
      prioritySubtitlePath: progress.prioritySubtitlePath,
      prioritySubtitleSrtPath: progress.prioritySubtitleSrtPath,
      prioritySubtitleRevision: progress.prioritySubtitleRevision,
      prioritySubtitleReady: true,
      priorityStartSeconds: progress.priorityStartSeconds,
      priorityEndSeconds: progress.priorityEndSeconds,
      priorityTranslatedSubtitlePath: result.subtitlePath,
      priorityTranslatedSubtitleSrtPath: result.subtitleSrtPath,
      priorityTranslatedSubtitleRevision: priorityRevision,
      priorityTranslationSourcePath: progress.prioritySubtitlePath,
      priorityTranslationSourceLanguage: options.request.language ?? 'auto',
      priorityTranslationTargetLanguage: targetLanguage
    })
  }

  const drain = async (): Promise<void> => {
    if (drainPromise) return drainPromise
    drainPromise = (async () => {
      while (pendingProgress && !disabled) {
        const nextProgress = pendingProgress
        pendingProgress = null
        await translateSnapshot(nextProgress)
      }
    })().finally(() => {
      drainPromise = null
    })
    return drainPromise
  }

  const enqueue = (progress: AsrJobProgress): void | Promise<void> => {
    let priorityPromiseToAwait: Promise<void> | undefined
    if (progress.prioritySubtitleReady && progress.prioritySubtitlePath) {
      if (!priorityTranslationPromise) {
        priorityTranslationPromise = translatePrioritySnapshot(progress).catch(() => undefined).finally(() => {
          priorityTranslationPromise = null
        })
        priorityPromiseToAwait = priorityTranslationPromise
      }
    }
    if (disabled || !progress.partialSubtitlePath || (progress.partialSubtitleCueCount ?? 0) < streamingTranslationBatchSize) return priorityPromiseToAwait
    pendingProgress = progress
    void drain()
    return priorityPromiseToAwait
  }

  const finish = async (result: { subtitlePath?: string; subtitleSrtPath?: string; subtitleLanguage?: string }): Promise<AsrSubtitleIncrementalTranslationResult | null> => {
    if (disabled || !result.subtitlePath || !result.subtitleSrtPath) return null
    if (priorityTranslationPromise) await priorityTranslationPromise
    await drain()
    if (options.signal.aborted) return null
    const finalResult = await options.runtime.translateSubtitleIncremental({
      sourceSubtitlePath: result.subtitlePath,
      sourceLanguage: result.subtitleLanguage ?? options.request.language,
      targetLanguage,
      outputSubtitlePath,
      outputSubtitleSrtPath,
      previousTranslatedSubtitlePath: outputSubtitlePath,
      translatedCueCount,
      batchSize: streamingTranslationBatchSize,
      flush: true,
      promoteToCache: true,
      mediaPath: options.request.mediaPath
    }, { signal: options.signal })
    if (finalResult.success) {
      outputSubtitlePath = finalResult.subtitlePath
      outputSubtitleSrtPath = finalResult.subtitleSrtPath
      translatedCueCount = finalResult.translatedCueCount
    }
    return finalResult
  }

  const cleanupPriority = async (): Promise<void> => {
    if (priorityTranslationPromise) await priorityTranslationPromise
    await Promise.all([
      priorityTranslatedSubtitlePath ? unlink(priorityTranslatedSubtitlePath).catch(() => undefined) : Promise.resolve(),
      priorityTranslatedSubtitleSrtPath ? unlink(priorityTranslatedSubtitleSrtPath).catch(() => undefined) : Promise.resolve()
    ])
  }

  const cleanup = async (): Promise<void> => {
    await cleanupPriority()
    await drain()
    await Promise.all([
      outputSubtitlePath ? unlink(outputSubtitlePath).catch(() => undefined) : Promise.resolve(),
      outputSubtitleSrtPath ? unlink(outputSubtitleSrtPath).catch(() => undefined) : Promise.resolve()
    ])
  }

  const decorateProgress = (progress: AsrJobProgress): AsrJobProgress => priorityTranslationMetadata ? { ...progress, ...priorityTranslationMetadata } : progress

  return { enqueue, decorateProgress, finish, cleanupPriority, cleanup }
}

export function registerAsrSubtitleIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ASR_GENERATE_SUBTITLE, async (event, request: AsrSubtitleRequest) => {
    const logDirectoryPath = getAsrLogDirectoryPath(app.getPath('userData'))
    const controller = new AbortController()
    desktopState.asrAbortControllers.get(event.sender.id)?.abort()
    desktopState.asrAbortControllers.set(event.sender.id, controller)
    await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-generation-started', { mediaPath: request.mediaPath, modelId: request.modelId, language: request.language })
    let streamingTranslation: ReturnType<typeof createStreamingTranslationCoordinator> = null
    try {
      const runtime = getAsrRuntime()
      streamingTranslation = createStreamingTranslationCoordinator({
        request,
        runtime,
        signal: controller.signal,
        sendProgress: (progress) => event.sender.send(IPC_CHANNELS.ASR_JOB_PROGRESS, progress)
      })
      const result = await runtime.generateSubtitle(request, (progress) => {
        event.sender.send(IPC_CHANNELS.ASR_JOB_PROGRESS, streamingTranslation?.decorateProgress(progress) ?? progress)
        return streamingTranslation?.enqueue(progress)
      }, { signal: controller.signal })
      const translated = result.success && streamingTranslation ? await streamingTranslation.finish(result) : null
      if (streamingTranslation && (!result.success || !translated?.success)) await streamingTranslation.cleanup()
      else if (streamingTranslation) await streamingTranslation.cleanupPriority()
      const resultWithStreamingTranslation = translated ? { ...result, streamingTranslation: translated } : result
      await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-generation-finished', { mediaPath: request.mediaPath, success: result.success, message: result.message, subtitlePath: result.subtitlePath, generationStats: result.generationStats, errorDetails: redactAsrErrorDetails(result.errorDetails) })
      return withSubtitleUrls(withStreamingTranslationUrls(resultWithStreamingTranslation))
    } catch (error) {
      await streamingTranslation?.cleanup()
      await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-generation-threw', { mediaPath: request.mediaPath, message: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      if (desktopState.asrAbortControllers.get(event.sender.id) === controller) desktopState.asrAbortControllers.delete(event.sender.id)
    }
  })
  ipcMain.handle(IPC_CHANNELS.ASR_CANCEL_SUBTITLE, (event) => {
    const controller = desktopState.asrAbortControllers.get(event.sender.id)
    if (!controller) return false
    controller.abort()
    return true
  })
  ipcMain.handle(IPC_CHANNELS.ASR_RESOLVE_SUBTITLE_CACHE, async (_event, request: AsrSubtitleRequest) => withSubtitleUrls(await getAsrRuntime().resolveSubtitleCache(request)))
  ipcMain.handle(IPC_CHANNELS.ASR_RESOLVE_SUBTITLE_CHECKPOINT, (_event, request: AsrSubtitleCheckpointRequest) => getAsrRuntime().resolveSubtitleCheckpoint(request))
  ipcMain.handle(IPC_CHANNELS.ASR_RESOLVE_TRANSLATED_SUBTITLE_CACHE, async (_event, request: AsrSubtitleTranslationRequest) => withSubtitleUrls(await getAsrRuntime().resolveTranslatedSubtitleCache(request)) satisfies AsrSubtitleTranslationResult)
  ipcMain.handle(IPC_CHANNELS.ASR_EXPORT_SUBTITLE_SRT, async (_event, request: AsrSubtitleExportRequest) => {
    const result = await getAsrRuntime().exportSubtitleSrt(request)
    if (!result.subtitleSrtPath) return result
    const subtitleSrtFile = createMediaFile(result.subtitleSrtPath)
    return { ...result, subtitleSrtUrl: subtitleSrtFile.url } satisfies AsrSubtitleExportResult
  })
}
