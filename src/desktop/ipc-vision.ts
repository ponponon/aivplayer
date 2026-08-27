import { app, ipcMain } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { VisionClipCollectionBatchDeleteRequest, VisionClipCollectionBatchDuplicateRequest, VisionClipCollectionBatchExportRequest, VisionClipCollectionBatchMergeRequest, VisionClipCollectionBatchRenameRequest, VisionClipCollectionBatchTagsRequest, VisionClipCollectionFlagUpdateRequest, VisionClipCollectionRenameRequest, VisionClipCollectionTagCleanupRequest, VisionClipCollectionTagMetadataImportApplyRequest, VisionClipCollectionTagMetadataUpdateRequest, VisionClipCollectionTagRenameRequest, VisionClipCollectionTagOperationHistoryPageRequest, VisionClipCollectionExportFormat, VisionClipCollectionExportRequest, VisionClipCollectionInput, VisionDirectoryScanRequest, VisionEvidenceAuditPage, VisionEvidenceAuditRequest, VisionEvidenceBatchClearResult, VisionEvidenceSourceRequest, VisionEvidenceType, VisionIndexFailureRetryBatchRequest, VisionIndexFailureRetryRequest, VisionIndexProgress, VisionIndexRequest, VisionLibrarySourceRequest, VisionModelDownloadResult, VisionPackDownloadResult, VisionSavedSearchInput, VisionSearchFullExportRequest, VisionSearchPageKind, VisionSearchPageRequest, VisionSearchRequest, VisionSearchResult, VisionSearchResultPage, VisionSearchResultsExportFormat, VisionSearchResultsExportRequest, VisionSearchResultsExportResult, VisionSimilarSearchRequest } from '../shared/vision-types'
import { VISION_SEARCH_FULL_EXPORT_MAX_RESULTS } from '../shared/vision-types'
import type { VisionEntityCatalogBatchPatch, VisionEntityCatalogCreateInput, VisionEntityCatalogPatch } from '../shared/vision-entity-types'
import { scanVisionDirectory, isVisionScanAbortError } from '../core/ai/vision-directory-scan'
import { renderVisionClipCollectionExport, renderVisionClipCollectionsExport } from '../core/ai/clip-inbox-export'
import { createVisionClipCollectionTagMetadataImportPreview, filterVisionClipCollectionTagMetadataImport, parseVisionClipCollectionTagMetadataImport, parseVisionClipCollectionTagMetadataImportText, renderVisionClipCollectionTagMetadataExport } from '../core/ai/clip-inbox-tag-transfer'
import { parseVisionClipCollectionImportText, parseVisionClipCollectionsImport } from '../core/ai/clip-inbox-import'
import { normalizeVisionClipCollectionIds, normalizeVisionClipCollectionRenamePart, normalizeVisionCollectionTag, normalizeVisionCollectionTagColor, normalizeVisionCollectionTags, normalizeVisionCollectionTagsMode, wouldCreateVisionCollectionTagParentCycle } from '../core/ai/clip-inbox-operations'
import { isVisionSearchExportAbortError, renderVisionSearchResultsExport } from '../core/ai/vision-search-export'
import { writeVisionSearchResultsExportResumable } from '../core/ai/vision-search-export-resumable'
import { getVisionSearchExportPartsDirectory } from '../core/ai/vision-search-export-store'
import type { VisionSearchExportTaskRecord } from '../core/ai/vision-search-export-store'
import { getClipInboxStore, getMediaImportInboxStore, getSpeakerDiarizationCatalogStore, getVisionEntityCatalogStore, getVisionIndexCoordinator, getVisionIndexFailureStore, getVisionIndexQueue, getVisionLibrary, getVisionSavedSearchStore, getVisionSearchExportStore, trackVisionIndexProgress } from './desktop-services'
import { desktopState } from './desktop-state'
import { promptForOpenPath, promptForSavePath } from './media-dialogs'
import { getCurrentLocale } from './desktop-settings'
import { getAppCopy } from '../shared/i18n'
import { createVisionSearchExportTaskCenterEvent, createVisionTaskCenterEvent } from '../core/tasks/task-center-adapters'
import { sendTaskCenterEvent } from './task-center-events'
import type { VisionSearchExportBatchRecreateRequest, VisionSearchExportBatchRecreateResult, VisionSearchExportCancelRequest, VisionSearchExportProgress, VisionSearchExportRetryRequest } from '../shared/vision-search-export-types'
import { getVisionSearchRevisionBody, isVisionSearchRevisionUnavailableError, type VisionSearchCatalogSnapshot, type VisionSearchRevision } from '../shared/vision-search-revision'
import { VISION_INDEX_FAILURE_MAX_RETRY_BATCH } from '../core/ai/vision-index-failure'
import { mergeVisionLibrarySourceMetadata } from '../core/ai/vision-library-source-metadata'
import { applySpeakerDiarizationCatalogToResults, filterSpeakerDiarizationCatalogSearchResults, getSpeakerDiarizationCatalogSearchQueries } from '../core/ai/speaker-diarization-catalog'
import { downloadVisionModel } from '../core/ai/vision-model-downloader'
import { downloadVisionPack } from '../core/ai/vision-pack-downloader'
import { applyVisionEntityCatalogToResults, getVisionEntityCatalogSearchQueries } from '../core/ai/vision-entity-catalog'
import { filterVisionSearchResultsByEvidenceTypes } from '../core/ai/vision-search'
import { normalizeVisionObjectDetectionFilterState } from '../core/ai/vision-object-detection-filter'
import { normalizeVisionSimilarSearchRequest } from '../core/ai/vision-similar-search'
import { VisionSearchCursorStore, VISION_SEARCH_SNAPSHOT_MAX_RESULTS } from '../core/ai/vision-search-cursor'
import { createEmptyVisionEvidenceCounts, normalizeVisionEvidenceAuditStatuses, normalizeVisionEvidenceClearTargets, normalizeVisionDerivedEvidenceTypes } from '../core/ai/vision-evidence-sources'
import { hasVisionSearchExportOutputPathConflict, normalizeVisionSearchExportTaskIds } from '../core/ai/vision-search-export-recreate'
import { acquireVisionSearchExportOutputLock, VisionSearchExportOutputLockError, withVisionSearchExportOutputLock } from '../core/ai/vision-search-export-lock'

const VISION_EVIDENCE_TYPES: readonly VisionEvidenceType[] = ['subtitle', 'visual', 'scene', 'ocr', 'entity', 'object', 'speaker']

function normalizeVisionEvidenceTypes(value: unknown): VisionEvidenceType[] {
  if (!Array.isArray(value)) return []
  const allowed = new Set(VISION_EVIDENCE_TYPES)
  return [...new Set(value.filter((item): item is VisionEvidenceType => typeof item === 'string' && allowed.has(item as VisionEvidenceType)))]
}

function normalizeVisionSearchLimit(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(VISION_SEARCH_SNAPSHOT_MAX_RESULTS, Math.floor(value)) : 24
}

const visionSearchCursorStore = new VisionSearchCursorStore()

let visionModelDownloadPromise: Promise<VisionModelDownloadResult> | null = null
let visionPackDownloadPromise: Promise<VisionPackDownloadResult> | null = null

async function listVisionSourcesWithMetadata(request: VisionLibrarySourceRequest = {}): Promise<ReturnType<typeof mergeVisionLibrarySourceMetadata>> {
  const sources = await getVisionLibrary().listSources(request.limit, request.offset)
  const inbox = getMediaImportInboxStore()
  await inbox.refreshSidecars(sources.map((source) => source.videoPath))
  return mergeVisionLibrarySourceMetadata(sources, inbox.listItems())
}

function mergeVisionSearchResults(resultGroups: readonly VisionSearchResult[][]): VisionSearchResult[] {
  const results = new Map<string, VisionSearchResult>()
  for (const group of resultGroups) {
    for (const result of group) {
      const key = `${result.videoPath}\0${result.evidenceId ?? result.id}`
      const previous = results.get(key)
      if (!previous || result.score > previous.score) results.set(key, result)
    }
  }
  return [...results.values()].sort((left, right) => right.score - left.score)
}

function getVisionSearchCatalogSnapshot(revision?: VisionSearchRevision): VisionSearchCatalogSnapshot {
  if (revision?.catalogs) return revision.catalogs
  return {
    entity: getVisionEntityCatalogStore().get(),
    speaker: getSpeakerDiarizationCatalogStore().get()
  }
}

async function getVisionSearchRevisionWithCatalogs(): Promise<VisionSearchRevision> {
  const revision = await getVisionLibrary().getSearchRevision()
  const body = getVisionSearchRevisionBody({
    ...revision,
    catalogs: getVisionSearchCatalogSnapshot()
  })
  return {
    ...body,
    fingerprint: createHash('sha256').update(JSON.stringify(body)).digest('hex')
  }
}

function sendVisionProgress(sender: Electron.WebContents, progress: VisionIndexProgress): void {
  if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.VISION_INDEX_PROGRESS, progress)
  sendTaskCenterEvent(createVisionTaskCenterEvent(progress))
}

function normalizeMediaPaths(request: VisionIndexRequest): string[] {
  if (!request || !Array.isArray(request.mediaPaths)) return []
  return Array.from(new Set(request.mediaPaths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)))
}

function isVisionClipCollectionExportFormat(value: unknown): value is VisionClipCollectionExportFormat {
  return value === 'json' || value === 'csv' || value === 'edl'
}

function isVisionSearchResultsExportFormat(value: unknown): value is VisionSearchResultsExportFormat {
  return value === 'json' || value === 'csv'
}

function normalizeVisionSearchResultsForExport(value: unknown, maxResults = 100): VisionSearchResult[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is VisionSearchResult => Boolean(item) && typeof item === 'object' && typeof (item as VisionSearchResult).id === 'string' && typeof (item as VisionSearchResult).videoPath === 'string' && typeof (item as VisionSearchResult).fileName === 'string' && typeof (item as VisionSearchResult).timestampSeconds === 'number' && typeof (item as VisionSearchResult).score === 'number' && typeof (item as VisionSearchResult).modelId === 'string' && typeof (item as VisionSearchResult).modelVariant === 'string').slice(0, maxResults)
}

function isVisionSearchPageKind(value: unknown): value is VisionSearchPageKind {
  return value === 'text' || value === 'image' || value === 'similar'
}

function normalizeVisionSearchOffset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function createEmptyVisionSearchResultPage(limit: number): VisionSearchResultPage {
  return { results: [], total: 0, offset: 0, limit, hasMore: false }
}

async function searchVisionTextResults(request: VisionSearchRequest, full = false, signal?: AbortSignal, revision?: VisionSearchRevision): Promise<VisionSearchResult[]> {
  if (!request?.query?.trim()) return []
  const evidenceTypes = normalizeVisionEvidenceTypes(request.evidenceTypes)
  const objectDetectionFilter = normalizeVisionObjectDetectionFilterState(request.objectDetectionFilter)
  const resultLimit = full ? VISION_SEARCH_FULL_EXPORT_MAX_RESULTS : normalizeVisionSearchLimit(request.limit)
  const searchLimit = full ? VISION_SEARCH_FULL_EXPORT_MAX_RESULTS : evidenceTypes.length > 0 ? Math.max(resultLimit, VISION_SEARCH_SNAPSHOT_MAX_RESULTS) : resultLimit
  const catalogs = getVisionSearchCatalogSnapshot(revision)
  const directQueries = [...new Set([request.query, ...getVisionEntityCatalogSearchQueries(request.query, catalogs.entity)])]
  const speakerQueries = getSpeakerDiarizationCatalogSearchQueries(request.query, catalogs.speaker)
  const directGroups = await Promise.all(directQueries.map((query) => full ? getVisionLibrary().searchTextAll(query, request.mode, objectDetectionFilter, signal, revision) : getVisionLibrary().searchText(query, searchLimit, request.mode, objectDetectionFilter)))
  const speakerGroups = await Promise.all(speakerQueries.map((searchQuery) => full ? getVisionLibrary().searchTextAll(searchQuery.query, request.mode, objectDetectionFilter, signal, revision) : getVisionLibrary().searchText(searchQuery.query, searchLimit, request.mode, objectDetectionFilter)))
  const scopedSpeakerGroups = speakerQueries.map((searchQuery, index) => filterSpeakerDiarizationCatalogSearchResults(speakerGroups[index] ?? [], searchQuery))
  const results = applySpeakerDiarizationCatalogToResults(applyVisionEntityCatalogToResults(mergeVisionSearchResults([...directGroups, ...scopedSpeakerGroups]), catalogs.entity), catalogs.speaker)
  return filterVisionSearchResultsByEvidenceTypes(results, evidenceTypes, resultLimit)
}

async function searchVisionImageResults(request: VisionSearchRequest, full = false, signal?: AbortSignal, revision?: VisionSearchRevision): Promise<VisionSearchResult[]> {
  if (!request?.imagePath?.trim()) return []
  const evidenceTypes = normalizeVisionEvidenceTypes(request.evidenceTypes)
  const objectDetectionFilter = normalizeVisionObjectDetectionFilterState(request.objectDetectionFilter)
  const resultLimit = full ? VISION_SEARCH_FULL_EXPORT_MAX_RESULTS : normalizeVisionSearchLimit(request.limit)
  const searchLimit = full ? VISION_SEARCH_FULL_EXPORT_MAX_RESULTS : evidenceTypes.length > 0 ? Math.max(resultLimit, VISION_SEARCH_SNAPSHOT_MAX_RESULTS) : resultLimit
  const results = await (full ? getVisionLibrary().searchImageAll(request.imagePath, objectDetectionFilter, signal, revision) : getVisionLibrary().searchImage(request.imagePath, searchLimit, objectDetectionFilter))
  const catalogs = getVisionSearchCatalogSnapshot(revision)
  const enrichedResults = applySpeakerDiarizationCatalogToResults(applyVisionEntityCatalogToResults(results, catalogs.entity), catalogs.speaker)
  return filterVisionSearchResultsByEvidenceTypes(enrichedResults, evidenceTypes, resultLimit)
}

async function searchVisionSimilarResults(request: VisionSimilarSearchRequest, full = false, signal?: AbortSignal, revision?: VisionSearchRevision): Promise<VisionSearchResult[]> {
  const normalizedRequest = normalizeVisionSimilarSearchRequest(request)
  if (!normalizedRequest) return []
  const results = await (full ? getVisionLibrary().searchSimilarAll(normalizedRequest, signal, revision) : getVisionLibrary().searchSimilar(normalizedRequest))
  const catalogs = getVisionSearchCatalogSnapshot(revision)
  return applySpeakerDiarizationCatalogToResults(applyVisionEntityCatalogToResults(results, catalogs.entity), catalogs.speaker)
}

async function searchVisionFullResults(request: VisionSearchFullExportRequest, signal?: AbortSignal, revision?: VisionSearchRevision): Promise<VisionSearchResult[]> {
  if (request.kind === 'text') return searchVisionTextResults(request.request, true, signal, revision)
  if (request.kind === 'image') return searchVisionImageResults(request.request, true, signal, revision)
  return searchVisionSimilarResults(request.request, true, signal, revision)
}

function sendVisionSearchExportProgress(progress: VisionSearchExportProgress): void {
  sendTaskCenterEvent(createVisionSearchExportTaskCenterEvent(progress))
}

async function runVisionSearchFullExportTask(task: VisionSearchExportTaskRecord, controller: AbortController): Promise<void> {
  const copy = getAppCopy(getCurrentLocale()).vision
  const signal = controller.signal
  const store = getVisionSearchExportStore()
  const taskId = task.taskId
  const request = task.request
  const outputPath = task.outputPath
  let outputLock: Awaited<ReturnType<typeof acquireVisionSearchExportOutputLock>> | null = null
  const emit = (progress: Omit<VisionSearchExportProgress, 'taskId' | 'format'>): void => {
    sendVisionSearchExportProgress({ ...progress, taskId, format: request.format, outputPath })
  }
  try {
    outputLock = await acquireVisionSearchExportOutputLock(outputPath, taskId)
    const runningTask = store.update(taskId, { status: 'running', error: undefined }) ?? task
    emit({ status: 'running', stage: 'searching', resultCount: runningTask.resultCount, writtenCount: runningTask.writtenCount, message: copy.searchResultsFullExportSearching })
    const results = normalizeVisionSearchResultsForExport(await searchVisionFullResults(request, signal, task.searchRevision), VISION_SEARCH_FULL_EXPORT_MAX_RESULTS)
    if (signal.aborted) {
      const error = new Error(copy.searchResultsFullExportCancelled)
      error.name = 'AbortError'
      throw error
    }
    if (results.length === 0) throw new Error('没有可导出的搜索结果')
    store.update(taskId, { resultCount: results.length, error: undefined })
    emit({ status: 'running', stage: 'writing', resultCount: results.length, writtenCount: store.get(taskId)?.writtenCount ?? 0, message: copy.searchResultsFullExportWriting(store.get(taskId)?.writtenCount ?? 0, results.length) })
    const resumableResult = await writeVisionSearchResultsExportResumable(results, request.format, {
      outputPath,
      partsDirectory: task.partsDirectory,
      assemblyPath: `${outputPath}.${taskId}.assembling`,
      chunkSize: task.chunkSize,
      completedParts: store.get(taskId)?.completedParts ?? task.completedParts,
      signal,
      onPartComplete: async ({ partIndex, partCount, writtenCount, totalCount, hash, reused }) => {
        store.markPartCompleted(taskId, partIndex, hash, writtenCount)
        emit({ status: 'running', stage: 'writing', resultCount: totalCount, writtenCount, message: `${copy.searchResultsFullExportWriting(writtenCount, totalCount)}${reused ? '（已恢复）' : ''}` })
        if (partIndex === partCount - 1) await store.flush()
      }
    })
    store.update(taskId, { resultCount: resumableResult.resultCount, writtenCount: resumableResult.resultCount, completedParts: resumableResult.completedParts, status: 'completed', error: undefined })
    await store.flush()
    emit({ status: 'completed', stage: 'completed', resultCount: results.length, writtenCount: results.length, message: copy.searchResultsFullExported(results.length, outputPath) })
  } catch (error) {
    const persistedTask = store.get(taskId) ?? task
    if (isVisionSearchExportAbortError(error) || signal.aborted) {
      store.update(taskId, { status: 'cancelled', error: undefined })
      emit({ status: 'cancelled', stage: 'cancelled', resultCount: persistedTask.resultCount, writtenCount: persistedTask.writtenCount, message: copy.searchResultsFullExportCancelled })
    } else {
      const message = error instanceof VisionSearchExportOutputLockError
        ? copy.searchResultsFullExportOutputLocked
        : isVisionSearchRevisionUnavailableError(error)
          ? copy.searchResultsFullExportRevisionUnavailable(error.tableName, error.version)
          : error instanceof Error ? error.message : String(error)
      store.update(taskId, { status: 'failed', error: message })
      emit({ status: 'failed', stage: 'failed', resultCount: persistedTask.resultCount, writtenCount: persistedTask.writtenCount, message })
    }
    await store.flush()
  } finally {
    await outputLock?.release().catch(() => undefined)
    if (desktopState.visionSearchExportAbortControllers.get(taskId) === controller) desktopState.visionSearchExportAbortControllers.delete(taskId)
  }
}

function startVisionSearchExportTask(task: VisionSearchExportTaskRecord): boolean {
  if (desktopState.visionSearchExportAbortControllers.has(task.taskId)) return false
  const controller = new AbortController()
  desktopState.visionSearchExportAbortControllers.set(task.taskId, controller)
  const copy = getAppCopy(getCurrentLocale()).vision
  sendVisionSearchExportProgress({ taskId: task.taskId, status: 'queued', stage: 'searching', format: task.request.format, resultCount: task.resultCount, writtenCount: task.writtenCount, message: copy.searchResultsFullExportQueued, outputPath: task.outputPath })
  void runVisionSearchFullExportTask(task, controller)
  return true
}

function createRecreatedVisionSearchExportTask(sourceTask: VisionSearchExportTaskRecord, searchRevision: VisionSearchRevision): VisionSearchExportTaskRecord {
  const recreatedTaskId = randomUUID()
  return getVisionSearchExportStore().create({
    taskId: recreatedTaskId,
    request: sourceTask.request,
    outputPath: sourceTask.outputPath,
    partsDirectory: getVisionSearchExportPartsDirectory(app.getPath('userData'), recreatedTaskId),
    searchRevision
  })
}

function visionSearchExportHasOutputPathConflict(store: ReturnType<typeof getVisionSearchExportStore>, sourceTask: Pick<VisionSearchExportTaskRecord, 'taskId' | 'outputPath'>): boolean {
  return hasVisionSearchExportOutputPathConflict(sourceTask, store.list())
}

export function resumeVisionSearchExports(): void {
  const store = getVisionSearchExportStore()
  for (const task of store.listRecoverable()) {
    const queuedTask = store.update(task.taskId, { status: 'queued', error: undefined }) ?? task
    startVisionSearchExportTask(queuedTask)
  }
}

async function searchVisionResultPage(request: VisionSearchPageRequest): Promise<VisionSearchResultPage> {
  const limit = normalizeVisionSearchLimit(request.request.limit)
  const offset = normalizeVisionSearchOffset(request.offset)
  if (request.cursor?.trim()) return visionSearchCursorStore.readPage(request.kind, request.cursor.trim(), limit, offset)
  const queryRequest = { ...request.request, limit: VISION_SEARCH_SNAPSHOT_MAX_RESULTS }
  const results = request.kind === 'text'
    ? await searchVisionTextResults(queryRequest)
    : request.kind === 'image'
      ? await searchVisionImageResults(queryRequest)
      : await searchVisionSimilarResults(queryRequest as VisionSimilarSearchRequest)
  return visionSearchCursorStore.createPage(request.kind, results, limit, offset)
}

function safeExportTitle(title: string): string {
  return title.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'clip-collection'
}

export function registerVisionIpc(): void {
  ipcMain.handle(IPC_CHANNELS.VISION_STATUS, () => getVisionLibrary().getStatus())
  ipcMain.handle(IPC_CHANNELS.VISION_PACK_DOWNLOAD, async (): Promise<VisionPackDownloadResult> => {
    if (visionPackDownloadPromise) return visionPackDownloadPromise
    visionPackDownloadPromise = (async () => {
      try {
        await downloadVisionPack({ userDataPath: app.getPath('userData') })
        const status = await getVisionLibrary().getStatus()
        return { success: status.packAvailable, message: status.packAvailable ? '视觉运行组件下载完成' : status.message, status }
      } catch (error) {
        const status = await getVisionLibrary().getStatus()
        return { success: false, message: error instanceof Error ? error.message : String(error), status }
      } finally {
        visionPackDownloadPromise = null
      }
    })()
    return visionPackDownloadPromise
  })
  ipcMain.handle(IPC_CHANNELS.VISION_MODEL_DOWNLOAD, async (event): Promise<VisionModelDownloadResult> => {
    if (visionModelDownloadPromise) return visionModelDownloadPromise
    const sender = event.sender
    visionModelDownloadPromise = (async () => {
      try {
        await downloadVisionModel({
          modelRoot: app.getPath('userData'),
          onProgress: (progress) => {
            if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.VISION_MODEL_DOWNLOAD_PROGRESS, progress)
          }
        })
        const status = await getVisionLibrary().getStatus()
        return { success: status.available, message: status.available ? '视觉模型下载完成' : status.message, status }
      } catch (error) {
        const status = await getVisionLibrary().getStatus()
        return { success: false, message: error instanceof Error ? error.message : String(error), status }
      } finally {
        visionModelDownloadPromise = null
      }
    })()
    return visionModelDownloadPromise
  })

  ipcMain.handle(IPC_CHANNELS.VISION_INDEX_START, async (event, request: VisionIndexRequest) => {
    const status = await getVisionLibrary().getStatus()
    if (!status.packAvailable) throw new Error('视觉搜索组件未安装，请先下载安装视觉运行组件')
    if (!status.available) throw new Error(status.message || '视觉模型未就绪，请先下载视觉模型')
    const senderId = event.sender.id
    getVisionIndexQueue().cancel()
    getVisionIndexCoordinator().cancel()
    desktopState.visionAbortControllers.get(senderId)?.abort()
    const controller = new AbortController()
    desktopState.visionAbortControllers.set(senderId, controller)
    try {
      const mediaPaths = normalizeMediaPaths(request)
      const options = { includeSceneEvidence: request?.includeSceneEvidence === true, includeEntityEvidence: request?.includeEntityEvidence === true, includeObjectEvidence: request?.includeObjectEvidence === true }
      return await getVisionIndexCoordinator().run(mediaPaths, request?.intervalSeconds, controller.signal, (progress) => {
        trackVisionIndexProgress(progress, mediaPaths, { intervalSeconds: request?.intervalSeconds, ...options })
        sendVisionProgress(event.sender, progress)
      }, options)
    } finally {
      if (desktopState.visionAbortControllers.get(senderId) === controller) desktopState.visionAbortControllers.delete(senderId)
    }
  })

  ipcMain.handle(IPC_CHANNELS.VISION_INDEX_AUTO_START, (event, request: VisionIndexRequest) => {
    if (!getVisionLibrary().isReadyForIndex()) return false
    const mediaPaths = normalizeMediaPaths(request)
    if (mediaPaths.length === 0) return false
    const options = { includeSceneEvidence: request?.includeSceneEvidence === true, includeEntityEvidence: request?.includeEntityEvidence === true, includeObjectEvidence: request?.includeObjectEvidence === true }
    getVisionIndexQueue().enqueue(mediaPaths, request?.intervalSeconds, (progress) => {
      trackVisionIndexProgress(progress, mediaPaths, { intervalSeconds: request?.intervalSeconds, ...options })
      sendVisionProgress(event.sender, progress)
    }, options)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.VISION_INDEX_CANCEL, (event) => {
    const queueCancelled = getVisionIndexQueue().cancel()
    const coordinatorCancelled = getVisionIndexCoordinator().cancel()
    const controller = desktopState.visionAbortControllers.get(event.sender.id)
    if (!controller) return queueCancelled || coordinatorCancelled
    controller.abort()
    return true
  })

  ipcMain.handle(IPC_CHANNELS.VISION_INDEX_FAILURE_LIST, () => getVisionIndexFailureStore().list())

  ipcMain.handle(IPC_CHANNELS.VISION_INDEX_FAILURE_RETRY, (event, request: VisionIndexFailureRetryRequest) => {
    if (!getVisionLibrary().isReadyForIndex()) return false
    if (!request || typeof request.id !== 'string' || !request.id.trim()) return false
    const failure = getVisionIndexFailureStore().beginRetry(request.id.trim())
    if (!failure) return false
    const options = { intervalSeconds: failure.intervalSeconds, includeSceneEvidence: failure.includeSceneEvidence, includeEntityEvidence: failure.includeEntityEvidence, includeObjectEvidence: failure.includeObjectEvidence }
    getVisionIndexQueue().enqueue([failure.mediaPath], failure.intervalSeconds, (progress) => {
      trackVisionIndexProgress(progress, [failure.mediaPath], options)
      sendVisionProgress(event.sender, progress)
    }, { includeSceneEvidence: options.includeSceneEvidence, includeEntityEvidence: options.includeEntityEvidence, includeObjectEvidence: options.includeObjectEvidence })
    return true
  })

  ipcMain.handle(IPC_CHANNELS.VISION_INDEX_FAILURE_BATCH_RETRY, (event, request: VisionIndexFailureRetryBatchRequest) => {
    if (!getVisionLibrary().isReadyForIndex()) return false
    if (!request || !Array.isArray(request.ids)) return false
    const ids = request.ids.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean)
    if (ids.length === 0 || ids.length > VISION_INDEX_FAILURE_MAX_RETRY_BATCH || new Set(ids).size !== ids.length) return false
    const failures = getVisionIndexFailureStore().beginRetryBatch(ids)
    if (!failures) return false
    for (const failure of failures) {
      const options = { intervalSeconds: failure.intervalSeconds, includeSceneEvidence: failure.includeSceneEvidence, includeEntityEvidence: failure.includeEntityEvidence, includeObjectEvidence: failure.includeObjectEvidence }
      getVisionIndexQueue().enqueue([failure.mediaPath], failure.intervalSeconds, (progress) => {
        trackVisionIndexProgress(progress, [failure.mediaPath], options)
        sendVisionProgress(event.sender, progress)
      }, { includeSceneEvidence: options.includeSceneEvidence, includeEntityEvidence: options.includeEntityEvidence, includeObjectEvidence: options.includeObjectEvidence })
    }
    return true
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SCAN_DIRECTORY_START, async (event, request: VisionDirectoryScanRequest) => {
    const directoryPath = typeof request?.directoryPath === 'string' ? request.directoryPath.trim() : ''
    if (!directoryPath) throw new Error('请选择影视库文件夹')
    const senderId = event.sender.id
    desktopState.visionScanAbortControllers.get(senderId)?.abort()
    const controller = new AbortController()
    desktopState.visionScanAbortControllers.set(senderId, controller)
    const sendProgress = (progress: Parameters<Parameters<typeof scanVisionDirectory>[3]>[0]): void => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.VISION_SCAN_DIRECTORY_PROGRESS, progress)
    }
    try {
      const result = await scanVisionDirectory(directoryPath, request.recursive === true, controller.signal, sendProgress)
      sendProgress({ status: 'completed', directoryPath: result.directoryPath, scannedDirectories: result.scannedDirectories, discoveredVideos: result.discoveredVideos, message: `扫描完成，共发现 ${result.discoveredVideos} 个视频` })
      return result
    } catch (error) {
      if (isVisionScanAbortError(error)) {
        const result = { status: 'cancelled', directoryPath, files: [], scannedDirectories: 0, discoveredVideos: 0 } as const
        sendProgress({ status: 'cancelled', directoryPath, scannedDirectories: 0, discoveredVideos: 0, message: '影视库文件夹扫描已取消' })
        return result
      }
      const message = error instanceof Error ? error.message : String(error)
      sendProgress({ status: 'error', directoryPath, scannedDirectories: 0, discoveredVideos: 0, error: message, message })
      throw error
    } finally {
      if (desktopState.visionScanAbortControllers.get(senderId) === controller) desktopState.visionScanAbortControllers.delete(senderId)
    }
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SCAN_DIRECTORY_CANCEL, (event) => {
    const controller = desktopState.visionScanAbortControllers.get(event.sender.id)
    if (!controller) return false
    controller.abort()
    return true
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_TEXT, async (_event, request: VisionSearchRequest) => {
    return searchVisionTextResults(request)
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_IMAGE, (_event, request: VisionSearchRequest) => {
    return searchVisionImageResults(request)
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_PAGE, async (_event, request: VisionSearchPageRequest): Promise<VisionSearchResultPage> => {
    const limit = normalizeVisionSearchLimit(request?.request?.limit)
    if (!request || !isVisionSearchPageKind(request.kind) || !request.request || typeof request.request !== 'object') return createEmptyVisionSearchResultPage(limit)
    return searchVisionResultPage(request)
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_FULL_EXPORT, async (_event, request: VisionSearchFullExportRequest): Promise<VisionSearchResultsExportResult> => {
    if (!request || !isVisionSearchPageKind(request.kind) || !isVisionSearchResultsExportFormat(request.format) || !request.request || typeof request.request !== 'object') return { success: false, message: '导出参数无效' }
    const copy = getAppCopy(getCurrentLocale()).vision
    const extension = request.format
    const defaultPath = join(app.getPath('documents'), `aivplayer-vision-results-full.${extension}`)
    const filePath = await promptForSavePath({
      title: copy.searchResultsFullExport,
      defaultPath,
      filters: [{ name: `${extension.toUpperCase()} files`, extensions: [extension] }]
    })
    if (!filePath) return { success: false, canceled: true, message: copy.searchResultsExportCanceled }
    const outputPath = filePath.toLowerCase().endsWith(`.${extension}`) ? filePath : `${filePath}.${extension}`
    const taskId = randomUUID()
    let searchRevision: VisionSearchRevision
    try {
      searchRevision = await getVisionSearchRevisionWithCatalogs()
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) }
    }
    const store = getVisionSearchExportStore()
    if (visionSearchExportHasOutputPathConflict(store, { taskId, outputPath })) return { success: false, message: copy.searchResultsFullExportOutputLocked }
    const task = store.create({ taskId, request, outputPath, partsDirectory: getVisionSearchExportPartsDirectory(app.getPath('userData'), taskId), searchRevision })
    startVisionSearchExportTask(task)
    return { success: true, message: copy.searchResultsFullExportQueued, taskId }
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_FULL_EXPORT_CANCEL, (_event, request: VisionSearchExportCancelRequest): boolean => {
    const taskId = typeof request?.taskId === 'string' ? request.taskId.trim() : ''
    if (!taskId) return false
    const controller = desktopState.visionSearchExportAbortControllers.get(taskId)
    if (!controller) return false
    controller.abort()
    return true
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_FULL_EXPORT_RETRY, (_event, request: VisionSearchExportRetryRequest): boolean => {
    const taskId = typeof request?.taskId === 'string' ? request.taskId.trim() : ''
    if (!taskId || desktopState.visionSearchExportAbortControllers.has(taskId)) return false
    const task = getVisionSearchExportStore().retry(taskId)
    return task ? startVisionSearchExportTask(task) : false
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_FULL_EXPORT_RECREATE, async (_event, request: VisionSearchExportRetryRequest): Promise<boolean> => {
    const taskId = typeof request?.taskId === 'string' ? request.taskId.trim() : ''
    if (!taskId || desktopState.visionSearchExportAbortControllers.has(taskId)) return false
    const store = getVisionSearchExportStore()
    const sourceTask = store.get(taskId)
    if (!sourceTask || (sourceTask.status !== 'failed' && sourceTask.status !== 'cancelled')) return false
    if (visionSearchExportHasOutputPathConflict(store, sourceTask)) return false
    let searchRevision: VisionSearchRevision
    try {
      searchRevision = await getVisionSearchRevisionWithCatalogs()
    } catch {
      return false
    }
    const task = createRecreatedVisionSearchExportTask(sourceTask, searchRevision)
    startVisionSearchExportTask(task)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_FULL_EXPORT_BATCH_RECREATE, async (_event, request: VisionSearchExportBatchRecreateRequest): Promise<VisionSearchExportBatchRecreateResult> => {
    const emptyResult: VisionSearchExportBatchRecreateResult = { createdCount: 0, skippedCount: 0, conflictCount: 0 }
    const taskIds = normalizeVisionSearchExportTaskIds(request?.taskIds)
    if (taskIds.length === 0) return emptyResult
    const store = getVisionSearchExportStore()
    const sourceTasks = taskIds
      .map((taskId) => store.get(taskId))
      .filter((task): task is VisionSearchExportTaskRecord => Boolean(task && (task.status === 'failed' || task.status === 'cancelled') && !desktopState.visionSearchExportAbortControllers.has(task.taskId)))
    if (sourceTasks.length === 0) return { ...emptyResult, skippedCount: taskIds.length }
    let searchRevision: VisionSearchRevision
    try {
      searchRevision = await getVisionSearchRevisionWithCatalogs()
    } catch {
      return { ...emptyResult, skippedCount: sourceTasks.length }
    }
    const result: VisionSearchExportBatchRecreateResult = { ...emptyResult, skippedCount: taskIds.length - sourceTasks.length }
    for (const sourceTask of sourceTasks) {
      if (visionSearchExportHasOutputPathConflict(store, sourceTask)) {
        result.skippedCount += 1
        result.conflictCount += 1
        continue
      }
      const task = createRecreatedVisionSearchExportTask(sourceTask, searchRevision)
      if (startVisionSearchExportTask(task)) result.createdCount += 1
      else result.skippedCount += 1
    }
    return result
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_RESULTS_EXPORT, async (_event, request: VisionSearchResultsExportRequest): Promise<VisionSearchResultsExportResult> => {
    if (!request || !isVisionSearchResultsExportFormat(request.format)) return { success: false, message: '导出参数无效' }
    const results = normalizeVisionSearchResultsForExport(request.results)
    if (results.length === 0) return { success: false, message: '没有可导出的搜索结果' }
    const copy = getAppCopy(getCurrentLocale()).vision
    const extension = request.format
    const defaultPath = join(app.getPath('documents'), `aivplayer-vision-results.${extension}`)
    const filePath = await promptForSavePath({
      title: copy.searchResultsExport,
      defaultPath,
      filters: [{ name: `${extension.toUpperCase()} files`, extensions: [extension] }]
    })
    if (!filePath) return { success: false, canceled: true, message: copy.searchResultsExportCanceled }
    const outputPath = filePath.toLowerCase().endsWith(`.${extension}`) ? filePath : `${filePath}.${extension}`
    try {
      await withVisionSearchExportOutputLock(outputPath, () => writeFile(outputPath, renderVisionSearchResultsExport(results, request.format), 'utf8'))
      return { success: true, filePath: outputPath, message: copy.searchResultsExported(results.length, outputPath) }
    } catch (error) {
      return { success: false, message: error instanceof VisionSearchExportOutputLockError ? copy.searchResultsExportOutputLocked : error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_SIMILAR, async (_event, request: VisionSimilarSearchRequest) => {
    return searchVisionSimilarResults(request)
  })

  ipcMain.handle(IPC_CHANNELS.VISION_EVIDENCE_SOURCES, (_event, value: VisionEvidenceSourceRequest = {}) => {
    if (!getVisionLibrary().visionPackStatus.available) return []
    const evidenceTypes = normalizeVisionDerivedEvidenceTypes(value?.evidenceTypes, true)
    const limit = typeof value?.limit === 'number' && Number.isFinite(value.limit) ? value.limit : undefined
    const offset = typeof value?.offset === 'number' && Number.isFinite(value.offset) ? value.offset : undefined
    return getVisionLibrary().listEvidenceSources(limit, offset, evidenceTypes)
  })
  ipcMain.handle(IPC_CHANNELS.VISION_EVIDENCE_AUDIT, async (_event, value: VisionEvidenceAuditRequest = {}): Promise<VisionEvidenceAuditPage> => {
    if (!getVisionLibrary().visionPackStatus.available) return { sources: [], offset: 0, limit: 0, hasMore: false }
    const evidenceTypes = normalizeVisionDerivedEvidenceTypes(value?.evidenceTypes, true)
    const auditStatuses = normalizeVisionEvidenceAuditStatuses(value?.auditStatuses, true)
    const limit = typeof value?.limit === 'number' && Number.isFinite(value.limit) ? value.limit : undefined
    const offset = typeof value?.offset === 'number' && Number.isFinite(value.offset) ? value.offset : undefined
    return getVisionLibrary().auditEvidenceSources(limit, offset, evidenceTypes, auditStatuses)
  })
  ipcMain.handle(IPC_CHANNELS.VISION_EVIDENCE_BATCH_CLEAR, async (_event, value: unknown): Promise<VisionEvidenceBatchClearResult> => {
    const rawTargets = value && typeof value === 'object' && !Array.isArray(value) ? (value as { targets?: unknown }).targets : undefined
    const targets = normalizeVisionEvidenceClearTargets(rawTargets)
    const emptyCounts = createEmptyVisionEvidenceCounts()
    if (targets.length === 0) return { success: false, message: '视觉证据清理列表为空', clearedSources: 0, clearedEvidenceCount: 0, clearedByType: emptyCounts }
    if (targets.length > 500) return { success: false, message: '一次最多清理 500 个来源', clearedSources: 0, clearedEvidenceCount: 0, clearedByType: emptyCounts }
    try {
      const result = await getVisionLibrary().clearEvidenceBatch(targets)
      return { success: true, message: result.clearedSources > 0 ? `已清理 ${result.clearedSources} 个来源、${result.clearedEvidenceCount} 条派生证据` : '没有可清理的派生证据', ...result }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), clearedSources: 0, clearedEvidenceCount: 0, clearedByType: emptyCounts }
    }
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SAVED_SEARCH_LIST, () => getVisionSavedSearchStore().list())
  ipcMain.handle(IPC_CHANNELS.VISION_SAVED_SEARCH_SAVE, (_event, input: VisionSavedSearchInput) => getVisionSavedSearchStore().save(input))
  ipcMain.handle(IPC_CHANNELS.VISION_SAVED_SEARCH_DELETE, (_event, id: string) => {
    if (typeof id !== 'string' || !id.trim()) return false
    return getVisionSavedSearchStore().delete(id)
  })
  ipcMain.handle(IPC_CHANNELS.VISION_SAVED_SEARCH_EXPORT, async () => {
    const copy = getAppCopy(getCurrentLocale()).vision
    const defaultPath = join(app.getPath('documents'), 'aivplayer-vision-searches.json')
    const filePath = await promptForSavePath({
      title: copy.savedSearchExport,
      defaultPath,
      filters: [{ name: 'JSON files', extensions: ['json'] }]
    })
    if (!filePath) return { success: false, canceled: true, message: '' }
    const outputPath = filePath.toLowerCase().endsWith('.json') ? filePath : `${filePath}.json`
    try {
      await writeFile(outputPath, `${JSON.stringify(getVisionSavedSearchStore().exportManifest(), null, 2)}\n`, 'utf8')
      return { success: true, filePath: outputPath, message: '' }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_SAVED_SEARCH_IMPORT, async () => {
    const copy = getAppCopy(getCurrentLocale()).vision
    const filePath = await promptForOpenPath({
      title: copy.savedSearchImport,
      filters: [{ name: 'JSON files', extensions: ['json'] }]
    })
    if (!filePath) return { success: false, canceled: true, message: '' }
    try {
      const manifest = JSON.parse(await readFile(filePath, 'utf8')) as unknown
      const result = getVisionSavedSearchStore().importManifest(manifest)
      await getVisionSavedSearchStore().flush()
      return { success: true, filePath, importedCount: result.importedCount, skippedCount: result.skippedCount, message: '' }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.VISION_LIST_SOURCES, (_event, request: VisionLibrarySourceRequest = {}) => {
    if (!getVisionLibrary().visionPackStatus.available) return []
    return listVisionSourcesWithMetadata(request)
  })

  ipcMain.handle(IPC_CHANNELS.VISION_ENTITY_CATALOG_GET, () => getVisionEntityCatalogStore().get())
  ipcMain.handle(IPC_CHANNELS.VISION_ENTITY_CATALOG_CREATE, (_event, input: VisionEntityCatalogCreateInput) => getVisionEntityCatalogStore().create(input))
  ipcMain.handle(IPC_CHANNELS.VISION_ENTITY_CATALOG_UPDATE, (_event, patch: VisionEntityCatalogPatch) => getVisionEntityCatalogStore().update(patch))
  ipcMain.handle(IPC_CHANNELS.VISION_ENTITY_CATALOG_BATCH_UPDATE, (_event, patch: VisionEntityCatalogBatchPatch) => getVisionEntityCatalogStore().updateBatch(patch))

  ipcMain.handle(IPC_CHANNELS.VISION_READ_THUMBNAIL, (_event, thumbnailPath: string) => getVisionLibrary().readThumbnail(thumbnailPath))
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_LIST, () => getClipInboxStore().listCollections())
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_SAVE, (_event, input: VisionClipCollectionInput) => getClipInboxStore().saveCollection(input))
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_DELETE, (_event, collectionId: string) => {
    if (typeof collectionId !== 'string' || !collectionId.trim()) return false
    return getClipInboxStore().deleteCollection(collectionId.trim())
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_DELETE, (_event, request: VisionClipCollectionBatchDeleteRequest) => {
    if (!request || !Array.isArray(request.collectionIds)) return { deletedIds: [], deletedCount: 0, skippedCount: 0 }
    return getClipInboxStore().deleteCollections(request.collectionIds)
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_RENAME, (_event, request: VisionClipCollectionRenameRequest) => {
    if (!request || typeof request.collectionId !== 'string' || typeof request.title !== 'string') return null
    return getClipInboxStore().renameCollection(request.collectionId, request.title)
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_RENAME, (_event, request: VisionClipCollectionBatchRenameRequest) => {
    const collectionIds = normalizeVisionClipCollectionIds(request?.collectionIds)
    const prefix = normalizeVisionClipCollectionRenamePart(request?.prefix)
    const suffix = normalizeVisionClipCollectionRenamePart(request?.suffix)
    if (collectionIds.length === 0) return { success: false, message: '没有选择要重命名的选段集合', collections: [], skippedCount: 0 }
    if (!prefix && !suffix) return { success: false, message: '批量重命名规则不能为空', collections: [], skippedCount: 0 }
    try {
      const result = getClipInboxStore().renameCollections(collectionIds, prefix, suffix)
      if (result.collections.length === 0) return { success: false, message: '选中的选段集合均不存在', collections: [], skippedCount: result.skippedCount }
      return { success: true, message: `已重命名 ${result.collections.length} 个选段集合${result.skippedCount > 0 ? `，跳过 ${result.skippedCount} 个` : ''}`, ...result }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), collections: [], skippedCount: 0 }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_TAGS, (_event, request: VisionClipCollectionBatchTagsRequest) => {
    const copy = getAppCopy(getCurrentLocale()).vision
    const collectionIds = normalizeVisionClipCollectionIds(request?.collectionIds)
    const tags = normalizeVisionCollectionTags(request?.tags)
    const mode = normalizeVisionCollectionTagsMode(request?.mode)
    if (collectionIds.length === 0) return { success: false, message: copy.collectionTagsBatchSelectionRequired, collections: [], skippedCount: 0 }
    try {
      const result = getClipInboxStore().updateCollectionsTags(collectionIds, tags, mode)
      if (result.collections.length === 0) return { success: false, message: copy.collectionTagsBatchUnavailable, collections: [], skippedCount: result.skippedCount }
      return { success: true, message: copy.collectionsTagsUpdated(result.collections.length, result.skippedCount, copy.collectionTagsBatchModeLabel[mode]), ...result }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), collections: [], skippedCount: 0 }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_FLAGS_UPDATE, (_event, request: VisionClipCollectionFlagUpdateRequest) => {
    const copy = getAppCopy(getCurrentLocale()).vision
    const collectionIds = normalizeVisionClipCollectionIds(request?.collectionIds)
    const isFavorite = typeof request?.isFavorite === 'boolean' ? request.isFavorite : undefined
    const isArchived = typeof request?.isArchived === 'boolean' ? request.isArchived : undefined
    if (collectionIds.length === 0 || (isFavorite === undefined && isArchived === undefined)) return { success: false, message: copy.collectionOperationUndoUnavailable, collections: [], skippedCount: collectionIds.length }
    try {
      const result = getClipInboxStore().updateCollectionFlags({ collectionIds, isFavorite, isArchived })
      if (result.collections.length === 0) return { success: false, message: copy.collectionOperationUndoUnavailable, ...result }
      const status = isFavorite !== undefined
        ? (isFavorite ? copy.collectionStatusFavorite : copy.collectionStatusUnfavorite)
        : (isArchived ? copy.collectionStatusArchived : copy.collectionStatusUnarchived)
      return { success: true, message: copy.collectionsStatusUpdated(result.collections.length, status), ...result }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), collections: [], skippedCount: 0 }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_CLEANUP, (_event, request: VisionClipCollectionTagCleanupRequest) => {
    const copy = getAppCopy(getCurrentLocale()).vision
    const tag = normalizeVisionCollectionTag(request?.tag)
    if (!tag) return { success: false, message: copy.collectionTagManagerSelectionRequired, tag: '', collections: [], updatedCount: 0 }
    try {
      const result = getClipInboxStore().removeTagFromAllCollections(tag)
      if (result.collections.length === 0) return { success: false, message: copy.collectionTagManagerUnavailable(tag), ...result, updatedCount: 0 }
      return { success: true, message: copy.collectionTagManagerUpdated(result.tag, result.collections.length), ...result, updatedCount: result.collections.length }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), tag, collections: [], updatedCount: 0 }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_RENAME, (_event, request: VisionClipCollectionTagRenameRequest) => {
    const copy = getAppCopy(getCurrentLocale()).vision
    const fromTag = normalizeVisionCollectionTag(request?.fromTag)
    const toTag = normalizeVisionCollectionTag(request?.toTag)
    if (!fromTag) return { success: false, message: copy.collectionTagManagerRenameSelectionRequired, fromTag: '', toTag, collections: [], updatedCount: 0 }
    if (!toTag) return { success: false, message: copy.collectionTagManagerRenameTargetRequired, fromTag, toTag: '', collections: [], updatedCount: 0 }
    if (fromTag === toTag) return { success: false, message: copy.collectionTagManagerRenameSameTag, fromTag, toTag, collections: [], updatedCount: 0 }
    try {
      const result = getClipInboxStore().renameTagAcrossCollections(fromTag, toTag)
      if (result.collections.length === 0) return { success: false, message: copy.collectionTagManagerRenameUnavailable(fromTag), ...result, updatedCount: 0 }
      return { success: true, message: copy.collectionTagManagerRenamed(result.fromTag, result.toTag, result.collections.length), ...result, updatedCount: result.collections.length }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), fromTag, toTag, collections: [], updatedCount: 0 }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_METADATA_LIST, () => getClipInboxStore().listTagMetadata())
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY, () => getClipInboxStore().getLastTagOperation())
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_LIST, () => getClipInboxStore().listTagOperationHistory())
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_PAGE, (_event, request: VisionClipCollectionTagOperationHistoryPageRequest) => getClipInboxStore().listTagOperationHistoryPage(request))
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_DETAIL, (_event, operationId: string) => getClipInboxStore().getTagOperationHistoryDetail(operationId))
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_OPERATION_REDO_HISTORY, () => getClipInboxStore().getLastTagRedoOperation())
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_OPERATION_UNDO, () => {
    const copy = getAppCopy(getCurrentLocale()).vision
    try {
      const result = getClipInboxStore().undoLastTagOperation()
      if (!result.success) return { ...result, message: copy.collectionTagManagerUndoUnavailable }
      return { ...result, message: copy.collectionTagManagerUndoSuccess }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), operation: null, collections: [], metadata: [] }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_OPERATION_REDO, () => {
    const copy = getAppCopy(getCurrentLocale()).vision
    try {
      const result = getClipInboxStore().redoLastTagOperation()
      if (!result.success) return { ...result, message: copy.collectionTagManagerRedoUnavailable }
      return { ...result, message: copy.collectionTagManagerRedoSuccess }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), operation: null, collections: [], metadata: [] }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_OPERATION_HISTORY, () => getClipInboxStore().getLastCollectionOperation())
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_OPERATION_REDO_HISTORY, () => getClipInboxStore().getLastCollectionRedoOperation())
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_OPERATION_UNDO, () => {
    const copy = getAppCopy(getCurrentLocale()).vision
    try {
      const result = getClipInboxStore().undoLastCollectionOperation()
      if (!result.success) return { ...result, message: copy.collectionOperationUndoUnavailable }
      return { ...result, message: copy.collectionOperationUndoSuccess }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), operation: null, collections: [] }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_OPERATION_REDO, () => {
    const copy = getAppCopy(getCurrentLocale()).vision
    try {
      const result = getClipInboxStore().redoLastCollectionOperation()
      if (!result.success) return { ...result, message: copy.collectionOperationRedoUnavailable }
      return { ...result, message: copy.collectionOperationRedoSuccess }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), operation: null, collections: [] }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_METADATA_UPDATE, (_event, request: VisionClipCollectionTagMetadataUpdateRequest) => {
    const copy = getAppCopy(getCurrentLocale()).vision
    const tag = normalizeVisionCollectionTag(request?.tag)
    if (!tag) return { success: false, message: copy.collectionTagManagerMetadataTagRequired, metadata: null }
    if (request?.parentTag !== undefined && normalizeVisionCollectionTag(request.parentTag) === tag) return { success: false, message: copy.collectionTagManagerMetadataSelfParent, metadata: null }
    if (request?.parentTag !== undefined && wouldCreateVisionCollectionTagParentCycle(tag, request.parentTag, getClipInboxStore().listTagMetadata())) return { success: false, message: copy.collectionTagManagerMetadataCycle, metadata: null }
    if (request?.color !== undefined && typeof request.color === 'string' && request.color.trim() && !normalizeVisionCollectionTagColor(request.color)) return { success: false, message: copy.collectionTagManagerMetadataColorInvalid, metadata: null }
    if (request?.textColor !== undefined && typeof request.textColor === 'string' && request.textColor.trim() && !normalizeVisionCollectionTagColor(request.textColor)) return { success: false, message: copy.collectionTagManagerMetadataColorInvalid, metadata: null }
    try {
      const metadata = getClipInboxStore().saveTagMetadata(request)
      return { success: true, message: copy.collectionTagManagerMetadataUpdated(tag), metadata }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), metadata: null }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_METADATA_EXPORT, async () => {
    const copy = getAppCopy(getCurrentLocale()).vision
    const metadata = getClipInboxStore().listTagMetadata()
    if (metadata.length === 0) return { success: false, message: copy.collectionTagManagerMetadataExportEmpty, exportedCount: 0 }
    const defaultPath = join(app.getPath('documents'), 'aivplayer-clip-tag-metadata.json')
    const filePath = await promptForSavePath({
      title: copy.collectionTagManagerMetadataExport,
      defaultPath,
      filters: [{ name: 'AIVPlayer tag metadata JSON', extensions: ['json'] }]
    })
    if (!filePath) return { success: false, canceled: true, message: '' }
    const outputPath = filePath.toLowerCase().endsWith('.json') ? filePath : `${filePath}.json`
    try {
      await writeFile(outputPath, renderVisionClipCollectionTagMetadataExport(metadata), 'utf8')
      return { success: true, filePath: outputPath, exportedCount: metadata.length, message: copy.collectionTagManagerMetadataExported(metadata.length) }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), exportedCount: 0 }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_METADATA_IMPORT, async () => {
    const copy = getAppCopy(getCurrentLocale()).vision
    const filePath = await promptForOpenPath({
      title: copy.collectionTagManagerMetadataImport,
      filters: [{ name: 'AIVPlayer tag metadata JSON', extensions: ['json'] }]
    })
    if (!filePath) return { success: false, canceled: true, message: '' }
    try {
      const metadata = parseVisionClipCollectionTagMetadataImportText(await readFile(filePath, 'utf8'))
      const store = getClipInboxStore()
      const usedTags = new Set(store.listCollections().flatMap((collection) => collection.tags))
      const preview = createVisionClipCollectionTagMetadataImportPreview(metadata, store.listTagMetadata(), usedTags)
      const conflictCount = preview.filter((item) => item.state === 'conflict').length
      const newCount = preview.filter((item) => item.state === 'new').length
      const unusedCount = preview.filter((item) => item.state === 'unused').length
      return { success: true, filePath, metadata, preview, message: copy.collectionTagManagerMetadataImportPreviewDescription(conflictCount, newCount, unusedCount) }
    } catch (error) {
      return { success: false, filePath, message: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_METADATA_IMPORT_APPLY, (_event, request: VisionClipCollectionTagMetadataImportApplyRequest) => {
    const copy = getAppCopy(getCurrentLocale()).vision
    try {
      const metadata = parseVisionClipCollectionTagMetadataImport({ exportVersion: 1, metadata: request?.metadata })
      const decisions = request?.decisions ?? {}
      const selected = filterVisionClipCollectionTagMetadataImport(metadata, decisions)
      const result = getClipInboxStore().importTagMetadata(selected)
      const decisionSkipped = metadata.filter((item) => decisions[item.tag] === 'keep-local' || decisions[item.tag] === 'skip').length
      const skippedCount = result.skippedCount + decisionSkipped
      return { success: true, importedCount: result.importedCount, skippedCount, message: copy.collectionTagManagerMetadataImported(result.importedCount, skippedCount) }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), importedCount: 0, skippedCount: 0 }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_DUPLICATE, (_event, collectionId: string) => {
    if (typeof collectionId !== 'string' || !collectionId.trim()) return null
    return getClipInboxStore().duplicateCollection(collectionId.trim())
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_DUPLICATE, (_event, request: VisionClipCollectionBatchDuplicateRequest) => {
    if (!request || !Array.isArray(request.collectionIds)) return { collections: [], skippedCount: 0 }
    return getClipInboxStore().duplicateCollections(request.collectionIds)
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_MERGE, (_event, request: VisionClipCollectionBatchMergeRequest) => {
    const collectionIds = normalizeVisionClipCollectionIds(request?.collectionIds)
    if (collectionIds.length < 2) return { success: false, message: '批量合并至少需要选择两个选段集合', collection: null, sourceIds: [], skippedCount: collectionIds.length }
    try {
      const result = getClipInboxStore().mergeCollections(collectionIds, request?.title, request?.sortMode, request?.selectedSelections)
      return { success: true, message: `已将 ${result.sourceIds.length} 个选段集合合并为“${result.collection.title}”，原集合已保留`, ...result }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), collection: null, sourceIds: [], skippedCount: 0 }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_EXPORT, async (_event, request: VisionClipCollectionExportRequest) => {
    if (!request || typeof request.collectionId !== 'string' || !request.collectionId.trim() || !isVisionClipCollectionExportFormat(request.format)) {
      return { success: false, message: '导出参数无效' }
    }
    const collection = getClipInboxStore().getCollection(request.collectionId.trim())
    if (!collection) return { success: false, message: '选段集合不存在' }
    const extension = request.format
    const defaultPath = join(app.getPath('documents'), `${safeExportTitle(collection.title)}.${extension}`)
    const filePath = await promptForSavePath({
      title: `导出选段集合 · ${collection.title}`,
      defaultPath,
      filters: [{ name: `${extension.toUpperCase()} files`, extensions: [extension] }]
    })
    if (!filePath) return { success: false, canceled: true, message: '已取消导出' }
    const outputPath = filePath.toLowerCase().endsWith(`.${extension}`) ? filePath : `${filePath}.${extension}`
    try {
      await writeFile(outputPath, renderVisionClipCollectionExport(collection, request.format), 'utf8')
      return { success: true, filePath: outputPath, message: `已导出 ${outputPath}` }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_EXPORT, async (_event, request: VisionClipCollectionBatchExportRequest) => {
    const collectionIds = normalizeVisionClipCollectionIds(request?.collectionIds)
    if (collectionIds.length === 0) return { success: false, message: '没有选择要导出的选段集合' }
    const collections = collectionIds.map((collectionId) => getClipInboxStore().getCollection(collectionId)).filter((collection): collection is NonNullable<typeof collection> => collection !== null)
    const skippedCount = collectionIds.length - collections.length
    if (collections.length === 0) return { success: false, message: '选中的选段集合均不存在', skippedCount }
    const defaultPath = join(app.getPath('documents'), 'aivplayer-clip-collections.json')
    const filePath = await promptForSavePath({
      title: '导出选中的选段集合',
      defaultPath,
      filters: [{ name: 'AIVPlayer clip collections JSON', extensions: ['json'] }]
    })
    if (!filePath) return { success: false, canceled: true, message: '已取消导出', exportedCount: 0, skippedCount }
    const outputPath = filePath.toLowerCase().endsWith('.json') ? filePath : `${filePath}.json`
    try {
      await writeFile(outputPath, renderVisionClipCollectionsExport(collections), 'utf8')
      return { success: true, filePath: outputPath, message: `已导出 ${collections.length} 个选段集合`, exportedCount: collections.length, skippedCount }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), exportedCount: 0, skippedCount }
    }
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_IMPORT, async () => {
    const copy = getAppCopy(getCurrentLocale()).vision
    const filePath = await promptForOpenPath({
      title: copy.collectionImport,
      filters: [{ name: 'AIVPlayer clip collection JSON', extensions: ['json'] }]
    })
    if (!filePath) return { success: false, canceled: true, message: copy.collectionImportCanceled }
    try {
      const text = await readFile(filePath, 'utf8')
      const parsed = JSON.parse(text) as unknown
      if (parsed && typeof parsed === 'object' && 'exportVersion' in parsed && parsed.exportVersion === 2) {
        const collections = parseVisionClipCollectionsImport(parsed).map((input) => getClipInboxStore().importCollection(input))
        return { success: true, filePath, collections, message: copy.collectionsImported(collections.length) }
      }
       const input = parseVisionClipCollectionImportText(text)
      const collection = getClipInboxStore().importCollection(input)
      return { success: true, filePath, collection, collections: [collection], message: copy.collectionImported(collection.title) }
    } catch (error) {
      return { success: false, filePath, message: error instanceof Error ? error.message : String(error) }
    }
  })
}
