import { Archive, CheckSquare, Copy, Database, Download, FilePlus, ImageUp, ScanSearch, Search, Square, Trash2, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { VisionIndexProgress, VisionRuntimeStatus, VisionSearchResult } from '../../../shared/media-types'
import type { AsrSubtitleResult } from '../../../shared/media-types'
import type { MediaEvidenceDraftImportResult } from '../../../shared/evidence-task-types'
import type { VisionClipCollection, VisionClipCollectionExportFormat, VisionClipCollectionSortMode, VisionEvidenceType, VisionIndexFailureRecord, VisionLibrarySource, VisionModelDownloadProgress, VisionSavedSearch, VisionSearchFullExportRequest, VisionSearchPageRequest, VisionSearchResultPage, VisionSearchResultsExportFormat, VisionSearchSortMode } from '../../../shared/vision-types'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionObjectDetectionFilterState, VisionObjectDetectionResult } from '../../../shared/vision-object-detection-types'
import { invertVisionClipSelections, mergeVisionCollectionSelections, normalizeVisionCollectionTags } from '../../../core/ai/clip-inbox-operations'
import { createVisionClipSelections, normalizeVisionTimeRange } from '../../../core/ai/vision-evidence'
import { getVisionSearchResultIds } from '../../../core/ai/vision-search-selection'
import { getNextVisionSearchLimit, shouldLoadMoreVisionSearchResults, VISION_SEARCH_PAGE_SIZE } from '../../../core/ai/vision-search-pagination'
import { createVisionSimilarSearchRequest } from '../../../core/ai/vision-similar-search'
import { createDefaultVisionSearchPreferences, parseVisionSearchPreferences, serializeVisionSearchPreferences, VISION_SEARCH_PREFERENCES_STORAGE_KEY, type VisionSearchPreferences } from '../../../core/ai/vision-search-preferences'
import { useAppContext } from './app-context'
import { useVisionLibraryFolder } from './use-vision-library-folder'
import { VisionLibraryFolder } from './vision-library-folder'
import { VisionOcrTask } from './vision-ocr-task'
import { VisionTtsTask } from './vision-tts-task'
import { VisionSearchResults } from './vision-search-results'
import { VisionObjectDetectionResultView } from './vision-object-detection-result'
import { useVisionImportInbox } from './use-vision-import-inbox'
import { VisionImportInbox } from './vision-import-inbox'
import { VisionLibrarySources } from './vision-library-sources'
import { VisionEntityCatalog } from './vision-entity-catalog'
import { VisionIndexFailures } from './vision-index-failures'
import { VisionSpeakerDiarization } from './vision-speaker-diarization'
import { VisionEvidenceSources } from './vision-evidence-sources'
import type { VisionEntityCatalog as VisionEntityCatalogState, VisionEntityCatalogBatchPatch, VisionEntityCatalogCreateInput, VisionEntityCatalogPatch } from '../../../shared/vision-entity-types'

const VISION_SOURCE_PAGE_SIZE = 100
const VISION_EVIDENCE_TYPE_OPTIONS: readonly VisionEvidenceType[] = ['visual', 'subtitle', 'ocr', 'scene', 'entity', 'object', 'speaker']

type VisionSearchBaseContext =
  | { kind: 'text'; query: string; mode: VisionSavedSearch['mode']; evidenceTypes: VisionEvidenceType[]; objectDetectionFilter?: VisionObjectDetectionFilterState }
  | { kind: 'image'; imagePath: string; evidenceTypes: VisionEvidenceType[]; objectDetectionFilter?: VisionObjectDetectionFilterState }

type VisionSearchContext = VisionSearchBaseContext | { kind: 'similar'; target: VisionSearchResult }

type VisionSearchSnapshot = {
  results: VisionSearchResult[]
  limit: number
  hasMore: boolean
  cursor: string | null
  context: VisionSearchBaseContext | null
  selectedIds: Set<string>
}

function readVisionSearchPreferences(): VisionSearchPreferences {
  if (typeof window === 'undefined') return createDefaultVisionSearchPreferences()
  try {
    return parseVisionSearchPreferences(window.localStorage.getItem(VISION_SEARCH_PREFERENCES_STORAGE_KEY))
  } catch {
    return createDefaultVisionSearchPreferences()
  }
}

function writeVisionSearchPreferences(preferences: VisionSearchPreferences): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(VISION_SEARCH_PREFERENCES_STORAGE_KEY, serializeVisionSearchPreferences(preferences))
  } catch {
    // Renderer storage can be disabled or full; the in-memory preference remains authoritative.
  }
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.max(1, Math.round(milliseconds))}ms`
  const seconds = milliseconds / 1000
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
}

function createDefaultVisionObjectDetectionFilter(): VisionObjectDetectionFilterState {
  return { labelQuery: '', minimumScore: 0, categoryLabels: [] }
}

function hasVisionObjectDetectionFilter(filter: VisionObjectDetectionFilterState): boolean {
  return Boolean(filter.labelQuery.trim() || filter.minimumScore > 0 || filter.categoryLabels.length > 0)
}

function formatSavedSearchObjectFilter(filter: VisionSavedSearch['objectDetectionFilter'], copy: LocaleCopy['vision']): string {
  if (!filter) return ''
  const parts: string[] = []
  if (filter.labelQuery) parts.push(`${copy.objectDetectionLabelFilter}: ${filter.labelQuery}`)
  if (filter.categoryLabels.length > 0) parts.push(`${copy.objectDetectionCategories}: ${filter.categoryLabels.join(', ')}`)
  if (filter.minimumScore > 0) parts.push(`${copy.objectDetectionMinimumScore}: ${Math.round(filter.minimumScore * 100)}%`)
  return parts.join(' · ')
}

type CollectionAvailability = { missingPaths: number; availablePaths: number }

export function VisionPanel(): React.ReactElement {
  const app = useAppContext()
  const [status, setStatus] = useState<VisionRuntimeStatus | null>(null)
  const [modelDownloadProgress, setModelDownloadProgress] = useState<VisionModelDownloadProgress | null>(null)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [isDownloadingPack, setIsDownloadingPack] = useState(false)
  const [progress, setProgress] = useState<VisionIndexProgress | null>(null)
  const [query, setQuery] = useState('')
  const [searchPreferences, setSearchPreferences] = useState<VisionSearchPreferences>(readVisionSearchPreferences)
  const [savedSearchName, setSavedSearchName] = useState('')
  const [savedSearches, setSavedSearches] = useState<VisionSavedSearch[]>([])
  const [savedSearchTransferStatus, setSavedSearchTransferStatus] = useState<string | null>(null)
  const [searchExportStatus, setSearchExportStatus] = useState<string | null>(null)
  const [sampleImagePath, setSampleImagePath] = useState<string | null>(null)
  const [sampleImageName, setSampleImageName] = useState<string | null>(null)
  const [includeSceneEvidence, setIncludeSceneEvidence] = useState(false)
  const [includeEntityEvidence, setIncludeEntityEvidence] = useState(false)
  const [includeObjectEvidence, setIncludeObjectEvidence] = useState(false)
  const [results, setResults] = useState<VisionSearchResult[]>([])
  const [searchResultLimit, setSearchResultLimit] = useState(VISION_SEARCH_PAGE_SIZE)
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false)
  const [searchCursor, setSearchCursor] = useState<string | null>(null)
  const [isLoadingMoreSearchResults, setIsLoadingMoreSearchResults] = useState(false)
  const [searchContext, setSearchContext] = useState<VisionSearchContext | null>(null)
  const [similarSearchSnapshot, setSimilarSearchSnapshot] = useState<VisionSearchSnapshot | null>(null)
  const [sources, setSources] = useState<VisionLibrarySource[]>([])
  const [hasMoreSources, setHasMoreSources] = useState(false)
  const [isLoadingMoreSources, setIsLoadingMoreSources] = useState(false)
  const [failures, setFailures] = useState<VisionIndexFailureRecord[]>([])
  const [entityCatalog, setEntityCatalog] = useState<VisionEntityCatalogState | null>(null)
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set())
  const [collectionTitle, setCollectionTitle] = useState('')
  const [collectionTags, setCollectionTags] = useState('')
  const [collections, setCollections] = useState<VisionClipCollection[]>([])
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set())
  const [collectionTransferStatus, setCollectionTransferStatus] = useState<string | null>(null)
  const [collectionAvailability, setCollectionAvailability] = useState<Record<string, CollectionAvailability>>({})
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})
  const [sourceThumbnailUrls, setSourceThumbnailUrls] = useState<Record<string, string>>({})
  const [isSearching, setIsSearching] = useState(false)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [repairingCollectionId, setRepairingCollectionId] = useState<string | null>(null)
  const [duplicatingCollectionId, setDuplicatingCollectionId] = useState<string | null>(null)
  const [isDuplicatingCollections, setIsDuplicatingCollections] = useState(false)
  const [isExportingCollections, setIsExportingCollections] = useState(false)
  const [pendingResultSeek, setPendingResultSeek] = useState<{ videoPath: string; seconds: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [objectDetectionResult, setObjectDetectionResult] = useState<VisionObjectDetectionResult | null>(null)
  const [objectDetectionFilter, setObjectDetectionFilter] = useState<VisionObjectDetectionFilterState>(createDefaultVisionObjectDetectionFilter)
  const [objectDetectionThumbnailUrl, setObjectDetectionThumbnailUrl] = useState<string | null>(null)
  const [isDetectingObjects, setIsDetectingObjects] = useState(false)
  const evidenceTypeFilter = searchPreferences.evidenceTypes
  const searchSortMode = searchPreferences.sortMode
  const isIndexing = progress?.status === 'loading' || progress?.status === 'indexing'
  const folder = useVisionLibraryFolder(app, isIndexing, { onError: setError })
  const importInbox = useVisionImportInbox(app)
  const isBusy = folder.isBusy
  const allCollectionsSelected = collections.length > 0 && collections.every((collection) => selectedCollectionIds.has(collection.id))
  const isCollectionBatchBusy = isDuplicatingCollections || isExportingCollections || duplicatingCollectionId !== null
  const vectorIndexLabel = status?.vectorIndexType
    ? app.copy.vision.vectorIndex(status.vectorIndexType, status.vectorIndexDistanceType ?? '—', status.vectorIndexIndexedRows, status.vectorIndexUnindexedRows)
    : app.copy.vision.exactVectorSearch

  useEffect(() => { writeVisionSearchPreferences(searchPreferences) }, [searchPreferences])

  const refreshFailures = (): void => { void window.aiv.listVisionIndexFailures().then(setFailures).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))) }
  const refreshSavedSearches = (): void => { void window.aiv.listVisionSavedSearches().then(setSavedSearches).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))) }

  useEffect(() => {
    let active = true
    const refreshStatus = (): void => { void window.aiv.getVisionStatus().then((next) => {
      if (active) setStatus(next)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    }) }
    const refreshSources = (): void => { void window.aiv.listVisionSources({ limit: VISION_SOURCE_PAGE_SIZE, offset: 0 }).then((next) => {
      if (active) {
        setSources(next)
        setHasMoreSources(next.length === VISION_SOURCE_PAGE_SIZE)
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    }) }
    const refreshEntityCatalog = (): void => { void window.aiv.getVisionEntityCatalog().then((next) => {
      if (active) setEntityCatalog(next)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    }) }
    refreshStatus()
    refreshSources()
    refreshEntityCatalog()
    refreshFailures()
    refreshSavedSearches()
    const statusTimer = window.setInterval(refreshStatus, 5000)
    const removeProgressListener = window.aiv.onVisionIndexProgress((next) => {
      if (!active) return
      setProgress(next)
      if (next.status === 'completed' || next.status === 'cancelled' || next.status === 'error') {
        refreshStatus()
        refreshSources()
      }
    })
    const removeModelDownloadListener = window.aiv.onVisionModelDownloadProgress((next) => {
      if (active) setModelDownloadProgress(next)
    })
    const removeInboxPipelineListener = window.aiv.onMediaImportInboxPipelineProgress((next) => {
      if (active && next.stage === 'vision' && (next.status === 'ready' || next.status === 'failed')) refreshSources()
    })
    return () => {
      active = false
      window.clearInterval(statusTimer)
      removeProgressListener()
      removeModelDownloadListener()
      removeInboxPipelineListener()
    }
  }, [])

  useEffect(() => {
    setSelectedCollectionIds((current) => {
      const availableIds = new Set(collections.map((collection) => collection.id))
      const next = new Set([...current].filter((id) => availableIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [collections])

  const downloadVisionModel = async (): Promise<void> => {
    if (isDownloadingModel) return
    setError(null)
    setIsDownloadingModel(true)
    try {
      const result = await window.aiv.downloadVisionModel()
      setStatus(result.status)
      if (!result.success) throw new Error(result.message)
      setModelDownloadProgress(null)
    } catch (reason) {
      setError(app.copy.vision.modelDownloadFailed(reason instanceof Error ? reason.message : String(reason)))
    } finally {
      setIsDownloadingModel(false)
    }
  }

  const downloadVisionPack = async (): Promise<void> => {
    if (isDownloadingPack) return
    setError(null)
    setIsDownloadingPack(true)
    try {
      const result = await window.aiv.downloadVisionPack()
      setStatus(result.status)
      if (!result.success) throw new Error(result.message)
      window.location.reload()
    } catch (reason) {
      setError(app.copy.vision.visionPackDownloadFailed(reason instanceof Error ? reason.message : String(reason)))
    } finally {
      setIsDownloadingPack(false)
    }
  }

  const ensureVisionReady = async (): Promise<boolean> => {
    try {
      const nextStatus = await window.aiv.getVisionStatus()
      setStatus(nextStatus)
      if (!nextStatus.packAvailable) {
        setError(app.copy.vision.visionPackRequired)
        return false
      }
      if (!nextStatus.available) {
        setError(app.copy.vision.visionModelRequired)
        return false
      }
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return false
    }
  }

  const loadMoreSources = async (): Promise<void> => {
    if (isLoadingMoreSources || !hasMoreSources) return
    setIsLoadingMoreSources(true)
    try {
      const next = await window.aiv.listVisionSources({ limit: VISION_SOURCE_PAGE_SIZE, offset: sources.length })
      setSources((current) => {
        const seen = new Set(current.map((source) => source.sourceId))
        return [...current, ...next.filter((source) => !seen.has(source.sourceId))]
      })
      setHasMoreSources(next.length === VISION_SOURCE_PAGE_SIZE)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsLoadingMoreSources(false)
    }
  }

  const retryVisionFailure = async (failure: VisionIndexFailureRecord): Promise<void> => {
    setError(null)
    try {
      const accepted = await window.aiv.retryVisionIndexFailure({ id: failure.id })
      if (!accepted) throw new Error(app.copy.vision.indexFailureRetryUnavailable)
      refreshFailures()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const retryVisionFailures = async (selectedFailures: VisionIndexFailureRecord[]): Promise<void> => {
    setError(null)
    try {
      const accepted = await window.aiv.retryVisionIndexFailures({ ids: selectedFailures.map((failure) => failure.id) })
      if (!accepted) throw new Error(app.copy.vision.indexFailureRetryUnavailable)
      refreshFailures()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      throw reason
    }
  }

  const updateEntityCatalog = async (patch: VisionEntityCatalogPatch): Promise<void> => {
    setError(null)
    try {
      setEntityCatalog(await window.aiv.updateVisionEntityCatalog(patch))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      throw reason
    }
  }

  const updateEntityCatalogBatch = async (patch: VisionEntityCatalogBatchPatch): Promise<void> => {
    setError(null)
    try {
      setEntityCatalog(await window.aiv.updateVisionEntityCatalogBatch(patch))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      throw reason
    }
  }

  const createEntityCatalog = async (input: VisionEntityCatalogCreateInput): Promise<void> => {
    setError(null)
    try {
      setEntityCatalog(await window.aiv.createVisionEntityCatalog(input))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      throw reason
    }
  }

  useEffect(() => {
    let active = true
    if (collections.length === 0) {
      setCollectionAvailability({})
      return () => { active = false }
    }
    void Promise.all(collections.map(async (collection) => {
      const paths = [...new Set(collection.selections.map((selection) => selection.videoPath))]
      const availability = await Promise.all(paths.map(async (path) => {
        try {
          return await window.aiv.isMediaFileAvailable(path)
        } catch {
          return false
        }
      }))
      return [collection.id, { availablePaths: availability.filter(Boolean).length, missingPaths: availability.filter((available) => !available).length }] as const
    })).then((entries) => {
      if (active) setCollectionAvailability(Object.fromEntries(entries))
    })
    return () => { active = false }
  }, [collections])

  useEffect(() => {
    let active = true
    void window.aiv.listVisionClipCollections().then((nextCollections) => {
      if (active) setCollections(nextCollections)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void Promise.all(results.map(async (result) => {
      try {
        return [result.id, await window.aiv.readVisionThumbnail(result.thumbnailPath)] as const
      } catch {
        return [result.id, ''] as const
      }
    })).then((entries) => {
      if (active) setThumbnailUrls(Object.fromEntries(entries))
    })
    return () => { active = false }
  }, [results])

  useEffect(() => {
    let active = true
    void Promise.all(sources.map(async (source) => {
      if (!source.thumbnailPath) return [source.sourceId, ''] as const
      try {
        return [source.sourceId, await window.aiv.readVisionThumbnail(source.thumbnailPath)] as const
      } catch {
        return [source.sourceId, ''] as const
      }
    })).then((entries) => {
      if (active) setSourceThumbnailUrls(Object.fromEntries(entries))
    })
    return () => { active = false }
  }, [sources])

  useEffect(() => {
    if (!pendingResultSeek || app.state.currentFile?.path !== pendingResultSeek.videoPath) return
    const video = app.videoRef.current
    if (!video) return
    let cancelled = false
    const seekWhenReady = (): void => {
      if (cancelled) return
      app.seekTo(pendingResultSeek.seconds)
      setPendingResultSeek(null)
    }
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seekWhenReady()
    else video.addEventListener('loadedmetadata', seekWhenReady, { once: true })
    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', seekWhenReady)
    }
  }, [app.seekTo, app.state.currentFile?.path, app.videoRef, pendingResultSeek])

  const startIndex = async (): Promise<void> => {
    if (app.state.playlist.length === 0 || isBusy) return
    if (!(await ensureVisionReady())) return
    setError(null)
    setProgress(null)
    void window.aiv.startVisionIndex({ mediaPaths: app.state.playlist.map((file) => file.path), intervalSeconds: 3, includeSceneEvidence, includeEntityEvidence, includeObjectEvidence }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  const startFolderIndex = async (): Promise<void> => {
    if (folder.videoPaths.length === 0 || isBusy) return
    if (!(await ensureVisionReady())) return
    setError(null)
    setProgress(null)
    void window.aiv.startVisionIndex({ mediaPaths: folder.videoPaths, intervalSeconds: 3, includeSceneEvidence, includeEntityEvidence, includeObjectEvidence }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  const cancelCurrentTask = (): void => {
    if (folder.isScanning) void window.aiv.cancelVisionDirectoryScan()
    else void window.aiv.cancelVisionIndex()
  }

  const requestVisionSearch = (context: VisionSearchContext, limit: number, cursor?: string): Promise<VisionSearchResultPage> => {
    const pageOptions = cursor ? { cursor } : {}
    if (context.kind === 'similar') {
      const request: VisionSearchPageRequest = { kind: 'similar', request: createVisionSimilarSearchRequest(context.target, limit), ...pageOptions }
      return window.aiv.searchVisionPage(request)
    }
    if (context.kind === 'text') {
      const request: VisionSearchPageRequest = { kind: 'text', request: { query: context.query, limit, mode: context.mode, ...(context.evidenceTypes.length > 0 ? { evidenceTypes: context.evidenceTypes } : {}), ...(context.objectDetectionFilter ? { objectDetectionFilter: context.objectDetectionFilter } : {}) }, ...pageOptions }
      return window.aiv.searchVisionPage(request)
    }
    const request: VisionSearchPageRequest = { kind: 'image', request: { imagePath: context.imagePath, limit, ...(context.evidenceTypes.length > 0 ? { evidenceTypes: context.evidenceTypes } : {}), ...(context.objectDetectionFilter ? { objectDetectionFilter: context.objectDetectionFilter } : {}) }, ...pageOptions }
    return window.aiv.searchVisionPage(request)
  }

  const applyVisionSearchResults = (page: VisionSearchResultPage, context: VisionSearchContext, preserveSelection: boolean): void => {
    setResults(page.results)
    setSearchResultLimit(page.limit)
    setHasMoreSearchResults(page.hasMore && shouldLoadMoreVisionSearchResults(page.results.length, page.limit))
    setSearchCursor(page.cursor ?? null)
    setSearchContext(context)
    if (context.kind !== 'similar') setSimilarSearchSnapshot(null)
    if (!preserveSelection) setSelectedResultIds(new Set())
  }

  const executeTextSearch = async (searchQuery: string, mode: VisionSavedSearch['mode'], filter = evidenceTypeFilter, objectFilter: VisionObjectDetectionFilterState | undefined = objectDetectionFilter): Promise<void> => {
    if (!searchQuery.trim() || isSearching) return
    if (!(await ensureVisionReady())) return
    const context: VisionSearchContext = { kind: 'text', query: searchQuery, mode, evidenceTypes: [...filter], ...(objectFilter && hasVisionObjectDetectionFilter(objectFilter) ? { objectDetectionFilter: { ...objectFilter, categoryLabels: [...objectFilter.categoryLabels] } } : {}) }
    setIsSearching(true)
    setError(null)
    void requestVisionSearch(context, VISION_SEARCH_PAGE_SIZE).then((page) => {
      applyVisionSearchResults(page, context, false)
    }).catch((reason: unknown) => {
      setResults([])
      setSearchContext(null)
      setSearchCursor(null)
      setHasMoreSearchResults(false)
      setSimilarSearchSnapshot(null)
      setSelectedResultIds(new Set())
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => setIsSearching(false))
  }

  const runTextSearch = (): void => { setObjectDetectionFilter(createDefaultVisionObjectDetectionFilter()); void executeTextSearch(query, 'hybrid', evidenceTypeFilter, undefined) }

  const runSavedSearch = (savedSearch: VisionSavedSearch): void => {
    const filter = savedSearch.evidenceTypes ?? []
    setQuery(savedSearch.query)
    setObjectDetectionFilter(savedSearch.objectDetectionFilter ? { ...savedSearch.objectDetectionFilter, categoryLabels: [...savedSearch.objectDetectionFilter.categoryLabels] } : createDefaultVisionObjectDetectionFilter())
    setSearchPreferences((current) => ({ ...current, evidenceTypes: filter }))
    void executeTextSearch(savedSearch.query, savedSearch.mode, filter, savedSearch.objectDetectionFilter)
  }

  const saveCurrentSearch = (): void => {
    const name = savedSearchName.trim()
    if (!name || !query.trim()) return
    setError(null)
    const input = { name, query, mode: 'hybrid' as const, evidenceTypes: evidenceTypeFilter, ...(hasVisionObjectDetectionFilter(objectDetectionFilter) ? { objectDetectionFilter: { ...objectDetectionFilter, categoryLabels: [...objectDetectionFilter.categoryLabels] } } : {}) }
    void window.aiv.saveVisionSavedSearch(input).then((savedSearch) => {
      setSavedSearches((current) => [savedSearch, ...current.filter((item) => item.id !== savedSearch.id)])
      setSavedSearchName('')
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const exportSearchResults = (format: VisionSearchResultsExportFormat): void => {
    const exportResults = selectedResultIds.size > 0 ? results.filter((result) => selectedResultIds.has(result.id)) : results
    if (exportResults.length === 0) return
    setError(null)
    setSearchExportStatus(null)
    void window.aiv.exportVisionSearchResults({ results: exportResults, format }).then((result) => {
      if (result.canceled) return
      if (!result.success) {
        setError(result.message)
        return
      }
      setSearchExportStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const exportAllSearchResults = (format: VisionSearchResultsExportFormat): void => {
    if (!searchContext || isSearching) return
    const request: VisionSearchFullExportRequest = searchContext.kind === 'similar'
      ? { kind: 'similar', request: createVisionSimilarSearchRequest(searchContext.target, VISION_SEARCH_PAGE_SIZE), format }
      : searchContext.kind === 'text'
        ? { kind: 'text', request: { query: searchContext.query, mode: searchContext.mode, evidenceTypes: searchContext.evidenceTypes, ...(searchContext.objectDetectionFilter ? { objectDetectionFilter: searchContext.objectDetectionFilter } : {}) }, format }
        : { kind: 'image', request: { imagePath: searchContext.imagePath, evidenceTypes: searchContext.evidenceTypes, ...(searchContext.objectDetectionFilter ? { objectDetectionFilter: searchContext.objectDetectionFilter } : {}) }, format }
    setError(null)
    setSearchExportStatus(null)
    void window.aiv.exportVisionSearchResultsFull(request).then((result) => {
      if (result.canceled) return
      if (!result.success) {
        setError(result.message)
        return
      }
      setSearchExportStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const deleteSavedSearch = (savedSearch: VisionSavedSearch): void => {
    void window.aiv.deleteVisionSavedSearch(savedSearch.id).then((deleted) => {
      if (deleted) setSavedSearches((current) => current.filter((item) => item.id !== savedSearch.id))
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const exportSavedSearches = (): void => {
    setError(null)
    setSavedSearchTransferStatus(null)
    void window.aiv.exportVisionSavedSearches().then((result) => {
      if (result.canceled) return
      if (!result.success) {
        setError(result.message)
        return
      }
      setSavedSearchTransferStatus(app.copy.vision.savedSearchExported)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const importSavedSearches = (): void => {
    setError(null)
    setSavedSearchTransferStatus(null)
    void window.aiv.importVisionSavedSearches().then((result) => {
      if (result.canceled) return
      if (!result.success) {
        setError(result.message)
        return
      }
      refreshSavedSearches()
      setSavedSearchTransferStatus(app.copy.vision.savedSearchImported(result.importedCount ?? 0, result.skippedCount ?? 0))
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const runImageSearch = async (): Promise<void> => {
    if (!sampleImagePath || isSearching) return
    if (!(await ensureVisionReady())) return
    const context: VisionSearchContext = { kind: 'image', imagePath: sampleImagePath, evidenceTypes: [...evidenceTypeFilter], ...(hasVisionObjectDetectionFilter(objectDetectionFilter) ? { objectDetectionFilter: { ...objectDetectionFilter, categoryLabels: [...objectDetectionFilter.categoryLabels] } } : {}) }
    setIsSearching(true)
    setError(null)
    void requestVisionSearch(context, VISION_SEARCH_PAGE_SIZE).then((page) => {
      applyVisionSearchResults(page, context, false)
    }).catch((reason: unknown) => {
      setResults([])
      setSearchContext(null)
      setSearchCursor(null)
      setHasMoreSearchResults(false)
      setSimilarSearchSnapshot(null)
      setSelectedResultIds(new Set())
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => setIsSearching(false))
  }

  const loadMoreSearchResults = (): void => {
    if (!searchContext || !searchCursor || isSearching || isLoadingMoreSearchResults || !hasMoreSearchResults) return
    const nextLimit = getNextVisionSearchLimit(searchResultLimit)
    if (nextLimit <= searchResultLimit) return
    setIsLoadingMoreSearchResults(true)
    setError(null)
    void requestVisionSearch(searchContext, nextLimit, searchCursor).then((page) => {
      applyVisionSearchResults(page, searchContext, true)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsLoadingMoreSearchResults(false))
  }

  const findSimilarResult = async (result: VisionSearchResult): Promise<void> => {
    if (isSearching) return
    if (!(await ensureVisionReady())) return
    if (!similarSearchSnapshot) {
      setSimilarSearchSnapshot({
        results: [...results],
        limit: searchResultLimit,
        hasMore: hasMoreSearchResults,
        cursor: searchCursor,
        context: searchContext?.kind === 'similar' ? null : searchContext,
        selectedIds: new Set(selectedResultIds)
      })
    }
    setIsSearching(true)
    setError(null)
    const context: VisionSearchContext = { kind: 'similar', target: result }
    void requestVisionSearch(context, VISION_SEARCH_PAGE_SIZE).then((page) => {
      applyVisionSearchResults(page, context, false)
      setSelectedResultIds(new Set())
    }).catch((reason: unknown) => {
      setResults([])
      setSearchResultLimit(VISION_SEARCH_PAGE_SIZE)
      setSearchCursor(null)
      setHasMoreSearchResults(false)
      setSearchContext(context)
      setSelectedResultIds(new Set())
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => setIsSearching(false))
  }

  const returnToSearchResults = (): void => {
    if (!similarSearchSnapshot) return
    setResults(similarSearchSnapshot.results)
    setSearchResultLimit(similarSearchSnapshot.limit)
    setHasMoreSearchResults(similarSearchSnapshot.hasMore)
    setSearchCursor(similarSearchSnapshot.cursor)
    setSearchContext(similarSearchSnapshot.context)
    setSelectedResultIds(new Set(similarSearchSnapshot.selectedIds))
    setSimilarSearchSnapshot(null)
  }

  const changeEvidenceTypeFilter = (nextFilter: VisionEvidenceType[]): void => {
    setSearchPreferences((current) => ({ ...current, evidenceTypes: nextFilter }))
    if (query.trim() && !isSearching) void executeTextSearch(query, 'hybrid', nextFilter)
  }

  const toggleEvidenceTypeFilter = (evidenceType: VisionEvidenceType): void => {
    const selected = new Set(evidenceTypeFilter)
    if (selected.has(evidenceType)) selected.delete(evidenceType)
    else selected.add(evidenceType)
    changeEvidenceTypeFilter(VISION_EVIDENCE_TYPE_OPTIONS.filter((option) => selected.has(option)))
  }

  const clearEvidenceTypeFilter = (): void => { changeEvidenceTypeFilter([]) }

  const changeSearchSortMode = (sortMode: VisionSearchSortMode): void => {
    setSearchPreferences((current) => ({ ...current, sortMode }))
  }

  const formatEvidenceTypeFilter = (filter: readonly VisionEvidenceType[]): string => filter.length === 0
    ? app.copy.vision.evidenceFilterAll
    : filter.map((evidenceType) => app.copy.vision.evidenceFilterOptions[evidenceType]).join(' + ')

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    const filePath = window.aiv.getPathForFile(file)
    setSampleImagePath(filePath || null)
    setSampleImageName(file.name)
    setError(null)
  }

  const openResult = (result: VisionSearchResult): void => {
    void app.createMediaFilesFromPaths([result.videoPath]).then((files) => {
      if (files.length === 0) return
      app.loadFiles(files)
      setPendingResultSeek({ videoPath: result.videoPath, seconds: result.timestampSeconds })
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const detectObjects = async (result: VisionSearchResult): Promise<void> => {
    if (!result.thumbnailPath || isDetectingObjects) return
    if (!(await ensureVisionReady())) return
    setIsDetectingObjects(true)
    setObjectDetectionResult(null)
    setObjectDetectionThumbnailUrl(thumbnailUrls[result.id] ?? null)
    setError(null)
    if (!thumbnailUrls[result.id]) {
      void window.aiv.readVisionThumbnail(result.thumbnailPath).then(setObjectDetectionThumbnailUrl).catch(() => undefined)
    }
    void window.aiv.runVisionObjectDetection({ imagePath: result.thumbnailPath }).then((response) => {
      if (!response.success || !response.result) {
        setError(response.message)
        return
      }
      setObjectDetectionResult(response.result)
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => setIsDetectingObjects(false))
  }

  const openSource = (source: VisionLibrarySource): void => {
    openResult({
      id: source.sourceId,
      videoPath: source.videoPath,
      fileName: source.fileName,
      timestampSeconds: 0,
      thumbnailPath: source.thumbnailPath ?? '',
      score: 1,
      modelId: 'indexed-library',
      modelVariant: 'source'
    })
  }

  const toggleResultSelection = (result: VisionSearchResult): void => {
    setSelectedResultIds((current) => {
      const next = new Set(current)
      if (next.has(result.id)) next.delete(result.id)
      else next.add(result.id)
      return next
    })
  }

  const selectAllSearchResults = (): void => {
    setSelectedResultIds((current) => new Set([...current, ...getVisionSearchResultIds(results)]))
  }

  const clearSearchResultSelection = (): void => {
    const resultIds = new Set(getVisionSearchResultIds(results))
    setSelectedResultIds((current) => new Set([...current].filter((id) => !resultIds.has(id))))
  }

  const createProjectFromSelection = (): void => {
    const selectedResults = results.filter((result) => selectedResultIds.has(result.id))
    if (selectedResults.length === 0 || isCreatingProject) return
    setIsCreatingProject(true)
    setError(null)
    void app.createEditingProjectFromVisionResults(selectedResults).finally(() => {
      setIsCreatingProject(false)
    })
  }

  const handleImportedSubtitle = (result: MediaEvidenceDraftImportResult): void => {
    if (!result.success || !result.subtitlePath || !result.subtitleUrl) return
    const subtitleResult: AsrSubtitleResult = {
      success: true,
      message: result.message,
      subtitlePath: result.subtitlePath,
      subtitleSrtPath: result.subtitleSrtPath,
      subtitleUrl: result.subtitleUrl,
      subtitleSrtUrl: result.subtitleSrtUrl,
      subtitleRevision: result.subtitleRevision ?? Date.now()
    }
    app.setActiveSubtitle(subtitleResult)
    app.setSubtitleResult(subtitleResult)
    app.setTranslatedSubtitleResult(null)
  }

  const saveSelectedCollection = (): void => {
    const selectedResults = results.filter((result) => selectedResultIds.has(result.id))
    const selections = createVisionClipSelections(selectedResults)
    const title = collectionTitle.trim()
    if (!title || selections.length === 0) return
    void window.aiv.saveVisionClipCollection({ title, tags: normalizeVisionCollectionTags(collectionTags), sortMode: 'source-time', selections }).then((collection) => {
      setCollections((current) => [collection, ...current.filter((item) => item.id !== collection.id)])
      setCollectionTitle('')
      setCollectionTags('')
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const updateCollection = async (collection: VisionClipCollection, patch: Partial<Pick<VisionClipCollection, 'tags' | 'sortMode' | 'selections'>>): Promise<VisionClipCollection | null> => {
    setError(null)
    try {
      const updated = await window.aiv.saveVisionClipCollection({
        id: collection.id,
        title: collection.title,
        tags: patch.tags ?? collection.tags,
        sortMode: patch.sortMode ?? collection.sortMode,
        selections: patch.selections ?? collection.selections
      })
      setCollections((current) => [updated, ...current.filter((item) => item.id !== updated.id)])
      return updated
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return null
    }
  }

  const mergeCollection = (collection: VisionClipCollection): void => {
    updateCollection(collection, { selections: mergeVisionCollectionSelections(collection.selections) })
  }

  const invertCollection = (collection: VisionClipCollection): void => {
    const selections = invertVisionClipSelections(collection.selections)
    if (selections.length === 0) {
      setError('集合没有可反选的时间范围')
      return
    }
    updateCollection(collection, { selections })
  }

  const sortCollection = (collection: VisionClipCollection, sortMode: VisionClipCollectionSortMode): void => {
    updateCollection(collection, { sortMode })
  }

  const exportCollection = (collection: VisionClipCollection, format: VisionClipCollectionExportFormat): void => {
    setError(null)
    void window.aiv.exportVisionClipCollection({ collectionId: collection.id, format }).then((result) => {
      if (!result.success && !result.canceled) setError(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const importCollection = (): void => {
    setError(null)
    setCollectionTransferStatus(null)
    void window.aiv.importVisionClipCollection().then((result) => {
      if (result.canceled) return
      const importedCollections = result.collections ?? (result.collection ? [result.collection] : [])
      if (!result.success || importedCollections.length === 0) {
        setError(result.message)
        return
      }
      setCollections((current) => [...importedCollections, ...current.filter((item) => !importedCollections.some((imported) => imported.id === item.id))])
      setCollectionTransferStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const duplicateCollection = async (collection: VisionClipCollection): Promise<void> => {
    if (duplicatingCollectionId) return
    setDuplicatingCollectionId(collection.id)
    setError(null)
    try {
      const duplicate = await window.aiv.duplicateVisionClipCollection(collection.id)
      if (!duplicate) {
        setError(app.copy.vision.collectionDuplicateUnavailable)
        return
      }
      setCollections((current) => [duplicate, ...current.filter((item) => item.id !== duplicate.id)])
      setCollectionTransferStatus(app.copy.vision.collectionDuplicated(duplicate.title))
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setDuplicatingCollectionId(null)
    }
  }

  const toggleCollectionSelection = (collectionId: string): void => {
    setSelectedCollectionIds((current) => {
      const next = new Set(current)
      if (next.has(collectionId)) next.delete(collectionId)
      else next.add(collectionId)
      return next
    })
  }

  const toggleAllCollectionSelection = (): void => {
    setSelectedCollectionIds(allCollectionsSelected ? new Set() : new Set(collections.map((collection) => collection.id)))
  }

  const duplicateSelectedCollections = async (): Promise<void> => {
    if (isCollectionBatchBusy || selectedCollectionIds.size === 0) return
    setIsDuplicatingCollections(true)
    setError(null)
    try {
      const result = await window.aiv.duplicateVisionClipCollections({ collectionIds: [...selectedCollectionIds] })
      setCollections((current) => [...result.collections, ...current.filter((item) => !result.collections.some((duplicate) => duplicate.id === item.id))])
      setSelectedCollectionIds(new Set())
      setCollectionTransferStatus(app.copy.vision.collectionsDuplicated(result.collections.length, result.skippedCount))
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsDuplicatingCollections(false)
    }
  }

  const exportSelectedCollections = (): void => {
    if (isCollectionBatchBusy || selectedCollectionIds.size === 0) return
    setIsExportingCollections(true)
    setError(null)
    void window.aiv.exportVisionClipCollections({ collectionIds: [...selectedCollectionIds] }).then((result) => {
      if (!result.success && !result.canceled) setError(result.message)
      if (result.success) setCollectionTransferStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsExportingCollections(false))
  }

  const repairCollection = async (collection: VisionClipCollection): Promise<void> => {
    if (repairingCollectionId) return
    setRepairingCollectionId(collection.id)
    setError(null)
    try {
      const paths = [...new Set(collection.selections.map((selection) => selection.videoPath))]
      const availability = await Promise.all(paths.map(async (path) => [path, await window.aiv.isMediaFileAvailable(path).catch(() => false)] as const))
      const missingPaths = new Set(availability.filter(([, available]) => !available).map(([path]) => path))
      if (missingPaths.size === 0) return
      const replacements = await window.aiv.openMediaFiles()
      if (replacements.length === 0) return
      const usedReplacementPaths = new Set<string>()
      const replacementByMissingPath = new Map<string, typeof replacements[number]>()
      for (const selection of collection.selections.filter((item) => missingPaths.has(item.videoPath))) {
        if (replacementByMissingPath.has(selection.videoPath)) continue
        const candidate = replacements.find((file) => !usedReplacementPaths.has(file.path) && file.name.toLocaleLowerCase() === selection.fileName.toLocaleLowerCase())
          ?? (missingPaths.size === 1 && replacements.length === 1 ? replacements[0] : undefined)
        if (!candidate) throw new Error(app.copy.vision.collectionRepairNoMatch(selection.fileName))
        usedReplacementPaths.add(candidate.path)
        replacementByMissingPath.set(selection.videoPath, candidate)
      }
      const repairedSelections = await Promise.all(collection.selections.map(async (selection) => {
        const replacement = replacementByMissingPath.get(selection.videoPath)
        if (!replacement) return selection
        const [mediaFile, metadata] = await Promise.all([window.aiv.createMediaFile(replacement.path), window.aiv.getMediaMetadata(replacement.path)])
        const durationSeconds = metadata?.durationSeconds && metadata.durationSeconds > 0 ? metadata.durationSeconds : selection.durationSeconds
        const range = normalizeVisionTimeRange(selection, durationSeconds)
        if (!range) throw new Error(app.copy.vision.collectionRepairTooShort(replacement.name))
        return {
          ...selection,
          sourceId: `source-${mediaFile.id}`,
          videoPath: mediaFile.path,
          fileName: mediaFile.name,
          fingerprint: mediaFile.fingerprint ?? `${mediaFile.path}:${durationSeconds}`,
          durationSeconds,
          width: metadata?.video?.width ?? selection.width,
          height: metadata?.video?.height ?? selection.height,
          startSeconds: range.startSeconds,
          endSeconds: range.endSeconds
        }
      }))
      await updateCollection(collection, { selections: repairedSelections })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRepairingCollectionId(null)
    }
  }

  const createProjectFromCollection = (collection: VisionClipCollection): void => {
    setError(null)
    void app.createEditingProjectFromVisionCollection(collection)
  }

  const deleteCollection = (collection: VisionClipCollection): void => {
    void window.aiv.deleteVisionClipCollection(collection.id).then((deleted) => {
      if (deleted) setCollections((current) => current.filter((item) => item.id !== collection.id))
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const progressLabel = progress?.stage === 'planning'
    ? app.copy.vision.planning
    : progress?.stage === 'loading-model'
      ? app.copy.vision.loading
      : progress?.stage === 'frames'
        ? app.copy.vision.indexing(progress.processedFrames, progress.totalFrames, progress.currentVideoIndex, progress.totalVideos)
        : progress?.stage === 'scene-evidence'
          ? app.copy.vision.sceneAnalyzing(progress.sceneEvidenceProcessed ?? 0, progress.sceneEvidenceTotal ?? 0)
        : progress?.stage === 'entity-evidence'
          ? app.copy.vision.entityAnalyzing(progress.entityEvidenceProcessed ?? 0, progress.entityEvidenceTotal ?? 0)
        : progress?.stage === 'object-evidence'
          ? app.copy.vision.objectAnalyzing(progress.objectEvidenceProcessed ?? 0, progress.objectEvidenceTotal ?? 0)
        : progress?.stage === 'vector-index'
          ? app.copy.vision.vectorIndexing
          : progress?.stage === 'text-index'
            ? app.copy.vision.textIndexing
            : progress?.stage === 'completed'
              ? progress.skippedVideos > 0 || progress.captionOnlyVideos > 0
                ? app.copy.vision.completedIncremental(progress.processedFrames, progress.skippedVideos, progress.captionOnlyVideos)
                : app.copy.vision.completed(progress.processedFrames)
              : progress?.stage === 'cancelled'
                ? app.copy.vision.cancelled
                : progress?.stage === 'error'
                  ? progress.message ?? app.copy.vision.indexFailed
                  : status?.indexedFrameCount
                    ? app.copy.vision.indexReady(status.indexedFrameCount)
                    : null
  const timingLabel = progress?.timings && (progress.stage === 'completed' || progress.stage === 'cancelled' || progress.stage === 'error')
    ? app.copy.vision.timings(
      formatDuration(progress.timings.planningMs),
      formatDuration(progress.timings.modelLoadingMs),
      formatDuration(progress.timings.framesMs),
      formatDuration(progress.timings.sceneEvidenceMs),
      formatDuration(progress.timings.entityEvidenceMs),
      formatDuration(progress.timings.objectEvidenceMs),
      formatDuration(progress.timings.vectorIndexMs),
      formatDuration(progress.timings.textIndexMs),
      formatDuration(progress.timings.totalMs)
    )
    : null

  return <div className="vision-panel">
    <section className="vision-card vision-intro">
      <div className="vision-heading"><div><span className="panel-kicker">{app.copy.panels.visionKicker}</span><h2>{app.copy.panels.visionTitle}</h2></div><ScanSearch size={18} /></div>
      <p>{app.copy.vision.description}</p>
      <div className="vision-model-status"><Database size={14} /><span>{status?.available ? app.copy.vision.model : app.copy.vision.unavailable}</span><small title={vectorIndexLabel}>{status?.indexedFrameCount ?? 0} · {vectorIndexLabel}</small></div>
      {status && !status.packAvailable ? <div className="vision-model-download"><div><strong>{app.copy.vision.visionPackRequired}</strong><small>{app.copy.vision.visionPackDescription}</small></div><button className="vision-primary-action" type="button" onClick={downloadVisionPack} disabled={isDownloadingPack || status.packDownloadable === false}><Download size={14} />{isDownloadingPack ? app.copy.vision.downloadingVisionPack : `${app.copy.vision.downloadVisionPack}（${status.packVersion}）`}</button></div> : null}
      {status?.packAvailable && !status.available ? <div className="vision-model-download"><div><strong>{app.copy.vision.visionModelRequired}</strong><small>{app.copy.vision.visionModelDescription}</small></div><button className="vision-primary-action" type="button" onClick={downloadVisionModel} disabled={isDownloadingModel || status.downloadable === false}><Download size={14} />{isDownloadingModel ? app.copy.vision.downloadingModel : app.copy.vision.downloadModel}</button>{modelDownloadProgress?.status === 'downloading' ? <small>{app.copy.vision.modelDownloadProgress(modelDownloadProgress.relativePath, modelDownloadProgress.percent == null ? 0 : Math.round(modelDownloadProgress.percent * 100))}</small> : null}</div> : null}
      <VisionLibraryFolder copy={app.copy.vision} folderPath={folder.folderPath} savedFolders={folder.savedFolders} videoPaths={folder.videoPaths} includeSubfolders={folder.includeSubfolders} scanProgress={folder.scanProgress} batchScanProgress={folder.batchScanProgress} isBusy={isBusy} onChooseFolder={folder.chooseFolder} onScanFolder={folder.scanCurrentFolder} onScanAllFolders={folder.scanAllFolders} onIncludeSubfoldersChange={folder.setIncludeSubfolders} onStartIndex={startFolderIndex} onUseFolder={folder.useSavedFolder} onRemoveFolder={folder.removeSavedFolder} />
      <VisionImportInbox copy={app.copy.vision} directories={importInbox.directories} items={importInbox.items} progress={importInbox.progress} pipelineProgress={importInbox.pipelineProgress} isBusy={importInbox.isBusy} error={importInbox.error} writeSidecars={importInbox.writeSidecars} onAddFolder={importInbox.addFolder} onRemoveFolder={importInbox.removeFolder} onScan={importInbox.scan} onQueue={importInbox.queueItem} onIgnore={importInbox.ignoreItem} onRetry={importInbox.retryItem} onBatchQueue={importInbox.batchQueue} onBatchIgnore={importInbox.batchIgnore} onBatchRetry={importInbox.batchRetry} onBatchClear={importInbox.batchClear} onWriteSidecarsChange={importInbox.setWriteSidecars} onUpdateMetadata={importInbox.updateMetadata} />
      <VisionLibrarySources copy={app.copy.vision} sources={sources} thumbnailUrls={sourceThumbnailUrls} hasMoreSources={hasMoreSources} isLoadingMoreSources={isLoadingMoreSources} onLoadMore={loadMoreSources} onOpenSource={openSource} />
      <VisionEntityCatalog copy={app.copy.vision} catalog={entityCatalog} onCreate={createEntityCatalog} onUpdate={updateEntityCatalog} onBatchUpdate={updateEntityCatalogBatch} />
      <VisionIndexFailures copy={app.copy.vision} failures={failures} onRetry={retryVisionFailure} onBatchRetry={retryVisionFailures} />
      <div className="vision-index-actions">
        <label className="vision-folder-option"><input type="checkbox" checked={includeSceneEvidence} disabled={isBusy} onChange={(event) => setIncludeSceneEvidence(event.target.checked)} /><span>{app.copy.vision.includeSceneEvidence}</span></label>
        <label className="vision-folder-option"><input type="checkbox" checked={includeEntityEvidence} disabled={isBusy} onChange={(event) => setIncludeEntityEvidence(event.target.checked)} /><span>{app.copy.vision.includeEntityEvidence}</span></label>
        <label className="vision-folder-option"><input type="checkbox" checked={includeObjectEvidence} disabled={isBusy} onChange={(event) => setIncludeObjectEvidence(event.target.checked)} /><span>{app.copy.vision.includeObjectEvidence}</span></label>
        <button className="vision-primary-action" type="button" onClick={startIndex} disabled={isBusy || app.state.playlist.length === 0}><Database size={15} />{app.copy.vision.indexPlaylist}</button>
        {isBusy ? <button className="vision-secondary-action" type="button" onClick={cancelCurrentTask}><Square size={13} />{app.copy.vision.cancelIndex}</button> : null}
      </div>
      {progressLabel ? <div className="vision-progress" role="status"><span>{progressLabel}</span><span title={timingLabel ?? undefined}>{timingLabel ?? (progress?.currentVideoPath ? progress.currentVideoPath.split(/[\\/]/).pop() : '')}</span></div> : null}
    </section>

    <VisionOcrTask copy={app.copy.vision} mediaPath={app.state.currentFile?.path ?? null} currentTime={app.state.currentTime} />
    <VisionTtsTask copy={app.copy.vision} mediaPath={app.state.currentFile?.path ?? null} currentTime={app.state.currentTime} onSubtitleImported={handleImportedSubtitle} />
    <VisionSpeakerDiarization copy={app.copy.vision} mediaPath={app.state.currentFile?.path ?? null} onSeek={app.seekTo} />
    <VisionEvidenceSources copy={app.copy.vision} kicker={app.copy.panels.visionKicker} />

    <section className="vision-card vision-search-card">
      <form className="vision-text-search" onSubmit={(event) => { event.preventDefault(); runTextSearch() }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={app.copy.vision.textPlaceholder} aria-label={app.copy.vision.textPlaceholder} />
        <button className="vision-search-button" type="submit" disabled={!query.trim() || isSearching}><Search size={15} />{app.copy.vision.hybridSearch}</button>
      </form>
      <div className="vision-evidence-filter" role="group" aria-label={app.copy.vision.evidenceFilterLabel}>
        <span>{app.copy.vision.evidenceFilterLabel}</span>
        <div className="vision-evidence-filter-options">
          <label className="vision-evidence-filter-option"><input type="checkbox" checked={evidenceTypeFilter.length === 0} onChange={clearEvidenceTypeFilter} /><span>{app.copy.vision.evidenceFilterAll}</span></label>
          {VISION_EVIDENCE_TYPE_OPTIONS.map((evidenceType) => <label className="vision-evidence-filter-option" key={evidenceType}><input type="checkbox" checked={evidenceTypeFilter.includes(evidenceType)} onChange={() => toggleEvidenceTypeFilter(evidenceType)} /><span>{app.copy.vision.evidenceFilterOptions[evidenceType]}</span></label>)}
        </div>
      </div>
      <div className="vision-saved-search-toolbar">
        <input className="vision-saved-search-name-input" value={savedSearchName} onChange={(event) => setSavedSearchName(event.target.value)} placeholder={app.copy.vision.savedSearchNamePlaceholder} aria-label={app.copy.vision.savedSearchNamePlaceholder} />
        <button className="vision-secondary-action" type="button" onClick={saveCurrentSearch} disabled={!query.trim() || !savedSearchName.trim()}>{app.copy.vision.saveSearch}</button>
      </div>
      <div className="vision-saved-searches" aria-label={app.copy.vision.savedSearches}>
        <div className="vision-saved-search-heading-row">
          <strong className="vision-saved-search-heading">{app.copy.vision.savedSearches}</strong>
          <div className="vision-saved-search-actions">
            <button className="vision-secondary-action" type="button" onClick={importSavedSearches}><Upload size={12} />{app.copy.vision.savedSearchImport}</button>
            <button className="vision-secondary-action" type="button" onClick={exportSavedSearches} disabled={savedSearches.length === 0}><Download size={12} />{app.copy.vision.savedSearchExport}</button>
          </div>
        </div>
        {savedSearches.length > 0 ? <div className="vision-saved-search-list">{savedSearches.map((savedSearch) => <div className="vision-saved-search" key={savedSearch.id}>
          <button className="vision-saved-search-button" type="button" onClick={() => runSavedSearch(savedSearch)} disabled={isSearching}>
            <strong>{savedSearch.name}</strong>
            <small>{savedSearch.query} · {formatEvidenceTypeFilter(savedSearch.evidenceTypes ?? [])}{formatSavedSearchObjectFilter(savedSearch.objectDetectionFilter, app.copy.vision) ? ` · ${formatSavedSearchObjectFilter(savedSearch.objectDetectionFilter, app.copy.vision)}` : ''}</small>
          </button>
          <button className="vision-saved-search-delete" type="button" onClick={() => deleteSavedSearch(savedSearch)} title={app.copy.vision.deleteSavedSearch} aria-label={`${app.copy.vision.deleteSavedSearch}: ${savedSearch.name}`}><Trash2 size={14} /></button>
        </div>)}</div> : <small className="vision-saved-search-empty">{app.copy.vision.savedSearchEmpty}</small>}
        {savedSearchTransferStatus ? <small className="vision-saved-search-status" role="status">{savedSearchTransferStatus}</small> : null}
      </div>
      <div className="vision-image-search">
        <label className="vision-file-picker"><ImageUp size={15} /><span>{sampleImageName ?? app.copy.vision.chooseImage}</span><input type="file" accept="image/*" onChange={handleImageChange} /></label>
        <button className="vision-search-button" type="button" onClick={runImageSearch} disabled={!sampleImagePath || isSearching}><Search size={15} />{app.copy.vision.searchImage}</button>
      </div>
      {selectedResultIds.size > 0 ? <div className="vision-selection-actions"><span>{app.copy.vision.selectedResults(selectedResultIds.size)}</span><input className="vision-collection-title-input" value={collectionTitle} onChange={(event) => setCollectionTitle(event.target.value)} placeholder={app.copy.vision.collectionTitlePlaceholder} aria-label={app.copy.vision.collectionTitlePlaceholder} /><input className="vision-collection-title-input" value={collectionTags} onChange={(event) => setCollectionTags(event.target.value)} placeholder={app.copy.vision.collectionTagsPlaceholder} aria-label={app.copy.vision.collectionTagsPlaceholder} /><button className="vision-secondary-action" type="button" onClick={saveSelectedCollection} disabled={!collectionTitle.trim()}><Archive size={14} />{app.copy.vision.saveCollection}</button><button className="vision-primary-action" type="button" onClick={createProjectFromSelection} disabled={isCreatingProject}><FilePlus size={14} />{isCreatingProject ? app.copy.vision.creatingProject : app.copy.vision.createProject}</button></div> : null}
    </section>

    {error ? <div className="vision-error vision-error-card" role="alert">{error}</div> : null}
    <VisionSearchResults copy={app.copy.vision} results={results} thumbnailUrls={thumbnailUrls} onOpenResult={openResult} onFindSimilar={findSimilarResult} onDetectObjects={detectObjects} isDetectingObjects={isDetectingObjects} isSimilarSearch={searchContext?.kind === 'similar'} onReturnToSearch={returnToSearchResults} selectedIds={selectedResultIds} onToggleSelection={toggleResultSelection} onSelectAllResults={selectAllSearchResults} onClearResults={clearSearchResultSelection} hasMoreResults={hasMoreSearchResults} isLoadingMore={isLoadingMoreSearchResults} onLoadMoreResults={loadMoreSearchResults} onExportResults={exportSearchResults} onExportAllResults={exportAllSearchResults} canExportAllResults={searchContext !== null && results.length > 0} sortMode={searchSortMode} onSortModeChange={changeSearchSortMode} />
    {searchExportStatus ? <small className="vision-saved-search-status vision-search-export-status" role="status">{searchExportStatus}</small> : null}
    {objectDetectionResult ? <VisionObjectDetectionResultView copy={app.copy.vision} result={objectDetectionResult} thumbnailUrl={objectDetectionThumbnailUrl} filter={objectDetectionFilter} onFilterChange={setObjectDetectionFilter} onClear={() => { setObjectDetectionResult(null); setObjectDetectionThumbnailUrl(null) }} /> : null}
    <section className="vision-card vision-collections"><div className="vision-collections-heading"><strong>{app.copy.vision.savedCollections}</strong><div className="vision-collection-transfer-actions">{collections.length > 0 ? <button className="vision-secondary-action" type="button" onClick={toggleAllCollectionSelection} disabled={isCollectionBatchBusy}>{allCollectionsSelected ? <Square size={12} /> : <CheckSquare size={12} />}{allCollectionsSelected ? app.copy.vision.collectionClearSelection : app.copy.vision.collectionSelectAll}</button> : null}<button className="vision-secondary-action" type="button" onClick={importCollection} disabled={isCollectionBatchBusy}><Upload size={12} />{app.copy.vision.collectionImport}</button><Archive size={15} /></div></div>{selectedCollectionIds.size > 0 ? <div className="vision-collection-batch-actions"><span>{app.copy.vision.selectedCollections(selectedCollectionIds.size)}</span><button className="vision-primary-action" type="button" onClick={() => void duplicateSelectedCollections()} disabled={isCollectionBatchBusy}><Copy size={13} />{app.copy.vision.duplicateSelectedCollections}</button><button className="vision-secondary-action" type="button" onClick={exportSelectedCollections} disabled={isCollectionBatchBusy}><Download size={12} />{app.copy.vision.exportSelectedCollections}</button></div> : null}{collections.length > 0 ? collections.map((collection) => {
      const availability = collectionAvailability[collection.id]
      const isRepairing = repairingCollectionId === collection.id
      return <article className="vision-collection" key={collection.id}><div className="vision-collection-heading"><input type="checkbox" checked={selectedCollectionIds.has(collection.id)} onChange={() => toggleCollectionSelection(collection.id)} disabled={isCollectionBatchBusy} aria-label={app.copy.vision.selectCollection(collection.title)} /><div className="vision-collection-copy"><strong>{collection.title}</strong><span>{app.copy.vision.selectedResults(collection.selections.length)} · {collection.sortMode === 'duration-desc' ? app.copy.vision.collectionSortDuration : collection.sortMode === 'file-name' ? app.copy.vision.collectionSortFileName : app.copy.vision.collectionSortSourceTime}</span>{collection.tags.length > 0 ? <small>{collection.tags.join(' · ')}</small> : null}{availability?.missingPaths ? <small className="vision-collection-missing">{app.copy.vision.collectionMissingSources(availability.missingPaths)}</small> : null}</div></div><div className="vision-collection-actions"><select className="vision-collection-sort" value={collection.sortMode} aria-label={app.copy.vision.collectionSortLabel} onChange={(event) => sortCollection(collection, event.target.value as VisionClipCollectionSortMode)}><option value="source-time">{app.copy.vision.collectionSortSourceTime}</option><option value="duration-desc">{app.copy.vision.collectionSortDuration}</option><option value="file-name">{app.copy.vision.collectionSortFileName}</option></select>{availability?.missingPaths ? <button className="vision-secondary-action" type="button" onClick={() => void repairCollection(collection)} disabled={isRepairing}>{isRepairing ? app.copy.vision.repairingCollectionSources : app.copy.vision.repairCollectionSources}</button> : null}<button className="vision-secondary-action" type="button" onClick={() => mergeCollection(collection)}>{app.copy.vision.collectionMerge}</button><button className="vision-secondary-action" type="button" onClick={() => invertCollection(collection)}>{app.copy.vision.collectionInvert}</button><button className="vision-secondary-action" type="button" onClick={() => exportCollection(collection, 'json')}>{app.copy.vision.exportJson}</button><button className="vision-secondary-action" type="button" onClick={() => exportCollection(collection, 'csv')}>{app.copy.vision.exportCsv}</button><button className="vision-secondary-action" type="button" onClick={() => exportCollection(collection, 'edl')}>{app.copy.vision.exportEdl}</button><button className="vision-secondary-action" type="button" onClick={() => void duplicateCollection(collection)} disabled={isCollectionBatchBusy} title={app.copy.vision.duplicateCollection}><Copy size={13} />{app.copy.vision.duplicateCollection}</button><button className="vision-primary-action" type="button" onClick={() => createProjectFromCollection(collection)} title={app.copy.vision.openCollection}><FilePlus size={13} />{app.copy.vision.openCollection}</button><button className="vision-collection-delete" type="button" onClick={() => deleteCollection(collection)} title={app.copy.vision.deleteCollection} aria-label={app.copy.vision.deleteCollection}><Trash2 size={14} /></button></div></article>
    }) : <div className="vision-empty">{app.copy.vision.savedCollectionEmpty}</div>}{collectionTransferStatus ? <small className="vision-saved-search-status" role="status">{collectionTransferStatus}</small> : null}</section>
  </div>
}
