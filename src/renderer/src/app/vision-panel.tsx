import { Archive, Check, CheckSquare, ChevronDown, ChevronRight, ChevronUp, Copy, Database, Download, FilePlus, ImageUp, Pencil, ScanSearch, Search, Square, Tags, Trash2, Undo2, Upload, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { VisionIndexProgress, VisionRuntimeStatus, VisionSearchResult } from '../../../shared/media-types'
import type { AsrSubtitleResult } from '../../../shared/media-types'
import type { MediaEvidenceDraftImportResult } from '../../../shared/evidence-task-types'
import type { VisionClipCollection, VisionClipCollectionBatchTagsMode, VisionClipCollectionExportFormat, VisionClipCollectionSortMode, VisionClipCollectionTagMetadata, VisionClipCollectionTagMetadataImportDecision, VisionClipCollectionTagMetadataImportPreviewResult, VisionClipCollectionTagOperationHistory, VisionClipCollectionTagSortMode, VisionEvidenceType, VisionIndexFailureRecord, VisionLibrarySource, VisionModelDownloadProgress, VisionSavedSearch, VisionSearchFullExportRequest, VisionSearchPageRequest, VisionSearchResultPage, VisionSearchResultsExportFormat, VisionSearchSortMode } from '../../../shared/vision-types'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionObjectDetectionFilterState, VisionObjectDetectionResult } from '../../../shared/vision-object-detection-types'
import { getVisionCollectionTagPath, invertVisionClipSelections, mergeVisionCollectionSelections, normalizeVisionClipCollectionRenamePart, normalizeVisionCollectionTag, normalizeVisionCollectionTags, renameVisionClipCollectionTitle, toggleVisibleVisionClipCollectionSelection, wouldCreateVisionCollectionTagParentCycle } from '../../../core/ai/clip-inbox-operations'
import { hasVisionCollectionTagChildren, isVisionCollectionTagHiddenByCollapsedAncestor, matchesVisionCollectionTagFilter, mergeVisionClipCollectionTagCollapsePreferences, parseVisionClipCollectionTagCollapsePreferences, serializeVisionClipCollectionTagCollapsePreferences, VISION_CLIP_COLLECTION_TAG_COLLAPSE_PREFERENCES_STORAGE_KEY, type VisionCollectionTagFilterMode } from '../../../core/ai/clip-inbox-tag-tree'
import { createVisionClipSelections, normalizeVisionTimeRange } from '../../../core/ai/vision-evidence'
import { getVisionSearchResultIds } from '../../../core/ai/vision-search-selection'
import { getNextVisionSearchLimit, shouldLoadMoreVisionSearchResults, VISION_SEARCH_PAGE_SIZE } from '../../../core/ai/vision-search-pagination'
import { createVisionSimilarSearchRequest } from '../../../core/ai/vision-similar-search'
import { createDefaultVisionSearchPreferences, parseVisionSearchPreferences, serializeVisionSearchPreferences, VISION_SEARCH_PREFERENCES_STORAGE_KEY, type VisionSearchPreferences } from '../../../core/ai/vision-search-preferences'
import { mergeVisionClipCollectionTagOrder, moveVisionClipCollectionTagOrder, parseVisionClipCollectionTagOrderPreferences, serializeVisionClipCollectionTagOrderPreferences, VISION_CLIP_COLLECTION_TAG_ORDER_PREFERENCES_STORAGE_KEY } from '../../../core/ai/clip-inbox-tag-order'
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
const DEFAULT_COLLECTION_TAG_COLOR = '#4f5d75'
const DEFAULT_COLLECTION_TAG_TEXT_COLOR = '#f4f1e6'
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

function readVisionClipCollectionTagOrderPreferences() {
  if (typeof window === 'undefined') return parseVisionClipCollectionTagOrderPreferences(null)
  try {
    return parseVisionClipCollectionTagOrderPreferences(window.localStorage.getItem(VISION_CLIP_COLLECTION_TAG_ORDER_PREFERENCES_STORAGE_KEY))
  } catch {
    return parseVisionClipCollectionTagOrderPreferences(null)
  }
}

function writeVisionClipCollectionTagOrderPreferences(order: string[], sortMode: VisionClipCollectionTagSortMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(VISION_CLIP_COLLECTION_TAG_ORDER_PREFERENCES_STORAGE_KEY, serializeVisionClipCollectionTagOrderPreferences({ schemaVersion: 1, order, sortMode }))
  } catch {
    // Renderer storage can be disabled or full; the in-memory order remains authoritative.
  }
}

function readVisionClipCollectionTagCollapsePreferences() {
  if (typeof window === 'undefined') return parseVisionClipCollectionTagCollapsePreferences(null)
  try {
    return parseVisionClipCollectionTagCollapsePreferences(window.localStorage.getItem(VISION_CLIP_COLLECTION_TAG_COLLAPSE_PREFERENCES_STORAGE_KEY))
  } catch {
    return parseVisionClipCollectionTagCollapsePreferences(null)
  }
}

function writeVisionClipCollectionTagCollapsePreferences(collapsedTags: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(VISION_CLIP_COLLECTION_TAG_COLLAPSE_PREFERENCES_STORAGE_KEY, serializeVisionClipCollectionTagCollapsePreferences({ schemaVersion: 1, collapsedTags }))
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
  const [collectionFilterQuery, setCollectionFilterQuery] = useState('')
  const [collectionFilterTags, setCollectionFilterTags] = useState<string[]>([])
  const [collectionFilterTagMode, setCollectionFilterTagMode] = useState<VisionCollectionTagFilterMode>('any')
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
  const [isDeletingCollections, setIsDeletingCollections] = useState(false)
  const [collectionRenamePrefix, setCollectionRenamePrefix] = useState('')
  const [collectionRenameSuffix, setCollectionRenameSuffix] = useState('')
  const [isRenamingCollections, setIsRenamingCollections] = useState(false)
  const [collectionBatchTags, setCollectionBatchTags] = useState('')
  const [collectionBatchTagsMode, setCollectionBatchTagsMode] = useState<VisionClipCollectionBatchTagsMode>('replace')
  const [isUpdatingCollectionTags, setIsUpdatingCollectionTags] = useState(false)
  const [collectionTagToManage, setCollectionTagToManage] = useState('')
  const [collectionTagFilterQuery, setCollectionTagFilterQuery] = useState('')
  const [collectionTagFavoritesOnly, setCollectionTagFavoritesOnly] = useState(false)
  const [collapsedCollectionTags, setCollapsedCollectionTags] = useState<Set<string>>(() => new Set(readVisionClipCollectionTagCollapsePreferences().collapsedTags))
  const [collectionTagSortMode, setCollectionTagSortMode] = useState<VisionClipCollectionTagSortMode>(() => readVisionClipCollectionTagOrderPreferences().sortMode)
  const [collectionTagOrder, setCollectionTagOrder] = useState<string[]>(() => readVisionClipCollectionTagOrderPreferences().order)
  const [isCleaningCollectionTag, setIsCleaningCollectionTag] = useState(false)
  const [collectionTagRenameTarget, setCollectionTagRenameTarget] = useState('')
  const [isRenamingCollectionTag, setIsRenamingCollectionTag] = useState(false)
  const [collectionTagMetadata, setCollectionTagMetadata] = useState<VisionClipCollectionTagMetadata[]>([])
  const [collectionTagParent, setCollectionTagParent] = useState('')
  const [collectionTagColor, setCollectionTagColor] = useState(DEFAULT_COLLECTION_TAG_COLOR)
  const [collectionTagTextColor, setCollectionTagTextColor] = useState(DEFAULT_COLLECTION_TAG_TEXT_COLOR)
  const [collectionTagNote, setCollectionTagNote] = useState('')
  const [collectionTagFavorite, setCollectionTagFavorite] = useState(false)
  const [isSavingCollectionTagMetadata, setIsSavingCollectionTagMetadata] = useState(false)
  const [isTransferringCollectionTagMetadata, setIsTransferringCollectionTagMetadata] = useState(false)
  const [collectionTagTransferStatus, setCollectionTagTransferStatus] = useState<string | null>(null)
  const [collectionTagImportPreview, setCollectionTagImportPreview] = useState<VisionClipCollectionTagMetadataImportPreviewResult | null>(null)
  const [collectionTagImportDecisions, setCollectionTagImportDecisions] = useState<Record<string, VisionClipCollectionTagMetadataImportDecision>>({})
  const [lastCollectionTagOperation, setLastCollectionTagOperation] = useState<VisionClipCollectionTagOperationHistory | null>(null)
  const [isUndoingCollectionTagOperation, setIsUndoingCollectionTagOperation] = useState(false)
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null)
  const [editingCollectionTitle, setEditingCollectionTitle] = useState('')
  const [isSavingCollectionTitle, setIsSavingCollectionTitle] = useState(false)
  const [editingCollectionTagsId, setEditingCollectionTagsId] = useState<string | null>(null)
  const [editingCollectionTags, setEditingCollectionTags] = useState('')
  const [isSavingCollectionTags, setIsSavingCollectionTags] = useState(false)
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
  const selectedCollectionsForRename = collections.filter((collection) => selectedCollectionIds.has(collection.id))
  const collectionFilterQueryLower = collectionFilterQuery.trim().toLocaleLowerCase()
  const collectionTagMetadataByTag = new Map(collectionTagMetadata.map((metadata) => [metadata.tag, metadata]))
  const availableCollectionFilterTags = [...new Set(collections.flatMap((collection) => collection.tags))].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
  const collectionTagStats = [...collections.reduce((counts, collection) => {
    for (const tag of collection.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    return counts
  }, new Map<string, number>())].map(([tag, count]) => ({ tag, count })).sort((left, right) => left.tag.localeCompare(right.tag, undefined, { sensitivity: 'base' }))
  const collectionTagNames = collectionTagStats.map((item) => item.tag)
  const collectionTagNamesKey = collectionTagNames.join('\\u001f')
  const collectionTagOrderIndex = new Map(collectionTagOrder.map((tag, index) => [tag, index]))
  const collapsedCollectionTagsKey = [...collapsedCollectionTags].sort().join('\u001f')
  const collectionTagFilterQueryLower = collectionTagFilterQuery.trim().toLocaleLowerCase()
  const hasCollectionTagFilter = Boolean(collectionTagFilterQuery.trim() || collectionTagFavoritesOnly)
  const visibleCollectionTagStats = [...collectionTagStats].filter((item) => {
    const metadata = collectionTagMetadataByTag.get(item.tag)
    const matchesQuery = !collectionTagFilterQueryLower || item.tag.toLocaleLowerCase().includes(collectionTagFilterQueryLower) || metadata?.note.toLocaleLowerCase().includes(collectionTagFilterQueryLower)
    const matchesFavorite = !collectionTagFavoritesOnly || metadata?.isFavorite === true
    const hiddenByCollapsedAncestor = !hasCollectionTagFilter && isVisionCollectionTagHiddenByCollapsedAncestor(item.tag, collectionTagMetadata, collapsedCollectionTags)
    return matchesQuery && matchesFavorite && !hiddenByCollapsedAncestor
  }).sort((left, right) => {
    if (collectionTagSortMode === 'custom') {
      const leftIndex = collectionTagOrderIndex.get(left.tag) ?? Number.MAX_SAFE_INTEGER
      const rightIndex = collectionTagOrderIndex.get(right.tag) ?? Number.MAX_SAFE_INTEGER
      if (leftIndex !== rightIndex) return leftIndex - rightIndex
    }
    if (collectionTagSortMode === 'usage-desc' && left.count !== right.count) return right.count - left.count
    if (collectionTagSortMode === 'favorite-first') {
      const favoriteDifference = Number(collectionTagMetadataByTag.get(right.tag)?.isFavorite === true) - Number(collectionTagMetadataByTag.get(left.tag)?.isFavorite === true)
      if (favoriteDifference !== 0) return favoriteDifference
    }
    return left.tag.localeCompare(right.tag, undefined, { sensitivity: 'base' })
  })
  const managedCollectionTag = visibleCollectionTagStats.some((item) => item.tag === collectionTagToManage) ? collectionTagToManage : visibleCollectionTagStats[0]?.tag ?? ''
  const managedCollectionTagMetadata = collectionTagMetadataByTag.get(managedCollectionTag)
  const managedCollectionTagOrderIndex = collectionTagOrder.indexOf(managedCollectionTag)
  const collectionTagParentOptions = collectionTagStats.filter((item) => item.tag !== managedCollectionTag && !wouldCreateVisionCollectionTagParentCycle(managedCollectionTag, item.tag, collectionTagMetadata))
  const normalizedCollectionTagRenameTarget = normalizeVisionCollectionTag(collectionTagRenameTarget)
  const canRenameCollectionTag = Boolean(managedCollectionTag && normalizedCollectionTagRenameTarget && managedCollectionTag !== normalizedCollectionTagRenameTarget)
  const visibleCollections = collections.filter((collection) => {
    const matchesQuery = !collectionFilterQueryLower || [collection.title, ...collection.tags].some((value) => value.toLocaleLowerCase().includes(collectionFilterQueryLower))
    const matchesTag = matchesVisionCollectionTagFilter(collection.tags, collectionFilterTags, collectionTagMetadata, collectionFilterTagMode)
    return matchesQuery && matchesTag
  })
  const hasCollectionFilter = Boolean(collectionFilterQuery.trim() || collectionFilterTags.length > 0)
  const visibleCollectionIds = visibleCollections.map((collection) => collection.id)
  const allVisibleCollectionsSelected = visibleCollections.length > 0 && visibleCollections.every((collection) => selectedCollectionIds.has(collection.id))
  const normalizedCollectionBatchTags = normalizeVisionCollectionTags(collectionBatchTags)
  const canUpdateCollectionTags = collectionBatchTagsMode === 'replace' || normalizedCollectionBatchTags.length > 0
  const renamePrefix = normalizeVisionClipCollectionRenamePart(collectionRenamePrefix)
  const renameSuffix = normalizeVisionClipCollectionRenamePart(collectionRenameSuffix)
  const hasRenameRule = Boolean(renamePrefix || renameSuffix)
  const renamePreviewCollections = selectedCollectionsForRename.map((collection) => ({ ...collection, title: renameVisionClipCollectionTitle(collection.title, renamePrefix, renameSuffix) }))
  const isCollectionBatchBusy = isDuplicatingCollections || isExportingCollections || isDeletingCollections || isRenamingCollections || isUpdatingCollectionTags || isCleaningCollectionTag || isRenamingCollectionTag || isSavingCollectionTagMetadata || isTransferringCollectionTagMetadata || isUndoingCollectionTagOperation || isSavingCollectionTitle || isSavingCollectionTags || editingCollectionId !== null || editingCollectionTagsId !== null || duplicatingCollectionId !== null
  const collectionTagImportPreviewItems = collectionTagImportPreview?.preview ?? []
  const collectionTagImportConflicts = collectionTagImportPreviewItems.filter((item) => item.state === 'conflict')
  const vectorIndexLabel = status?.vectorIndexType
    ? app.copy.vision.vectorIndex(status.vectorIndexType, status.vectorIndexDistanceType ?? '—', status.vectorIndexIndexedRows, status.vectorIndexUnindexedRows)
    : app.copy.vision.exactVectorSearch

  useEffect(() => { writeVisionSearchPreferences(searchPreferences) }, [searchPreferences])
  useEffect(() => {
    if (collectionTagNames.length === 0) return
    setCollectionTagOrder((current) => {
      const next = mergeVisionClipCollectionTagOrder(current, collectionTagNames)
      return JSON.stringify(next) === JSON.stringify(current) ? current : next
    })
  }, [collectionTagNamesKey])
  useEffect(() => {
    if (collectionTagNames.length === 0) return
    writeVisionClipCollectionTagOrderPreferences(collectionTagOrder, collectionTagSortMode)
  }, [collectionTagNamesKey, collectionTagOrder, collectionTagSortMode])
  useEffect(() => {
    if (collectionTagNames.length === 0) return
    setCollapsedCollectionTags((current) => {
      const next = mergeVisionClipCollectionTagCollapsePreferences(current, collectionTagNames)
      return JSON.stringify(next) === JSON.stringify([...current]) ? current : new Set(next)
    })
  }, [collectionTagNamesKey])
  useEffect(() => {
    if (collectionTagNames.length === 0) return
    writeVisionClipCollectionTagCollapsePreferences([...collapsedCollectionTags])
  }, [collectionTagNamesKey, collapsedCollectionTagsKey])

  const refreshFailures = (): void => { void window.aiv.listVisionIndexFailures().then(setFailures).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))) }
  const refreshSavedSearches = (): void => { void window.aiv.listVisionSavedSearches().then(setSavedSearches).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))) }
  const refreshCollectionTagMetadata = (): void => { void window.aiv.listVisionClipCollectionTagMetadata().then(setCollectionTagMetadata).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))) }
  const refreshCollectionTagOperation = (): void => { void window.aiv.getVisionClipCollectionTagOperationHistory().then(setLastCollectionTagOperation).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))) }

  useEffect(() => {
    setCollectionTagParent(managedCollectionTagMetadata?.parentTag ?? '')
    setCollectionTagColor(managedCollectionTagMetadata?.color || DEFAULT_COLLECTION_TAG_COLOR)
    setCollectionTagTextColor(managedCollectionTagMetadata?.textColor || DEFAULT_COLLECTION_TAG_TEXT_COLOR)
    setCollectionTagNote(managedCollectionTagMetadata?.note ?? '')
    setCollectionTagFavorite(managedCollectionTagMetadata?.isFavorite ?? false)
  }, [managedCollectionTag, managedCollectionTagMetadata?.color, managedCollectionTagMetadata?.isFavorite, managedCollectionTagMetadata?.note, managedCollectionTagMetadata?.parentTag, managedCollectionTagMetadata?.textColor])

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
    refreshCollectionTagMetadata()
    refreshCollectionTagOperation()
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

  const updateCollection = async (collection: VisionClipCollection, patch: Partial<Pick<VisionClipCollection, 'title' | 'tags' | 'sortMode' | 'selections'>>): Promise<VisionClipCollection | null> => {
    setError(null)
    try {
      const updated = await window.aiv.saveVisionClipCollection({
        id: collection.id,
        title: patch.title ?? collection.title,
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

  const beginCollectionTitleEdit = (collection: VisionClipCollection): void => {
    if (isCollectionBatchBusy) return
    setError(null)
    setCollectionTransferStatus(null)
    setEditingCollectionId(collection.id)
    setEditingCollectionTitle(collection.title)
  }

  const cancelCollectionTitleEdit = (): void => {
    setEditingCollectionId(null)
    setEditingCollectionTitle('')
    setError(null)
  }

  const saveCollectionTitle = async (collection: VisionClipCollection): Promise<void> => {
    if (isSavingCollectionTitle) return
    const title = editingCollectionTitle.trim()
    if (!title) {
      setError(app.copy.vision.collectionTitleRequired)
      return
    }
    if (title === collection.title) {
      cancelCollectionTitleEdit()
      return
    }
    setError(null)
    setIsSavingCollectionTitle(true)
    try {
      const updated = await updateCollection(collection, { title })
      if (!updated) return
      setCollectionTransferStatus(app.copy.vision.collectionRenamed(updated.title))
      setEditingCollectionId(null)
      setEditingCollectionTitle('')
    } finally {
      setIsSavingCollectionTitle(false)
    }
  }

  const handleCollectionTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>, collection: VisionClipCollection): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelCollectionTitleEdit()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      void saveCollectionTitle(collection)
    }
  }

  const beginCollectionTagsEdit = (collection: VisionClipCollection): void => {
    if (isCollectionBatchBusy) return
    setError(null)
    setCollectionTransferStatus(null)
    setEditingCollectionTagsId(collection.id)
    setEditingCollectionTags(collection.tags.join(', '))
  }

  const cancelCollectionTagsEdit = (): void => {
    setEditingCollectionTagsId(null)
    setEditingCollectionTags('')
    setError(null)
  }

  const saveCollectionTags = async (collection: VisionClipCollection): Promise<void> => {
    if (isSavingCollectionTags) return
    const tags = normalizeVisionCollectionTags(editingCollectionTags)
    if (JSON.stringify(tags) === JSON.stringify(collection.tags)) {
      cancelCollectionTagsEdit()
      return
    }
    setError(null)
    setIsSavingCollectionTags(true)
    try {
      const updated = await updateCollection(collection, { tags })
      if (!updated) return
      setCollectionTransferStatus(app.copy.vision.collectionTagsUpdated(updated.title))
      setEditingCollectionTagsId(null)
      setEditingCollectionTags('')
    } finally {
      setIsSavingCollectionTags(false)
    }
  }

  const handleCollectionTagsKeyDown = (event: KeyboardEvent<HTMLInputElement>, collection: VisionClipCollection): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelCollectionTagsEdit()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      void saveCollectionTags(collection)
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
    setSelectedCollectionIds((current) => new Set(toggleVisibleVisionClipCollectionSelection(current, visibleCollectionIds, !allVisibleCollectionsSelected)))
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

  const deleteSelectedCollections = (): void => {
    if (isCollectionBatchBusy || selectedCollectionIds.size === 0) return
    const collectionIds = [...selectedCollectionIds]
    if (!window.confirm(app.copy.vision.collectionsDeleteConfirm(collectionIds.length))) return
    setIsDeletingCollections(true)
    setError(null)
    void window.aiv.deleteVisionClipCollections({ collectionIds }).then((result) => {
      const deletedIds = new Set(result.deletedIds)
      setCollections((current) => current.filter((collection) => !deletedIds.has(collection.id)))
      setSelectedCollectionIds(new Set())
      setCollectionTransferStatus(app.copy.vision.collectionsDeleted(result.deletedCount, result.skippedCount))
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsDeletingCollections(false))
  }

  const renameSelectedCollections = (): void => {
    if (isCollectionBatchBusy || selectedCollectionIds.size === 0 || !hasRenameRule) return
    const collectionIds = [...selectedCollectionIds]
    if (!window.confirm(app.copy.vision.collectionsRenameConfirm(collectionIds.length))) return
    setIsRenamingCollections(true)
    setError(null)
    void window.aiv.renameVisionClipCollections({ collectionIds, prefix: renamePrefix, suffix: renameSuffix }).then((result) => {
      if (!result.success) {
        setError(result.message)
        return
      }
      const renamedById = new Map(result.collections.map((collection) => [collection.id, collection]))
      setCollections((current) => current.map((collection) => renamedById.get(collection.id) ?? collection))
      setSelectedCollectionIds(new Set())
      setCollectionRenamePrefix('')
      setCollectionRenameSuffix('')
      setCollectionTransferStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsRenamingCollections(false))
  }

  const updateSelectedCollectionsTags = (): void => {
    if (isCollectionBatchBusy || selectedCollectionIds.size === 0 || !canUpdateCollectionTags) return
    const collectionIds = [...selectedCollectionIds]
    const mode = collectionBatchTagsMode
    const tags = normalizedCollectionBatchTags
    const tagLabel = tags.length > 0 ? tags.join(' · ') : app.copy.vision.collectionTagsBatchEmpty
    const modeLabel = app.copy.vision.collectionTagsBatchModeLabel[mode]
    if (!window.confirm(app.copy.vision.collectionsTagsConfirm(collectionIds.length, tagLabel, modeLabel))) return
    setIsUpdatingCollectionTags(true)
    setError(null)
    void window.aiv.updateVisionClipCollectionsTags({ collectionIds, tags, mode }).then((result) => {
      if (!result.success) {
        setError(result.message)
        return
      }
      const updatedById = new Map(result.collections.map((collection) => [collection.id, collection]))
      setCollections((current) => current.map((collection) => updatedById.get(collection.id) ?? collection))
      setSelectedCollectionIds(new Set())
      setCollectionBatchTags('')
      setCollectionBatchTagsMode('replace')
      refreshCollectionTagOperation()
      setCollectionTransferStatus(result.message || app.copy.vision.collectionsTagsUpdated(result.collections.length, result.skippedCount, modeLabel))
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsUpdatingCollectionTags(false))
  }

  const cleanupCollectionTag = (): void => {
    if (isCollectionBatchBusy || !managedCollectionTag) return
    const selectedStat = collectionTagStats.find((item) => item.tag === managedCollectionTag)
    if (!selectedStat || !window.confirm(app.copy.vision.collectionTagManagerConfirm(managedCollectionTag, selectedStat.count))) return
    const tag = managedCollectionTag
    setIsCleaningCollectionTag(true)
    setError(null)
    void window.aiv.cleanupVisionClipCollectionTag({ tag }).then((result) => {
      if (!result.success) {
        setError(result.message)
        return
      }
      const updatedById = new Map(result.collections.map((collection) => [collection.id, collection]))
      setCollections((current) => current.map((collection) => updatedById.get(collection.id) ?? collection))
      setCollectionTagToManage('')
      setCollectionFilterTags((current) => current.filter((selectedTag) => selectedTag !== tag))
      refreshCollectionTagMetadata()
      refreshCollectionTagOperation()
      setCollectionTransferStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsCleaningCollectionTag(false))
  }

  const renameCollectionTag = (): void => {
    if (isCollectionBatchBusy || !canRenameCollectionTag) return
    const fromTag = managedCollectionTag
    const toTag = normalizedCollectionTagRenameTarget
    const selectedStat = collectionTagStats.find((item) => item.tag === fromTag)
    if (!selectedStat || !window.confirm(app.copy.vision.collectionTagManagerRenameConfirm(fromTag, toTag, selectedStat.count))) return
    setIsRenamingCollectionTag(true)
    setError(null)
    void window.aiv.renameVisionClipCollectionTag({ fromTag, toTag }).then((result) => {
      if (!result.success) {
        setError(result.message)
        return
      }
      const updatedById = new Map(result.collections.map((collection) => [collection.id, collection]))
      setCollections((current) => current.map((collection) => updatedById.get(collection.id) ?? collection))
      setCollectionTagToManage(toTag)
      setCollectionTagRenameTarget('')
      setCollectionFilterTags((current) => current.map((selectedTag) => selectedTag === fromTag ? toTag : selectedTag))
      refreshCollectionTagMetadata()
      refreshCollectionTagOperation()
      setCollectionTransferStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsRenamingCollectionTag(false))
  }

  const moveManagedCollectionTag = (direction: 'up' | 'down'): void => {
    if (isCollectionBatchBusy || collectionTagSortMode !== 'custom' || !managedCollectionTag) return
    const next = moveVisionClipCollectionTagOrder(collectionTagOrder, managedCollectionTag, direction)
    if (JSON.stringify(next) === JSON.stringify(collectionTagOrder)) return
    setCollectionTagOrder(next)
    setCollectionTagTransferStatus(app.copy.vision.collectionTagManagerOrderMoved(managedCollectionTag, direction))
  }

  const toggleCollectionTagCollapsed = (tag: string): void => {
    if (isCollectionBatchBusy) return
    setCollapsedCollectionTags((current) => {
      const next = new Set(current)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const saveCollectionTagMetadata = (): void => {
    if (isCollectionBatchBusy || !managedCollectionTag) return
    setIsSavingCollectionTagMetadata(true)
    setError(null)
    void window.aiv.updateVisionClipCollectionTagMetadata({ tag: managedCollectionTag, parentTag: collectionTagParent, color: collectionTagColor, textColor: collectionTagTextColor, note: collectionTagNote, isFavorite: collectionTagFavorite }).then((result) => {
      if (!result.success || !result.metadata) {
        setError(result.message)
        return
      }
      setCollectionTagMetadata((current) => [...current.filter((metadata) => metadata.tag !== result.metadata?.tag), result.metadata as VisionClipCollectionTagMetadata])
      refreshCollectionTagOperation()
      setCollectionTransferStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsSavingCollectionTagMetadata(false))
  }

  const exportCollectionTagMetadata = (): void => {
    if (isCollectionBatchBusy || collectionTagMetadata.length === 0) return
    setError(null)
    setCollectionTagTransferStatus(null)
    setIsTransferringCollectionTagMetadata(true)
    void window.aiv.exportVisionClipCollectionTagMetadata().then((result) => {
      if (result.canceled) return
      if (!result.success) {
        setError(result.message)
        return
      }
      setCollectionTagTransferStatus(result.message || app.copy.vision.collectionTagManagerMetadataExported(result.exportedCount ?? 0))
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsTransferringCollectionTagMetadata(false))
  }

  const importCollectionTagMetadata = (): void => {
    if (isCollectionBatchBusy || collectionTagImportPreview !== null) return
    setError(null)
    setCollectionTagTransferStatus(null)
    setIsTransferringCollectionTagMetadata(true)
    void window.aiv.importVisionClipCollectionTagMetadata().then((result) => {
      if (result.canceled) return
      if (!result.success) {
        setError(result.message)
        return
      }
      const defaultDecisions: Record<string, VisionClipCollectionTagMetadataImportDecision> = {}
      for (const item of result.preview ?? []) {
        if (item.state === 'conflict') defaultDecisions[item.tag] = 'keep-local'
      }
      setCollectionTagImportDecisions(defaultDecisions)
      setCollectionTagImportPreview(result)
      setCollectionTagTransferStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsTransferringCollectionTagMetadata(false))
  }

  const applyCollectionTagMetadataImport = (): void => {
    if (!collectionTagImportPreview?.metadata || isTransferringCollectionTagMetadata) return
    setError(null)
    setIsTransferringCollectionTagMetadata(true)
    void window.aiv.applyVisionClipCollectionTagMetadata({ metadata: collectionTagImportPreview.metadata, decisions: collectionTagImportDecisions }).then((result) => {
      if (!result.success) {
        setError(result.message)
        return
      }
      setCollectionTagImportPreview(null)
      setCollectionTagImportDecisions({})
      refreshCollectionTagMetadata()
      refreshCollectionTagOperation()
      setCollectionTagTransferStatus(result.message || app.copy.vision.collectionTagManagerMetadataImported(result.importedCount ?? 0, result.skippedCount ?? 0))
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsTransferringCollectionTagMetadata(false))
  }

  const cancelCollectionTagMetadataImport = (): void => {
    if (isTransferringCollectionTagMetadata) return
    setCollectionTagImportPreview(null)
    setCollectionTagImportDecisions({})
    setCollectionTagTransferStatus(null)
  }

  const undoCollectionTagOperation = (): void => {
    if (isCollectionBatchBusy || !lastCollectionTagOperation) return
    setIsUndoingCollectionTagOperation(true)
    setError(null)
    void window.aiv.undoVisionClipCollectionTagOperation().then((result) => {
      if (!result.success) {
        setError(result.message)
        return
      }
      const updatedById = new Map(result.collections.map((collection) => [collection.id, collection]))
      setCollections((current) => current.map((collection) => updatedById.get(collection.id) ?? collection))
      setCollectionTagMetadata(result.metadata)
      setCollectionTagToManage('')
      setCollectionTagRenameTarget('')
      refreshCollectionTagOperation()
      setCollectionTransferStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsUndoingCollectionTagOperation(false))
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
    {collections.length > 0 ? <div className="vision-card vision-collection-tag-manager">
      <div className="vision-collection-tag-manager-heading"><div className="vision-collection-tag-manager-heading-copy"><strong>{app.copy.vision.collectionTagManagerTitle}</strong><small>{app.copy.vision.collectionTagManagerDescription}</small></div><div className="vision-collection-tag-manager-transfer-actions"><button className="vision-secondary-action" type="button" onClick={importCollectionTagMetadata} disabled={isCollectionBatchBusy || collectionTagImportPreview !== null}><Upload size={12} />{app.copy.vision.collectionTagManagerMetadataImport}</button><button className="vision-secondary-action" type="button" onClick={exportCollectionTagMetadata} disabled={isCollectionBatchBusy || collectionTagImportPreview !== null || collectionTagMetadata.length === 0}><Download size={12} />{app.copy.vision.collectionTagManagerMetadataExport}</button></div></div>
      {collectionTagTransferStatus ? <small className="vision-saved-search-status" role="status">{collectionTagTransferStatus}</small> : null}
      {collectionTagImportPreview ? <div className="vision-collection-tag-manager-import-preview" role="dialog" aria-label={app.copy.vision.collectionTagManagerMetadataImportPreviewTitle}>
        <div className="vision-collection-tag-manager-import-preview-heading"><strong>{app.copy.vision.collectionTagManagerMetadataImportPreviewTitle}</strong><small>{app.copy.vision.collectionTagManagerMetadataImportPreviewDescription(collectionTagImportConflicts.length, collectionTagImportPreviewItems.filter((item) => item.state === 'new').length, collectionTagImportPreviewItems.filter((item) => item.state === 'unused').length)}</small></div>
        {collectionTagImportConflicts.length > 0 ? <div className="vision-collection-tag-manager-import-conflicts" role="list" aria-label={app.copy.vision.collectionTagManagerMetadataImportDecisionLabel}>
          {collectionTagImportConflicts.map((item) => <div className="vision-collection-tag-manager-import-conflict" key={item.tag} role="listitem"><span>{item.tag}</span><label><span>{app.copy.vision.collectionTagManagerMetadataImportDecisionLabel}</span><select value={collectionTagImportDecisions[item.tag] ?? 'keep-local'} aria-label={`${app.copy.vision.collectionTagManagerMetadataImportDecisionLabel}: ${item.tag}`} onChange={(event) => setCollectionTagImportDecisions((current) => ({ ...current, [item.tag]: event.target.value as VisionClipCollectionTagMetadataImportDecision }))} disabled={isTransferringCollectionTagMetadata}><option value="overwrite">{app.copy.vision.collectionTagManagerMetadataImportOverwrite}</option><option value="keep-local">{app.copy.vision.collectionTagManagerMetadataImportKeepLocal}</option><option value="skip">{app.copy.vision.collectionTagManagerMetadataImportSkip}</option></select></label></div>)}
        </div> : <small className="vision-collection-tag-manager-import-preview-empty">{app.copy.vision.collectionTagManagerMetadataImportPreviewNoConflicts}</small>}
        <div className="vision-collection-tag-manager-import-preview-actions"><button className="vision-primary-action" type="button" onClick={applyCollectionTagMetadataImport} disabled={isTransferringCollectionTagMetadata}><Check size={12} />{app.copy.vision.collectionTagManagerMetadataImportApply}</button><button className="vision-secondary-action" type="button" onClick={cancelCollectionTagMetadataImport} disabled={isTransferringCollectionTagMetadata}><X size={12} />{app.copy.vision.collectionTagManagerMetadataImportCancel}</button></div>
      </div> : null}
      {collectionTagStats.length > 0 ? <>
        <div className="vision-collection-tag-manager-filter">
          <input value={collectionTagFilterQuery} onChange={(event) => setCollectionTagFilterQuery(event.target.value)} placeholder={app.copy.vision.collectionTagManagerFilterPlaceholder} aria-label={app.copy.vision.collectionTagManagerFilterPlaceholder} disabled={isCollectionBatchBusy} />
          <label><input type="checkbox" checked={collectionTagFavoritesOnly} onChange={(event) => setCollectionTagFavoritesOnly(event.currentTarget.checked)} aria-label={app.copy.vision.collectionTagManagerFavoritesOnly} disabled={isCollectionBatchBusy} /><span>{app.copy.vision.collectionTagManagerFavoritesOnly}</span></label>
          <label><span>{app.copy.vision.collectionTagManagerSortLabel}</span><select value={collectionTagSortMode} onChange={(event) => setCollectionTagSortMode(event.target.value as VisionClipCollectionTagSortMode)} aria-label={app.copy.vision.collectionTagManagerSortLabel} disabled={isCollectionBatchBusy}><option value="name">{app.copy.vision.collectionTagManagerSortName}</option><option value="usage-desc">{app.copy.vision.collectionTagManagerSortUsage}</option><option value="favorite-first">{app.copy.vision.collectionTagManagerSortFavorite}</option><option value="custom">{app.copy.vision.collectionTagManagerSortCustom}</option></select></label>
          {hasCollectionTagFilter ? <button className="vision-secondary-action" type="button" onClick={() => { setCollectionTagFilterQuery(''); setCollectionTagFavoritesOnly(false) }} disabled={isCollectionBatchBusy}>{app.copy.vision.collectionTagManagerFilterClear}</button> : null}
        </div>
        {visibleCollectionTagStats.length > 0 ? <div className="vision-collection-tag-manager-list" role="list" aria-label={app.copy.vision.collectionTagManagerSelectLabel}>
          {visibleCollectionTagStats.map((item) => { const metadata = collectionTagMetadataByTag.get(item.tag); const path = getVisionCollectionTagPath(item.tag, collectionTagMetadata); const hasChildren = hasVisionCollectionTagChildren(item.tag, collectionTagMetadata); const isCollapsed = collapsedCollectionTags.has(item.tag); return <div className="vision-collection-tag-manager-item-row" key={item.tag} role="listitem">
            {hasChildren ? <button className="vision-collection-tag-manager-collapse" type="button" onClick={() => toggleCollectionTagCollapsed(item.tag)} disabled={isCollectionBatchBusy} aria-label={`${isCollapsed ? app.copy.vision.collectionTagManagerExpandChildren : app.copy.vision.collectionTagManagerCollapseChildren}: ${item.tag}`} aria-expanded={!isCollapsed} title={isCollapsed ? app.copy.vision.collectionTagManagerExpandChildren : app.copy.vision.collectionTagManagerCollapseChildren}>{isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</button> : <span className="vision-collection-tag-manager-collapse-placeholder" aria-hidden="true" />}
            <button className={`vision-collection-tag-manager-item${managedCollectionTag === item.tag ? ' is-active' : ''}`} type="button" onClick={() => setCollectionTagToManage(item.tag)} aria-label={app.copy.vision.collectionTagManagerSelectTag(item.tag, item.count)} aria-pressed={managedCollectionTag === item.tag} style={{ backgroundColor: metadata?.color || undefined, color: metadata?.textColor || undefined }}><span>{path.join(' / ')}</span><small>{item.count}</small></button>
          </div> })}
        </div> : <div className="vision-collection-tag-manager-empty">{app.copy.vision.collectionTagManagerFilterEmpty}</div>}
        <div className="vision-collection-tag-manager-controls">
          <span className="vision-collection-tag-manager-selection" role="status">{managedCollectionTag ? app.copy.vision.collectionTagManagerSelectTag(managedCollectionTag, collectionTagStats.find((item) => item.tag === managedCollectionTag)?.count ?? 0) : app.copy.vision.collectionTagManagerSelectionRequired}</span>
          <input className="vision-collection-tag-manager-input" value={collectionTagRenameTarget} maxLength={40} onChange={(event) => setCollectionTagRenameTarget(event.target.value)} placeholder={app.copy.vision.collectionTagManagerRenameInputPlaceholder} aria-label={app.copy.vision.collectionTagManagerRenameInputPlaceholder} disabled={isCollectionBatchBusy} />
          <button className="vision-secondary-action" type="button" onClick={renameCollectionTag} disabled={isCollectionBatchBusy || !canRenameCollectionTag}><Tags size={13} />{app.copy.vision.collectionTagManagerRename}</button>
          <button className="vision-secondary-action vision-collection-batch-delete" type="button" onClick={cleanupCollectionTag} disabled={isCollectionBatchBusy || !managedCollectionTag}><Tags size={13} />{app.copy.vision.collectionTagManagerCleanup}</button>
          {collectionTagSortMode === 'custom' && managedCollectionTag ? <><button className="vision-secondary-action" type="button" onClick={() => moveManagedCollectionTag('up')} disabled={isCollectionBatchBusy || managedCollectionTagOrderIndex <= 0} aria-label={`${app.copy.vision.collectionTagManagerMoveUp}: ${managedCollectionTag}`}><ChevronUp size={13} />{app.copy.vision.collectionTagManagerMoveUp}</button><button className="vision-secondary-action" type="button" onClick={() => moveManagedCollectionTag('down')} disabled={isCollectionBatchBusy || managedCollectionTagOrderIndex < 0 || managedCollectionTagOrderIndex >= collectionTagOrder.length - 1} aria-label={`${app.copy.vision.collectionTagManagerMoveDown}: ${managedCollectionTag}`}><ChevronDown size={13} />{app.copy.vision.collectionTagManagerMoveDown}</button></> : null}
        </div>
        <div className="vision-collection-tag-manager-metadata">
          <div className="vision-collection-tag-manager-metadata-heading"><strong>{app.copy.vision.collectionTagManagerMetadataTitle}</strong><small>{app.copy.vision.collectionTagManagerMetadataDescription}</small></div>
          <div className="vision-collection-tag-manager-metadata-controls">
            <label><span>{app.copy.vision.collectionTagManagerMetadataParentLabel}</span><select value={collectionTagParent} onChange={(event) => setCollectionTagParent(event.target.value)} aria-label={app.copy.vision.collectionTagManagerMetadataParentLabel} disabled={isCollectionBatchBusy}><option value="">{app.copy.vision.collectionTagManagerMetadataParentNone}</option>{collectionTagParentOptions.map((item) => <option key={item.tag} value={item.tag}>{item.tag}</option>)}</select></label>
            <label><span>{app.copy.vision.collectionTagManagerMetadataColorLabel}</span><input type="color" value={collectionTagColor} onChange={(event) => setCollectionTagColor(event.currentTarget.value)} aria-label={app.copy.vision.collectionTagManagerMetadataColorLabel} disabled={isCollectionBatchBusy} /></label>
            <label><span>{app.copy.vision.collectionTagManagerMetadataTextColorLabel}</span><input type="color" value={collectionTagTextColor} onChange={(event) => setCollectionTagTextColor(event.currentTarget.value)} aria-label={app.copy.vision.collectionTagManagerMetadataTextColorLabel} disabled={isCollectionBatchBusy} /></label>
            <label className="vision-collection-tag-manager-favorite"><input type="checkbox" checked={collectionTagFavorite} onChange={(event) => setCollectionTagFavorite(event.currentTarget.checked)} aria-label={app.copy.vision.collectionTagManagerMetadataFavoriteLabel} disabled={isCollectionBatchBusy} /><span>{app.copy.vision.collectionTagManagerMetadataFavoriteLabel}</span></label>
            <button className="vision-secondary-action" type="button" onClick={saveCollectionTagMetadata} disabled={isCollectionBatchBusy || !managedCollectionTag}><Tags size={13} />{app.copy.vision.collectionTagManagerMetadataSave}</button>
          </div>
          <label className="vision-collection-tag-manager-note"><span>{app.copy.vision.collectionTagManagerMetadataNoteLabel}</span><textarea value={collectionTagNote} maxLength={240} onChange={(event) => setCollectionTagNote(event.target.value)} placeholder={app.copy.vision.collectionTagManagerMetadataNotePlaceholder} aria-label={app.copy.vision.collectionTagManagerMetadataNoteLabel} disabled={isCollectionBatchBusy} /></label>
        </div>
        {lastCollectionTagOperation ? <div className="vision-collection-tag-manager-undo"><small>{app.copy.vision.collectionTagManagerUndoDescription}</small><button className="vision-secondary-action" type="button" onClick={undoCollectionTagOperation} disabled={isCollectionBatchBusy}><Undo2 size={13} />{app.copy.vision.collectionTagManagerUndo}</button></div> : null}
      </> : <div className="vision-collection-tag-manager-empty">{app.copy.vision.collectionTagManagerEmpty}</div>}
    </div> : null}
    {collections.length > 0 && collectionTagStats.length === 0 && lastCollectionTagOperation ? <div className="vision-card vision-collection-tag-undo-only"><small>{app.copy.vision.collectionTagManagerUndoDescription}</small><button className="vision-secondary-action" type="button" onClick={undoCollectionTagOperation} disabled={isCollectionBatchBusy}><Undo2 size={13} />{app.copy.vision.collectionTagManagerUndo}</button></div> : null}
    {selectedCollectionIds.size > 0 ? <div className="vision-card vision-collection-batch-tags-actions"><div className="vision-collection-batch-tags-heading"><strong>{app.copy.vision.selectedCollections(selectedCollectionIds.size)}</strong><small>{app.copy.vision.collectionTagsBatchPlaceholder}</small></div><div className="vision-collection-batch-tags-controls"><select className="vision-collection-batch-tags-mode" value={collectionBatchTagsMode} onChange={(event) => setCollectionBatchTagsMode(event.target.value as VisionClipCollectionBatchTagsMode)} aria-label={app.copy.vision.collectionTagsBatchModeAriaLabel} disabled={isCollectionBatchBusy}><option value="replace">{app.copy.vision.collectionTagsBatchModeLabel.replace}</option><option value="add">{app.copy.vision.collectionTagsBatchModeLabel.add}</option><option value="remove">{app.copy.vision.collectionTagsBatchModeLabel.remove}</option></select><input className="vision-collection-batch-tags-input" value={collectionBatchTags} maxLength={800} onChange={(event) => setCollectionBatchTags(event.target.value)} placeholder={app.copy.vision.collectionTagsBatchInputPlaceholder} aria-label={app.copy.vision.collectionTagsBatchInputPlaceholder} disabled={isCollectionBatchBusy} /><button className="vision-primary-action" type="button" onClick={updateSelectedCollectionsTags} disabled={isCollectionBatchBusy || !canUpdateCollectionTags}><Tags size={13} />{app.copy.vision.updateSelectedCollectionTags}</button>{!canUpdateCollectionTags ? <small className="vision-collection-batch-tags-hint">{app.copy.vision.collectionTagsBatchNeedInput}</small> : null}</div></div> : null}
    <section className="vision-card vision-collections"><div className="vision-collections-heading"><strong>{app.copy.vision.savedCollections}</strong><div className="vision-collection-transfer-actions">{collections.length > 0 ? <button className="vision-secondary-action" type="button" onClick={toggleAllCollectionSelection} disabled={isCollectionBatchBusy || visibleCollections.length === 0}>{allVisibleCollectionsSelected ? <Square size={12} /> : <CheckSquare size={12} />}{allVisibleCollectionsSelected ? (hasCollectionFilter ? app.copy.vision.collectionClearVisible : app.copy.vision.collectionClearSelection) : (hasCollectionFilter ? app.copy.vision.collectionSelectVisible : app.copy.vision.collectionSelectAll)}</button> : null}<button className="vision-secondary-action" type="button" onClick={importCollection} disabled={isCollectionBatchBusy}><Upload size={12} />{app.copy.vision.collectionImport}</button><Archive size={15} /></div></div>{collections.length > 0 ? <><div className="vision-collection-filter-bar"><input className="vision-collection-filter-input" value={collectionFilterQuery} onChange={(event) => setCollectionFilterQuery(event.target.value)} placeholder={app.copy.vision.collectionFilterPlaceholder} aria-label={app.copy.vision.collectionFilterPlaceholder} disabled={isCollectionBatchBusy} /><select className="vision-collection-filter-tag" multiple size={Math.min(5, Math.max(2, availableCollectionFilterTags.length))} value={collectionFilterTags} onChange={(event) => setCollectionFilterTags(Array.from(event.currentTarget.selectedOptions, (option) => option.value))} aria-label={app.copy.vision.collectionFilterTagLabel} disabled={isCollectionBatchBusy}>{availableCollectionFilterTags.map((tag) => <option key={tag} value={tag}>{getVisionCollectionTagPath(tag, collectionTagMetadata).join(' / ') || tag}</option>)}</select>{collectionFilterTags.length > 1 ? <select className="vision-collection-filter-mode" value={collectionFilterTagMode} onChange={(event) => setCollectionFilterTagMode(event.target.value as VisionCollectionTagFilterMode)} aria-label={app.copy.vision.collectionFilterTagModeLabel} disabled={isCollectionBatchBusy}><option value="any">{app.copy.vision.collectionFilterTagModeAny}</option><option value="all">{app.copy.vision.collectionFilterTagModeAll}</option></select> : null}{hasCollectionFilter ? <button className="vision-secondary-action" type="button" onClick={() => { setCollectionFilterQuery(''); setCollectionFilterTags([]); setCollectionFilterTagMode('any') }} disabled={isCollectionBatchBusy}>{app.copy.vision.collectionFilterClear}</button> : null}<span className="vision-collection-filter-summary" role="status">{app.copy.vision.collectionFilterSummary(visibleCollections.length, collections.length)}</span></div>{collectionFilterTags.length > 0 ? <div className="vision-collection-filter-selected" role="group" aria-label={app.copy.vision.collectionFilterSelectedTagsLabel}><span className="vision-collection-filter-selected-label">{app.copy.vision.collectionFilterSelectedTagsLabel}</span>{collectionFilterTags.map((tag) => { const path = getVisionCollectionTagPath(tag, collectionTagMetadata).join(' / ') || tag; return <button className="vision-collection-filter-chip" key={tag} type="button" onClick={() => setCollectionFilterTags((current) => current.filter((selectedTag) => selectedTag !== tag))} aria-label={`${app.copy.vision.collectionFilterRemoveTag}: ${path}`} disabled={isCollectionBatchBusy}><span>{path}</span><X size={11} aria-hidden="true" /></button> })}</div> : null}</> : null}{selectedCollectionIds.size > 0 ? <div className="vision-collection-batch-actions"><span>{app.copy.vision.selectedCollections(selectedCollectionIds.size)}</span><input className="vision-collection-rename-input" value={collectionRenamePrefix} maxLength={40} onChange={(event) => setCollectionRenamePrefix(event.target.value)} placeholder={app.copy.vision.collectionRenamePrefixPlaceholder} aria-label={app.copy.vision.collectionRenamePrefixPlaceholder} disabled={isCollectionBatchBusy} /><input className="vision-collection-rename-input" value={collectionRenameSuffix} maxLength={40} onChange={(event) => setCollectionRenameSuffix(event.target.value)} placeholder={app.copy.vision.collectionRenameSuffixPlaceholder} aria-label={app.copy.vision.collectionRenameSuffixPlaceholder} disabled={isCollectionBatchBusy} />{hasRenameRule ? <div className="vision-collection-rename-preview" role="status"><span>{app.copy.vision.collectionRenamePreview}</span>{renamePreviewCollections.slice(0, 3).map((collection) => <small key={collection.id}>{collection.title}</small>)}{renamePreviewCollections.length > 3 ? <small>{app.copy.vision.collectionRenamePreviewMore(renamePreviewCollections.length - 3)}</small> : null}</div> : null}<button className="vision-secondary-action" type="button" onClick={renameSelectedCollections} disabled={isCollectionBatchBusy || !hasRenameRule}>{app.copy.vision.renameSelectedCollections}</button><button className="vision-primary-action" type="button" onClick={() => void duplicateSelectedCollections()} disabled={isCollectionBatchBusy}><Copy size={13} />{app.copy.vision.duplicateSelectedCollections}</button><button className="vision-secondary-action" type="button" onClick={exportSelectedCollections} disabled={isCollectionBatchBusy}><Download size={12} />{app.copy.vision.exportSelectedCollections}</button><button className="vision-secondary-action vision-collection-batch-delete" type="button" onClick={deleteSelectedCollections} disabled={isCollectionBatchBusy}><Trash2 size={13} />{app.copy.vision.deleteSelectedCollections}</button></div> : null}{collections.length > 0 ? (visibleCollections.length > 0 ? visibleCollections.map((collection) => {
      const availability = collectionAvailability[collection.id]
      const isRepairing = repairingCollectionId === collection.id
      const isEditingTitle = editingCollectionId === collection.id
      const isEditingTags = editingCollectionTagsId === collection.id
      return <article className="vision-collection" key={collection.id}><div className="vision-collection-heading"><input type="checkbox" checked={selectedCollectionIds.has(collection.id)} onChange={() => toggleCollectionSelection(collection.id)} disabled={isCollectionBatchBusy} aria-label={app.copy.vision.selectCollection(collection.title)} /><div className="vision-collection-copy"><div className="vision-collection-title-row">{isEditingTitle ? <div className="vision-collection-title-edit"><input className="vision-collection-inline-title-input" value={editingCollectionTitle} maxLength={200} autoFocus onChange={(event) => setEditingCollectionTitle(event.target.value)} onKeyDown={(event) => handleCollectionTitleKeyDown(event, collection)} aria-label={app.copy.vision.collectionTitleEditLabel} /><button className="vision-collection-inline-action" type="button" onClick={() => void saveCollectionTitle(collection)} disabled={isSavingCollectionTitle} title={app.copy.vision.saveCollectionTitle} aria-label={app.copy.vision.saveCollectionTitle}><Check size={13} /></button><button className="vision-collection-inline-action" type="button" onClick={cancelCollectionTitleEdit} disabled={isSavingCollectionTitle} title={app.copy.vision.cancelCollectionTitle} aria-label={app.copy.vision.cancelCollectionTitle}><X size={13} /></button></div> : <><strong>{collection.title}</strong><button className="vision-collection-inline-action" type="button" onClick={() => beginCollectionTitleEdit(collection)} disabled={isCollectionBatchBusy} title={app.copy.vision.editCollectionTitle} aria-label={`${app.copy.vision.editCollectionTitle}: ${collection.title}`}><Pencil size={12} /></button></>}</div><span>{app.copy.vision.selectedResults(collection.selections.length)} · {collection.sortMode === 'duration-desc' ? app.copy.vision.collectionSortDuration : collection.sortMode === 'file-name' ? app.copy.vision.collectionSortFileName : app.copy.vision.collectionSortSourceTime}</span>{isEditingTags ? <div className="vision-collection-tags-edit"><input className="vision-collection-inline-tags-input" value={editingCollectionTags} maxLength={800} autoFocus onChange={(event) => setEditingCollectionTags(event.target.value)} onKeyDown={(event) => handleCollectionTagsKeyDown(event, collection)} placeholder={app.copy.vision.collectionTagsPlaceholder} aria-label={app.copy.vision.collectionTagsEditLabel} /><button className="vision-collection-inline-action" type="button" onClick={() => void saveCollectionTags(collection)} disabled={isSavingCollectionTags} title={app.copy.vision.saveCollectionTags} aria-label={app.copy.vision.saveCollectionTags}><Check size={13} /></button><button className="vision-collection-inline-action" type="button" onClick={cancelCollectionTagsEdit} disabled={isSavingCollectionTags} title={app.copy.vision.cancelCollectionTags} aria-label={app.copy.vision.cancelCollectionTags}><X size={13} /></button></div> : <div className="vision-collection-tags-row"><small className={collection.tags.length > 0 ? undefined : 'vision-collection-tags-empty'}>{collection.tags.length > 0 ? collection.tags.join(' · ') : app.copy.vision.collectionTagsEmpty}</small><button className="vision-collection-inline-action" type="button" onClick={() => beginCollectionTagsEdit(collection)} disabled={isCollectionBatchBusy} title={app.copy.vision.editCollectionTags} aria-label={`${app.copy.vision.editCollectionTags}: ${collection.title}`}><Pencil size={11} /></button></div>}{availability?.missingPaths ? <small className="vision-collection-missing">{app.copy.vision.collectionMissingSources(availability.missingPaths)}</small> : null}</div></div><div className="vision-collection-actions"><select className="vision-collection-sort" value={collection.sortMode} aria-label={app.copy.vision.collectionSortLabel} onChange={(event) => sortCollection(collection, event.target.value as VisionClipCollectionSortMode)} disabled={isEditingTitle || isEditingTags || isSavingCollectionTitle || isSavingCollectionTags}><option value="source-time">{app.copy.vision.collectionSortSourceTime}</option><option value="duration-desc">{app.copy.vision.collectionSortDuration}</option><option value="file-name">{app.copy.vision.collectionSortFileName}</option></select>{availability?.missingPaths ? <button className="vision-secondary-action" type="button" onClick={() => void repairCollection(collection)} disabled={isRepairing || isEditingTitle || isEditingTags}>{isRepairing ? app.copy.vision.repairingCollectionSources : app.copy.vision.repairCollectionSources}</button> : null}<button className="vision-secondary-action" type="button" onClick={() => mergeCollection(collection)} disabled={isEditingTitle || isEditingTags}>{app.copy.vision.collectionMerge}</button><button className="vision-secondary-action" type="button" onClick={() => invertCollection(collection)} disabled={isEditingTitle || isEditingTags}>{app.copy.vision.collectionInvert}</button><button className="vision-secondary-action" type="button" onClick={() => exportCollection(collection, 'json')} disabled={isEditingTitle || isEditingTags}>{app.copy.vision.exportJson}</button><button className="vision-secondary-action" type="button" onClick={() => exportCollection(collection, 'csv')} disabled={isEditingTitle || isEditingTags}>{app.copy.vision.exportCsv}</button><button className="vision-secondary-action" type="button" onClick={() => exportCollection(collection, 'edl')} disabled={isEditingTitle || isEditingTags}>{app.copy.vision.exportEdl}</button><button className="vision-secondary-action" type="button" onClick={() => void duplicateCollection(collection)} disabled={isCollectionBatchBusy || isEditingTitle || isEditingTags} title={app.copy.vision.duplicateCollection}><Copy size={13} />{app.copy.vision.duplicateCollection}</button><button className="vision-primary-action" type="button" onClick={() => createProjectFromCollection(collection)} disabled={isEditingTitle || isEditingTags} title={app.copy.vision.openCollection}><FilePlus size={13} />{app.copy.vision.openCollection}</button><button className="vision-collection-delete" type="button" onClick={() => deleteCollection(collection)} disabled={isEditingTitle || isEditingTags} title={app.copy.vision.deleteCollection} aria-label={app.copy.vision.deleteCollection}><Trash2 size={14} /></button></div></article>
    }) : <div className="vision-empty">{app.copy.vision.collectionFilterEmpty}</div>) : <div className="vision-empty">{app.copy.vision.savedCollectionEmpty}</div>}{collectionTransferStatus ? <small className="vision-saved-search-status" role="status">{collectionTransferStatus}</small> : null}</section>
  </div>
}
