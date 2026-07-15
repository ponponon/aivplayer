import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { SubtitleTargetLanguageId } from '../../shared/app-settings.ts'
import type {
  AsrJobProgress,
  AsrErrorDetails,
  BatchSubtitleItem,
  BatchSubtitleJob,
  BatchSubtitleStartRequest,
  MediaFile
} from '../../shared/media-types.ts'
import type { AsrRuntime } from './asr-runtime.ts'

type BatchSubtitleManagerOptions = {
  runtime: AsrRuntime
  stateFilePath: string
  logDirectoryPath?: string
  emit: (job: BatchSubtitleJob) => void
}

const maxBatchConcurrency = 3

function normalizeBatchConcurrency(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.min(maxBatchConcurrency, Math.max(1, Math.floor(value ?? 1)))
}

class BatchCancelledError extends Error {
  constructor() {
    super('Batch subtitle task cancelled')
    this.name = 'BatchCancelledError'
  }
}

class BatchItemError extends Error {
  readonly details?: AsrErrorDetails

  constructor(message: string, details?: AsrErrorDetails) {
    super(message)
    this.name = 'BatchItemError'
    this.details = details
  }
}

function isSubtitleLanguageMatch(sourceLanguage: string | undefined, targetLanguage: SubtitleTargetLanguageId): boolean {
  const normalizedLanguage = sourceLanguage?.trim().toLowerCase().replace(/_/g, '-')
  return Boolean(normalizedLanguage && (normalizedLanguage === targetLanguage || normalizedLanguage.startsWith(`${targetLanguage}-`)))
}

function createSummary(items: BatchSubtitleItem[]): BatchSubtitleJob['summary'] {
  return {
    total: items.length,
    queued: items.filter((item) => item.status === 'queued').length,
    processing: items.filter((item) => item.status === 'asr' || item.status === 'translating').length,
    completed: items.filter((item) => item.status === 'completed').length,
    failed: items.filter((item) => item.status === 'failed').length,
    cancelled: items.filter((item) => item.status === 'cancelled').length
  }
}

function createItems(files: MediaFile[]): BatchSubtitleItem[] {
  return files.map((file, index) => ({
    id: `batch-item-${index}-${file.id}`,
    file,
    status: 'queued',
    percent: 0,
    message: 'queued',
    attempts: 0
  }))
}

function normalizeLoadedJob(job: BatchSubtitleJob): BatchSubtitleJob {
  const items = job.items.map((item) => {
    if (item.status === 'asr' || item.status === 'translating') {
      return {
        ...item,
        status: 'queued' as const,
        percent: 0,
        message: 'queued'
      }
    }

    return item
  })

  return {
    ...job,
    onlyMissing: job.onlyMissing ?? true,
    maxConcurrent: normalizeBatchConcurrency(job.maxConcurrent),
    status: job.status === 'running' ? 'paused' : job.status,
    pauseRequested: job.status === 'running' ? true : job.pauseRequested,
    currentItemId: null,
    message: job.status === 'running' ? 'paused-after-restart' : job.message,
    items,
    summary: createSummary(items)
  }
}

export class BatchSubtitleManager {
  private readonly runtime: AsrRuntime
  private readonly stateFilePath: string
  private readonly logDirectoryPath: string
  private emitJob: (job: BatchSubtitleJob) => void
  private job: BatchSubtitleJob | null = null
  private runPromise: Promise<void> | null = null
  private translationControllers = new Map<string, AbortController>()
  private asrQueue: Promise<void> = Promise.resolve()
  private persistQueue: Promise<void> = Promise.resolve()
  private cancelRequested = false
  private loaded = false

  constructor(options: BatchSubtitleManagerOptions) {
    this.runtime = options.runtime
    this.stateFilePath = options.stateFilePath
    this.logDirectoryPath = options.logDirectoryPath ?? join(dirname(options.stateFilePath), 'logs')
    this.emitJob = options.emit
  }

  setEmitter(emit: (job: BatchSubtitleJob) => void): void {
    this.emitJob = emit
  }

  async getCurrent(): Promise<BatchSubtitleJob | null> {
    await this.ensureLoaded()
    return this.job
  }

  async start(request: BatchSubtitleStartRequest): Promise<BatchSubtitleJob> {
    await this.ensureLoaded()

    if (this.runPromise) {
      return this.requireJob()
    }

    if (request.files.length === 0) {
      throw new Error('No video files selected')
    }

    const now = Date.now()
    const items = createItems(request.files)
    this.job = {
      id: `batch-${now}`,
      rootPath: request.rootPath,
      targetLanguage: request.targetLanguage,
      onlyMissing: request.onlyMissing !== false,
      maxConcurrent: normalizeBatchConcurrency(request.maxConcurrent),
      modelId: request.modelId,
      sourceLanguage: request.sourceLanguage,
      status: 'running',
      pauseRequested: false,
      currentItemId: null,
      message: 'running',
      items,
      summary: createSummary(items),
      startedAt: now
    }
    this.cancelRequested = false
    await this.appendLog(this.job, 'task-started', {
      rootPath: this.job.rootPath,
      fileCount: this.job.items.length,
      targetLanguage: this.job.targetLanguage,
      onlyMissing: this.job.onlyMissing,
      maxConcurrent: this.job.maxConcurrent,
      modelId: this.job.modelId
    })
    await this.persistAndEmit()
    this.runInBackground()
    return this.requireJob()
  }

  async pause(): Promise<BatchSubtitleJob | null> {
    await this.ensureLoaded()
    if (!this.job || this.job.status !== 'running') {
      return this.job
    }

    this.job.pauseRequested = true
    this.job.message = 'pause-requested'
    await this.persistAndEmit()
    return this.job
  }

  async resume(): Promise<BatchSubtitleJob | null> {
    await this.ensureLoaded()
    if (!this.job || this.job.status !== 'paused') {
      return this.job
    }

    this.job.status = 'running'
    this.job.pauseRequested = false
    this.job.message = 'running'
    this.cancelRequested = false
    await this.persistAndEmit()
    this.runInBackground()
    return this.job
  }

  async cancel(): Promise<BatchSubtitleJob | null> {
    await this.ensureLoaded()
    if (!this.job || (this.job.status !== 'running' && this.job.status !== 'paused')) {
      return this.job
    }

    this.cancelRequested = true
    this.job.pauseRequested = false
    this.job.message = 'cancel-requested'
    for (const controller of this.translationControllers.values()) {
      controller.abort()
    }

    if (!this.runPromise) {
      this.markRemainingCancelled()
      this.job.status = 'cancelled'
      this.job.message = 'cancelled'
      this.job.completedAt = Date.now()
      this.job.elapsedMs = this.job.completedAt - this.job.startedAt
    }

    await this.persistAndEmit()
    return this.job
  }

  async retryFailed(): Promise<BatchSubtitleJob | null> {
    await this.ensureLoaded()
    if (!this.job || this.runPromise) {
      return this.job
    }

    const failedItems = this.job.items.filter((item) => item.status === 'failed')
    if (failedItems.length === 0) {
      return this.job
    }

    for (const item of failedItems) {
      item.status = 'queued'
      item.percent = 0
      item.message = 'queued'
      item.error = undefined
      item.errorDetails = undefined
      item.cacheHit = undefined
      item.asrElapsedMs = undefined
      item.translationElapsedMs = undefined
      item.subtitlePath = undefined
      item.translatedSubtitlePath = undefined
    }

    this.job.status = 'running'
    this.job.pauseRequested = false
    this.job.message = 'retrying'
    this.job.completedAt = undefined
    this.job.elapsedMs = undefined
    this.cancelRequested = false
    await this.persistAndEmit()
    this.runInBackground()
    return this.job
  }

  private runInBackground(): void {
    if (this.runPromise) {
      return
    }

    const promise = this.runLoop()
    this.runPromise = promise
    void promise.then(
      () => {
        if (this.runPromise === promise) {
          this.runPromise = null
        }
      },
      () => {
        if (this.runPromise === promise) {
          this.runPromise = null
        }
      }
    )
  }

  private async runLoop(): Promise<void> {
    const job = this.requireJob()

    try {
      await Promise.all(
        Array.from({ length: normalizeBatchConcurrency(job.maxConcurrent) }, () => this.runWorker(job))
      )

      if (this.cancelRequested) {
        this.markRemainingCancelled()
        job.summary = createSummary(job.items)
        job.status = 'cancelled'
        job.message = 'cancelled'
        job.completedAt = Date.now()
        job.elapsedMs = job.completedAt - job.startedAt
        await this.appendLog(job, 'task-cancelled', {
          elapsedMs: job.elapsedMs,
          summary: job.summary
        })
        await this.persistAndEmit()
        return
      }

      if (job.pauseRequested) {
        job.status = 'paused'
        job.message = 'paused'
        job.currentItemId = null
        await this.appendLog(job, 'task-paused', { summary: job.summary })
        await this.persistAndEmit()
        return
      }

      job.status = 'completed'
      job.message = job.summary.failed > 0 ? 'completed-with-failures' : 'completed'
      job.completedAt = Date.now()
      job.elapsedMs = job.completedAt - job.startedAt
      job.currentItemId = null
      await this.appendLog(job, 'task-completed', {
        elapsedMs: job.elapsedMs,
        summary: job.summary
      })
      await this.persistAndEmit()
    } catch (error) {
      job.status = 'failed'
      job.message = error instanceof Error ? error.message : String(error)
      job.currentItemId = null
      await this.persistAndEmit()
    } finally {
      this.translationControllers.clear()
    }
  }

  private async runWorker(job: BatchSubtitleJob): Promise<void> {
    while (!this.cancelRequested && !job.pauseRequested) {
      const item = job.items.find((candidate) => candidate.status === 'queued')
      if (!item) {
        return
      }

      item.status = 'asr'
      item.percent = 0
      item.message = 'asr'
      item.attempts += 1
      item.startedAt = Date.now()
      item.completedAt = undefined
      item.elapsedMs = undefined
      item.error = undefined
      item.errorDetails = undefined
      item.cacheHit = undefined
      await this.appendLog(job, 'file-started', {
        itemId: item.id,
        filePath: item.file.path,
        attempt: item.attempts
      })
      await this.persistAndEmit()

      try {
        await this.processItem(job, item)
        item.status = 'completed'
        item.percent = 1
        item.message = 'completed'
        item.completedAt = Date.now()
        item.elapsedMs = item.completedAt - (item.startedAt ?? item.completedAt)
        await this.appendLog(job, 'file-completed', {
          itemId: item.id,
          filePath: item.file.path,
          elapsedMs: item.elapsedMs,
          cacheHit: item.cacheHit === true,
          asrElapsedMs: item.asrElapsedMs,
          translationElapsedMs: item.translationElapsedMs
        })
      } catch (error) {
        if (error instanceof BatchCancelledError || this.cancelRequested) {
          item.status = 'cancelled'
          item.percent = null
          item.message = 'cancelled'
          await this.appendLog(job, 'file-cancelled', { itemId: item.id, filePath: item.file.path })
        } else {
          item.status = 'failed'
          item.percent = null
          item.message = 'failed'
          item.error = error instanceof Error ? error.message : String(error)
          item.errorDetails = error instanceof BatchItemError ? error.details : undefined
          item.completedAt = Date.now()
          item.elapsedMs = item.completedAt - (item.startedAt ?? item.completedAt)
          await this.appendLog(job, 'file-failed', {
            itemId: item.id,
            filePath: item.file.path,
            elapsedMs: item.elapsedMs,
            message: item.error,
            errorDetails: item.errorDetails
          })
        }
      } finally {
        await this.persistAndEmit()
      }
    }
  }

  private async processItem(job: BatchSubtitleJob, item: BatchSubtitleItem): Promise<void> {
    if (job.onlyMissing) {
      const cachedAsr = await this.runtime.resolveSubtitleCache({
        mediaPath: item.file.path,
        modelId: job.modelId,
        language: job.sourceLanguage
      })

      if (cachedAsr.success && cachedAsr.subtitlePath) {
        item.cacheHit = true
        item.subtitlePath = cachedAsr.subtitlePath
        item.asrElapsedMs = 0
        const cachedSourceLanguage = cachedAsr.subtitleLanguage ?? job.sourceLanguage ?? 'auto'

        if (isSubtitleLanguageMatch(cachedSourceLanguage, job.targetLanguage)) {
          item.translationElapsedMs = 0
          item.translatedSubtitlePath = cachedAsr.subtitlePath
          return
        }

        if (cachedAsr.subtitlePath) {
          const cachedTranslation = await this.runtime.resolveTranslatedSubtitleCache({
            subtitlePath: cachedAsr.subtitlePath,
            subtitleSrtPath: cachedAsr.subtitleSrtPath,
            sourceLanguage: cachedSourceLanguage,
            targetLanguage: job.targetLanguage
          })

          if (cachedTranslation.success && cachedTranslation.subtitlePath) {
            item.translationElapsedMs = 0
            item.translatedSubtitlePath = cachedTranslation.subtitlePath
            return
          }
        }
      }
    }

    const asrResult = await this.runAsrExclusively(job, () =>
      this.runtime.generateSubtitle(
        {
          mediaPath: item.file.path,
          modelId: job.modelId,
          language: job.sourceLanguage
        },
        (progress) => this.applyAsrProgress(job, item, progress)
      )
    )

    if (!asrResult.success || !asrResult.subtitlePath) {
      throw new BatchItemError(asrResult.message, asrResult.errorDetails)
    }

    item.subtitlePath = asrResult.subtitlePath
    item.asrElapsedMs = asrResult.generationStats?.elapsedMs
    item.cacheHit = asrResult.generationStats?.cacheHit

    if (this.cancelRequested) {
      throw new BatchCancelledError()
    }

    const sourceLanguage = asrResult.subtitleLanguage ?? job.sourceLanguage ?? 'auto'
    if (isSubtitleLanguageMatch(sourceLanguage, job.targetLanguage)) {
      item.translationElapsedMs = 0
      item.translatedSubtitlePath = asrResult.subtitlePath
      return
    }

    item.status = 'translating'
    item.percent = 0
    item.message = 'translating'
    await this.persistAndEmit()

    const translationController = new AbortController()
    this.translationControllers.set(item.id, translationController)
    const translationResult = await this.runtime.translateSubtitle(
      {
        subtitlePath: asrResult.subtitlePath,
        subtitleSrtPath: asrResult.subtitleSrtPath,
        sourceLanguage,
        targetLanguage: job.targetLanguage
      },
      {
        signal: translationController.signal,
        onProgress: (progress) => this.applyTranslationProgress(job, item, progress)
      }
    )
    this.translationControllers.delete(item.id)

    if (!translationResult.success || !translationResult.subtitlePath) {
      if (translationResult.canceled || this.cancelRequested) {
        throw new BatchCancelledError()
      }

      throw new BatchItemError(translationResult.message, translationResult.errorDetails)
    }

    item.translatedSubtitlePath = translationResult.subtitlePath
    item.translationElapsedMs = translationResult.translationStats?.elapsedMs
  }

  private applyAsrProgress(job: BatchSubtitleJob, item: BatchSubtitleItem, progress: AsrJobProgress): void {
    item.status = 'asr'
    item.percent = progress.percent
    item.message = progress.message
    this.emitSnapshot(job)
  }

  private applyTranslationProgress(job: BatchSubtitleJob, item: BatchSubtitleItem, progress: AsrJobProgress): void {
    item.status = 'translating'
    item.percent = progress.percent
    item.message = progress.message
    this.emitSnapshot(job)
  }

  private markRemainingCancelled(): void {
    if (!this.job) {
      return
    }

    for (const item of this.job.items) {
      if (item.status === 'queued' || item.status === 'asr' || item.status === 'translating') {
        item.status = 'cancelled'
        item.percent = null
        item.message = 'cancelled'
      }
    }
  }

  private requireJob(): BatchSubtitleJob {
    if (!this.job) {
      throw new Error('No batch subtitle task')
    }

    return this.job
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return
    }

    this.loaded = true
    try {
      const content = await readFile(this.stateFilePath, 'utf8')
      this.job = normalizeLoadedJob(JSON.parse(content) as BatchSubtitleJob)
    } catch {
      this.job = null
    }
  }

  private async appendLog(job: BatchSubtitleJob, event: string, details: Record<string, unknown> = {}): Promise<void> {
    try {
      await mkdir(this.logDirectoryPath, { recursive: true })
      await appendFile(
        join(this.logDirectoryPath, `${job.id}.jsonl`),
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          event,
          jobId: job.id,
          ...details
        })}\n`,
        'utf8'
      )
    } catch {
      // Logging must never stop a subtitle task.
    }
  }

  private emitSnapshot(job: BatchSubtitleJob): void {
    job.summary = createSummary(job.items)
    job.currentItemId = job.items.find((item) => item.status === 'asr' || item.status === 'translating')?.id ?? null
    this.emitJob(job)
  }

  private async persistAndEmit(): Promise<void> {
    const write = this.persistQueue.then(async () => {
      if (!this.job) {
        return
      }

      this.emitSnapshot(this.job)
      await mkdir(dirname(this.stateFilePath), { recursive: true })
      const temporaryPath = join(dirname(this.stateFilePath), `${basename(this.stateFilePath)}.tmp`)
      await writeFile(temporaryPath, `${JSON.stringify(this.job, null, 2)}\n`, 'utf8')
      await rename(temporaryPath, this.stateFilePath)
    })
    this.persistQueue = write.catch(() => undefined)
    await write
  }

  private async runAsrExclusively<T>(job: BatchSubtitleJob, run: () => Promise<T>): Promise<T> {
    const previous = this.asrQueue
    let release: () => void = () => undefined
    this.asrQueue = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous
    try {
      if (this.cancelRequested) {
        throw new BatchCancelledError()
      }

      return await run()
    } finally {
      release()
    }
  }
}

export function getBatchSubtitleStatePath(userDataPath: string): string {
  return join(userDataPath, 'batch-subtitle-job.json')
}

export function getBatchSubtitleLogDirectoryPath(userDataPath: string): string {
  return join(userDataPath, 'logs', 'batch-subtitles')
}
