import { Archive, Check, CheckSquare, ChevronDown, ChevronRight, ChevronUp, Copy, Database, Download, FilePlus, ImageUp, Pencil, Redo2, ScanSearch, Search, Square, Star, Tags, Trash2, Undo2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react'
import type { VisionIndexProgress, VisionRuntimeStatus, VisionSearchResult } from '../../../shared/media-types'
import type { AsrSubtitleResult } from '../../../shared/media-types'
import type { MediaEvidenceDraftImportResult } from '../../../shared/evidence-task-types'
import type { VisionClipCollection, VisionClipCollectionBatchTagsMode, VisionClipCollectionExportFormat, VisionClipCollectionMergeSelection, VisionClipCollectionOperationBatchConflict, VisionClipCollectionOperationCollectionDetail, VisionClipCollectionOperationCollectionDiff, VisionClipCollectionOperationDetailField, VisionClipCollectionOperationHistory, VisionClipCollectionOperationHistoryDetail, VisionClipCollectionOperationHistoryEntry, VisionClipCollectionOperationHistoryFilter, VisionClipCollectionOperationHistoryStatusFilter, VisionClipCollectionOperationHistoryTypeFilter, VisionClipCollectionSortMode, VisionClipCollectionTagMetadata, VisionClipCollectionTagMetadataImportDecision, VisionClipCollectionTagMetadataImportPreviewResult, VisionClipCollectionTagOperationBatchConflict, VisionClipCollectionTagOperationHistory, VisionClipCollectionTagOperationHistoryDetail, VisionClipCollectionTagOperationHistoryEntry, VisionClipCollectionTagSortMode, VisionClipSelection, VisionEvidenceType, VisionIndexFailureRecord, VisionLibrarySource, VisionClipCollectionOperationDetailChange, VisionModelDownloadProgress, VisionSavedSearch, VisionSearchFullExportRequest, VisionSearchPageRequest, VisionSearchResultPage, VisionSearchResultsExportFormat, VisionSearchSortMode } from '../../../shared/vision-types'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionObjectDetectionFilterState, VisionObjectDetectionResult } from '../../../shared/vision-object-detection-types'
import type { VisionClipCollectionTagOperationHistoryFilter } from '../../../shared/vision-types'
import { getVisionClipSelectionMergeKey, getVisionCollectionTagPath, invertVisionClipSelections, mergeVisionCollectionSelections, normalizeVisionClipCollectionRenamePart, normalizeVisionCollectionTag, normalizeVisionCollectionTags, previewVisionClipCollectionMerge, renameVisionClipCollectionTitle, toggleVisibleVisionClipCollectionSelection, wouldCreateVisionCollectionTagParentCycle } from '../../../core/ai/clip-inbox-operations'
import { filterVisionClipCollectionTagOperationHistory, serializeVisionClipCollectionTagOperationHistory, VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_PAGE_SIZE } from '../../../core/ai/clip-inbox-tag-history'
import { filterVisionClipCollectionOperationHistory, serializeVisionClipCollectionOperationHistory } from '../../../core/ai/clip-inbox-collection-history'
import { hasVisionCollectionTagChildren, isVisionCollectionTagHiddenByCollapsedAncestor, matchesVisionCollectionTagFilter, mergeVisionClipCollectionTagCollapsePreferences, parseVisionClipCollectionTagCollapsePreferences, serializeVisionClipCollectionTagCollapsePreferences, VISION_CLIP_COLLECTION_TAG_COLLAPSE_PREFERENCES_STORAGE_KEY, type VisionCollectionTagFilterMode } from '../../../core/ai/clip-inbox-tag-tree'
import { createVisionClipSelections, normalizeVisionTimeRange } from '../../../core/ai/vision-evidence'
import { parseVisionClipCollectionOrderPreferences, serializeVisionClipCollectionOrderPreferences, sortVisionClipCollections, VISION_CLIP_COLLECTION_ORDER_PREFERENCES_STORAGE_KEY, type VisionClipCollectionListSortMode } from '../../../core/ai/clip-inbox-collection-order'
import { summarizeVisionClipCollectionStatuses } from '../../../core/ai/clip-inbox-collection-status'
import { applyVisionClipCollectionSavedFilterImportPreview, createVisionClipCollectionSavedFilterImportPreview, mergeVisionClipCollectionFilterTags, parseVisionClipCollectionFilterPreferences, parseVisionClipCollectionSavedFilterManifest, parseVisionClipCollectionSavedFilters, removeVisionClipCollectionSavedFilter, serializeVisionClipCollectionFilterPreferences, serializeVisionClipCollectionSavedFilters, upsertVisionClipCollectionSavedFilter, VISION_CLIP_COLLECTION_FILTER_PREFERENCES_STORAGE_KEY, VISION_CLIP_COLLECTION_SAVED_FILTERS_STORAGE_KEY, type VisionClipCollectionFilterVisibility, type VisionClipCollectionSavedFilter, type VisionClipCollectionSavedFilterImportDecision, type VisionClipCollectionSavedFilterImportPreviewItem } from '../../../core/ai/clip-inbox-filter-preferences'
import { getVisionSearchResultIds } from '../../../core/ai/vision-search-selection'
import { getNextVisionSearchLimit, shouldLoadMoreVisionSearchResults, VISION_SEARCH_PAGE_SIZE } from '../../../core/ai/vision-search-pagination'
import { createVisionSimilarSearchRequest } from '../../../core/ai/vision-similar-search'
import { createDefaultVisionSearchPreferences, parseVisionSearchPreferences, serializeVisionSearchPreferences, VISION_SEARCH_PREFERENCES_STORAGE_KEY, type VisionSearchPreferences } from '../../../core/ai/vision-search-preferences'
import { diffVisionClipCollectionOperationDetails } from '../../../core/ai/clip-inbox-operation-diff'
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

type CollectionMergeRangeOverride = {
  startSeconds: number
  endSeconds: number
}

type VisionCollectionTagOperationBatchDirection = 'undo' | 'redo'

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

function readVisionClipCollectionOrderPreferences() {
  if (typeof window === 'undefined') return parseVisionClipCollectionOrderPreferences(null)
  try {
    return parseVisionClipCollectionOrderPreferences(window.localStorage.getItem(VISION_CLIP_COLLECTION_ORDER_PREFERENCES_STORAGE_KEY))
  } catch {
    return parseVisionClipCollectionOrderPreferences(null)
  }
}

function writeVisionClipCollectionOrderPreferences(sortMode: VisionClipCollectionListSortMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(VISION_CLIP_COLLECTION_ORDER_PREFERENCES_STORAGE_KEY, serializeVisionClipCollectionOrderPreferences({ schemaVersion: 1, sortMode }))
  } catch {
    // Renderer storage can be disabled or full; the in-memory order remains authoritative.
  }
}

function readVisionClipCollectionFilterPreferences() {
  if (typeof window === 'undefined') return parseVisionClipCollectionFilterPreferences(null)
  try {
    return parseVisionClipCollectionFilterPreferences(window.localStorage.getItem(VISION_CLIP_COLLECTION_FILTER_PREFERENCES_STORAGE_KEY))
  } catch {
    return parseVisionClipCollectionFilterPreferences(null)
  }
}

function writeVisionClipCollectionFilterPreferences(query: string, tags: string[], excludedTags: string[], tagMode: VisionCollectionTagFilterMode, visibility: VisionClipCollectionFilterVisibility = 'all'): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(VISION_CLIP_COLLECTION_FILTER_PREFERENCES_STORAGE_KEY, serializeVisionClipCollectionFilterPreferences({ schemaVersion: 1, query, tags, excludedTags, tagMode, visibility }))
  } catch {
    // Renderer storage can be disabled or full; the in-memory filter remains authoritative.
  }
}

function readVisionClipCollectionSavedFilters(): VisionClipCollectionSavedFilter[] {
  if (typeof window === 'undefined') return []
  try {
    return parseVisionClipCollectionSavedFilters(window.localStorage.getItem(VISION_CLIP_COLLECTION_SAVED_FILTERS_STORAGE_KEY), Date.now())
  } catch {
    return []
  }
}

function writeVisionClipCollectionSavedFilters(filters: readonly VisionClipCollectionSavedFilter[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(VISION_CLIP_COLLECTION_SAVED_FILTERS_STORAGE_KEY, serializeVisionClipCollectionSavedFilters(filters))
  } catch {
    // Renderer storage can be disabled or full; the in-memory saved views remain authoritative.
  }
}

function createVisionClipCollectionSavedFilterId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `collection-filter-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function downloadVisionClipCollectionSavedFilters(filters: readonly VisionClipCollectionSavedFilter[]): void {
  const blob = new Blob([serializeVisionClipCollectionSavedFilters(filters)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `aivplayer-collection-filter-views-${new Date().toISOString().slice(0, 10)}.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function downloadVisionClipCollectionTagOperationHistory(entries: readonly VisionClipCollectionTagOperationHistoryEntry[], filter: VisionClipCollectionTagOperationHistoryFilter): number {
  const filteredEntries = filterVisionClipCollectionTagOperationHistory(entries, filter)
  const blob = new Blob([serializeVisionClipCollectionTagOperationHistory(entries, filter)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `aivplayer-tag-operation-history-${filter}-${new Date().toISOString().slice(0, 10)}.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return filteredEntries.length
}

function downloadVisionClipCollectionOperationHistory(entries: readonly VisionClipCollectionOperationHistoryEntry[], filter: VisionClipCollectionOperationHistoryFilter): number {
  const filteredEntries = filterVisionClipCollectionOperationHistory(entries, filter)
  const blob = new Blob([serializeVisionClipCollectionOperationHistory(entries, filter)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `aivplayer-collection-operation-history-${filter.type}-${filter.status}-${new Date().toISOString().slice(0, 10)}.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return filteredEntries.length
}

async function loadAllVisionClipCollectionTagOperationHistory(filter: VisionClipCollectionTagOperationHistoryFilter): Promise<VisionClipCollectionTagOperationHistoryEntry[]> {
  const entries: VisionClipCollectionTagOperationHistoryEntry[] = []
  let page = await window.aiv.listVisionClipCollectionTagOperationHistoryPage({ offset: 0, limit: VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_PAGE_SIZE, filter })
  let pageCount = 0
  while (true) {
    entries.push(...page.entries)
    pageCount += 1
    if (!page.hasMore) return entries
    if (page.entries.length === 0) throw new Error('标签历史导出分页返回空页')
    if (pageCount >= 100) throw new Error('标签历史导出分页超过安全上限')
    const nextOffset = page.offset + page.entries.length
    if (nextOffset <= page.offset) throw new Error('标签历史导出分页位置无效')
    page = await window.aiv.listVisionClipCollectionTagOperationHistoryPage({ offset: nextOffset, limit: VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_PAGE_SIZE, filter })
  }
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.max(1, Math.round(milliseconds))}ms`
  const seconds = milliseconds / 1000
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
}

function formatClipPreviewTime(seconds: number): string {
  const normalized = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0
  const hours = Math.floor(normalized / 3600)
  const minutes = Math.floor(normalized / 60) % 60
  const remainingSeconds = (normalized % 60).toFixed(1).padStart(4, '0')
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${remainingSeconds}`
    : `${String(minutes).padStart(2, '0')}:${remainingSeconds}`
}

function formatClipPreviewRange(selection: Pick<VisionClipSelection, 'startSeconds' | 'endSeconds'>): string {
  return `${formatClipPreviewTime(selection.startSeconds)}–${formatClipPreviewTime(selection.endSeconds)}`
}

function CollectionOperationDetailState({ label, collections, diffs, copy }: { label: string; collections: VisionClipCollectionOperationCollectionDetail[]; diffs: VisionClipCollectionOperationCollectionDiff[]; copy: LocaleCopy['vision'] }): ReactNode {
  return <div className="vision-collection-operation-history-detail-state">
    <strong>{label}</strong>
    {collections.length === 0 ? <small>{copy.collectionOperationHistoryDetailEmpty}</small> : <div className="vision-collection-operation-history-detail-collections">
      {collections.map((collection) => {
        const collectionDiff = diffs.find((diff) => diff.id === collection.id)
        const sortLabel = collection.sortMode === 'duration-desc' ? copy.collectionSortDuration : collection.sortMode === 'file-name' ? copy.collectionSortFileName : copy.collectionSortSourceTime
        const flags = `${collection.isFavorite ? copy.collectionStatusFavorite : copy.collectionStatusUnfavorite} · ${collection.isArchived ? copy.collectionStatusArchived : copy.collectionStatusUnarchived}`
        const renderField = (field: VisionClipCollectionOperationDetailField, fieldLabel: string, value: string): ReactNode => {
          const change: VisionClipCollectionOperationDetailChange = collectionDiff?.fieldChanges[field] ?? 'unchanged'
          return <div className={`vision-collection-operation-history-detail-field is-${change}`} data-change={change}><dt>{fieldLabel}</dt><dd><span>{value}</span>{change !== 'unchanged' ? <em>{copy.collectionOperationHistoryDetailChangeLabel[change]}</em> : null}</dd></div>
        }
        return <div className="vision-collection-operation-history-detail-collection" key={collection.id}>
          <strong title={collection.title || collection.id}>{collection.title || collection.id}</strong>
          <dl>
            <div className="vision-collection-operation-history-detail-field is-unchanged"><dt>{copy.collectionOperationHistoryDetailCollectionIdLabel}</dt><dd><code>{collection.id}</code></dd></div>
            {renderField('title', copy.collectionOperationHistoryDetailTitleLabel, collection.title)}
            {renderField('tags', copy.collectionOperationHistoryDetailTagsLabel, collection.tags.length > 0 ? collection.tags.join(' · ') : copy.collectionTagsEmpty)}
            {renderField('flags', copy.collectionOperationHistoryDetailFlagsLabel, flags)}
            {renderField('sortMode', copy.collectionOperationHistoryDetailSortLabel, sortLabel)}
            {renderField('selectionCount', copy.collectionOperationHistoryDetailSelectionsLabel, copy.collectionOperationHistorySelectionCount(collection.selectionCount))}
          </dl>
        </div>
      })}
    </div>}
  </div>
}

type CollectionOperationBatchDirection = 'undo' | 'redo'

function getCollectionMergeSelectionStateKey(collectionId: string, selection: VisionClipSelection): string {
  return `${collectionId}\u0000${getVisionClipSelectionMergeKey(selection)}`
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
  const [hasLoadedCollections, setHasLoadedCollections] = useState(false)
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set())
  const [excludedCollectionMergeSelectionKeys, setExcludedCollectionMergeSelectionKeys] = useState<Set<string>>(new Set())
  const [collectionMergeRangeOverrides, setCollectionMergeRangeOverrides] = useState<Record<string, CollectionMergeRangeOverride>>({})
  const [collectionFilterQuery, setCollectionFilterQuery] = useState(() => readVisionClipCollectionFilterPreferences().query)
  const [collectionFilterTags, setCollectionFilterTags] = useState<string[]>(() => readVisionClipCollectionFilterPreferences().tags)
  const [collectionFilterExcludedTags, setCollectionFilterExcludedTags] = useState<string[]>(() => readVisionClipCollectionFilterPreferences().excludedTags)
  const [collectionFilterTagMode, setCollectionFilterTagMode] = useState<VisionCollectionTagFilterMode>(() => readVisionClipCollectionFilterPreferences().tagMode)
  const [collectionFilterVisibility, setCollectionFilterVisibility] = useState<VisionClipCollectionFilterVisibility>(() => readVisionClipCollectionFilterPreferences().visibility)
  const [collectionListSortMode, setCollectionListSortMode] = useState<VisionClipCollectionListSortMode>(() => readVisionClipCollectionOrderPreferences().sortMode)
  const [savedCollectionFilterName, setSavedCollectionFilterName] = useState('')
  const [savedCollectionFilters, setSavedCollectionFilters] = useState<VisionClipCollectionSavedFilter[]>(readVisionClipCollectionSavedFilters)
  const [savedCollectionFilterTransferStatus, setSavedCollectionFilterTransferStatus] = useState<string | null>(null)
  const [savedCollectionFilterImportPreview, setSavedCollectionFilterImportPreview] = useState<VisionClipCollectionSavedFilterImportPreviewItem[] | null>(null)
  const [savedCollectionFilterImportDecisions, setSavedCollectionFilterImportDecisions] = useState<Record<string, VisionClipCollectionSavedFilterImportDecision>>({})
  const savedCollectionFilterFileInputRef = useRef<HTMLInputElement | null>(null)
  const collectionOperationRefreshVersionRef = useRef(0)
  const collectionOperationHistoryDetailRequestVersionRef = useRef(0)
  const collectionTagOperationRefreshVersionRef = useRef(0)
  const collectionTagHistoryDetailRequestVersionRef = useRef(0)
  const [collectionTransferStatus, setCollectionTransferStatus] = useState<string | null>(null)
  const [collectionAvailability, setCollectionAvailability] = useState<Record<string, CollectionAvailability>>({})
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})
  const [sourceThumbnailUrls, setSourceThumbnailUrls] = useState<Record<string, string>>({})
  const [isSearching, setIsSearching] = useState(false)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [repairingCollectionId, setRepairingCollectionId] = useState<string | null>(null)
  const [duplicatingCollectionId, setDuplicatingCollectionId] = useState<string | null>(null)
  const [isDuplicatingCollections, setIsDuplicatingCollections] = useState(false)
  const [isMergingCollections, setIsMergingCollections] = useState(false)
  const [collectionMergeTitle, setCollectionMergeTitle] = useState('')
  const [isExportingCollections, setIsExportingCollections] = useState(false)
  const [isDeletingCollections, setIsDeletingCollections] = useState(false)
  const [isUpdatingCollectionFlags, setIsUpdatingCollectionFlags] = useState(false)
  const [updatingCollectionFlagId, setUpdatingCollectionFlagId] = useState<string | null>(null)
  const [isUpdatingCollectionSelections, setIsUpdatingCollectionSelections] = useState(false)
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
  const [isExportingCollectionTagHistory, setIsExportingCollectionTagHistory] = useState(false)
  const [collectionTagImportPreview, setCollectionTagImportPreview] = useState<VisionClipCollectionTagMetadataImportPreviewResult | null>(null)
  const [collectionTagImportDecisions, setCollectionTagImportDecisions] = useState<Record<string, VisionClipCollectionTagMetadataImportDecision>>({})
  const [lastCollectionTagOperation, setLastCollectionTagOperation] = useState<VisionClipCollectionTagOperationHistory | null>(null)
  const [isUndoingCollectionTagOperation, setIsUndoingCollectionTagOperation] = useState(false)
  const [lastCollectionTagRedoOperation, setLastCollectionTagRedoOperation] = useState<VisionClipCollectionTagOperationHistory | null>(null)
  const [isRedoingCollectionTagOperation, setIsRedoingCollectionTagOperation] = useState(false)
  const [collectionTagOperationHistory, setCollectionTagOperationHistory] = useState<VisionClipCollectionTagOperationHistoryEntry[]>([])
  const [collectionTagHistoryFilter, setCollectionTagHistoryFilter] = useState<VisionClipCollectionTagOperationHistoryFilter>('all')
  const [collectionTagHistoryOffset, setCollectionTagHistoryOffset] = useState(0)
  const [collectionTagHistoryTotal, setCollectionTagHistoryTotal] = useState(0)
  const [collectionTagHistoryHasMore, setCollectionTagHistoryHasMore] = useState(false)
  const [isLoadingCollectionTagHistory, setIsLoadingCollectionTagHistory] = useState(false)
  const [collectionTagHistoryDetailId, setCollectionTagHistoryDetailId] = useState<string | null>(null)
  const [collectionTagHistoryDetail, setCollectionTagHistoryDetail] = useState<VisionClipCollectionTagOperationHistoryDetail | null>(null)
  const [isLoadingCollectionTagHistoryDetail, setIsLoadingCollectionTagHistoryDetail] = useState(false)
  const [selectedCollectionTagOperationUndoIds, setSelectedCollectionTagOperationUndoIds] = useState<Set<string>>(() => new Set())
  const [selectedCollectionTagOperationRedoIds, setSelectedCollectionTagOperationRedoIds] = useState<Set<string>>(() => new Set())
  const [collectionTagOperationConflicts, setCollectionTagOperationConflicts] = useState<VisionClipCollectionTagOperationBatchConflict[]>([])
  const [lastCollectionOperation, setLastCollectionOperation] = useState<VisionClipCollectionOperationHistory | null>(null)
  const [isUndoingCollectionOperation, setIsUndoingCollectionOperation] = useState(false)
  const [lastCollectionRedoOperation, setLastCollectionRedoOperation] = useState<VisionClipCollectionOperationHistory | null>(null)
  const [isRedoingCollectionOperation, setIsRedoingCollectionOperation] = useState(false)
  const [collectionOperationHistory, setCollectionOperationHistory] = useState<VisionClipCollectionOperationHistoryEntry[]>([])
  const [collectionOperationHistoryTypeFilter, setCollectionOperationHistoryTypeFilter] = useState<VisionClipCollectionOperationHistoryTypeFilter>('all')
  const [collectionOperationHistoryStatusFilter, setCollectionOperationHistoryStatusFilter] = useState<VisionClipCollectionOperationHistoryStatusFilter>('all')
  const [isExportingCollectionOperationHistory, setIsExportingCollectionOperationHistory] = useState(false)
  const [selectedCollectionOperationUndoIds, setSelectedCollectionOperationUndoIds] = useState<Set<string>>(() => new Set())
  const [selectedCollectionOperationRedoIds, setSelectedCollectionOperationRedoIds] = useState<Set<string>>(() => new Set())
  const [collectionOperationConflicts, setCollectionOperationConflicts] = useState<VisionClipCollectionOperationBatchConflict[]>([])
  const [collectionOperationHistoryDetailId, setCollectionOperationHistoryDetailId] = useState<string | null>(null)
  const [collectionOperationHistoryDetail, setCollectionOperationHistoryDetail] = useState<VisionClipCollectionOperationHistoryDetail | null>(null)
  const [isLoadingCollectionOperationHistoryDetail, setIsLoadingCollectionOperationHistoryDetail] = useState(false)
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
  const collectionStatusSummary = summarizeVisionClipCollectionStatuses(collections)
  const allSelectedCollectionsFavorite = selectedCollectionsForRename.length > 0 && selectedCollectionsForRename.every((collection) => collection.isFavorite)
  const allSelectedCollectionsArchived = selectedCollectionsForRename.length > 0 && selectedCollectionsForRename.every((collection) => collection.isArchived)
  const collectionFilterQueryLower = collectionFilterQuery.trim().toLocaleLowerCase()
  const collectionTagMetadataByTag = new Map(collectionTagMetadata.map((metadata) => [metadata.tag, metadata]))
  const availableCollectionFilterTags = [...new Set(collections.flatMap((collection) => collection.tags))].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
  const availableCollectionFilterTagsKey = availableCollectionFilterTags.join('\u001f')
  const collectionFilterTagsKey = collectionFilterTags.join('\u001f')
  const collectionFilterExcludedTagsKey = collectionFilterExcludedTags.join('\u001f')
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
  const visibleCollections = sortVisionClipCollections(collections.filter((collection) => {
    const matchesQuery = !collectionFilterQueryLower || [collection.title, ...collection.tags].some((value) => value.toLocaleLowerCase().includes(collectionFilterQueryLower))
    const matchesTag = matchesVisionCollectionTagFilter(collection.tags, collectionFilterTags, collectionTagMetadata, collectionFilterTagMode, collectionFilterExcludedTags)
    const matchesVisibility = collectionFilterVisibility === 'all'
      || (collectionFilterVisibility === 'active' && !collection.isArchived)
      || (collectionFilterVisibility === 'favorites' && collection.isFavorite)
      || (collectionFilterVisibility === 'archived' && collection.isArchived)
    return matchesQuery && matchesTag && matchesVisibility
  }), collectionListSortMode)
  const hasCollectionFilter = Boolean(collectionFilterQuery.trim() || collectionFilterTags.length > 0 || collectionFilterExcludedTags.length > 0 || collectionFilterVisibility !== 'all')
  const visibleCollectionIds = visibleCollections.map((collection) => collection.id)
  const allVisibleCollectionsSelected = visibleCollections.length > 0 && visibleCollections.every((collection) => selectedCollectionIds.has(collection.id))
  const normalizedCollectionBatchTags = normalizeVisionCollectionTags(collectionBatchTags)
  const canUpdateCollectionTags = collectionBatchTagsMode === 'replace' || normalizedCollectionBatchTags.length > 0
  const renamePrefix = normalizeVisionClipCollectionRenamePart(collectionRenamePrefix)
  const renameSuffix = normalizeVisionClipCollectionRenamePart(collectionRenameSuffix)
  const hasRenameRule = Boolean(renamePrefix || renameSuffix)
  const renamePreviewCollections = selectedCollectionsForRename.map((collection) => ({ ...collection, title: renameVisionClipCollectionTitle(collection.title, renamePrefix, renameSuffix) }))
  const collectionMergeTitleValue = collectionMergeTitle.trim() || app.copy.vision.collectionMergeDefaultTitle
  const collectionMergeSelectedSelections: VisionClipCollectionMergeSelection[] = selectedCollectionsForRename.map((collection) => {
    const selectedSelections = collection.selections.filter((selection) => !excludedCollectionMergeSelectionKeys.has(getCollectionMergeSelectionStateKey(collection.id, selection)))
    const rangeOverrides = selectedSelections.map((selection) => {
      const selectionKey = getVisionClipSelectionMergeKey(selection)
      const rangeOverride = collectionMergeRangeOverrides[getCollectionMergeSelectionStateKey(collection.id, selection)]
      return rangeOverride ? { selectionKey, ...rangeOverride } : null
    }).filter((override): override is { selectionKey: string; startSeconds: number; endSeconds: number } => override !== null)
    return {
      collectionId: collection.id,
      selectionKeys: selectedSelections.map((selection) => getVisionClipSelectionMergeKey(selection)),
      ...(rangeOverrides.length > 0 ? { rangeOverrides } : {})
    }
  })
  const collectionMergeSelectionCount = collectionMergeSelectedSelections.reduce((count, item) => count + item.selectionKeys.length, 0)
  const collectionOperationHistoryFilter: VisionClipCollectionOperationHistoryFilter = { type: collectionOperationHistoryTypeFilter, status: collectionOperationHistoryStatusFilter }
  const visibleCollectionOperationHistory = filterVisionClipCollectionOperationHistory(collectionOperationHistory, collectionOperationHistoryFilter)
  const undoableCollectionOperationHistory = visibleCollectionOperationHistory.filter((operation) => operation.status === 'active')
  const redoableCollectionOperationHistory = visibleCollectionOperationHistory.filter((operation) => operation.status === 'redoable')
  const selectedCollectionOperationCount = selectedCollectionOperationUndoIds.size + selectedCollectionOperationRedoIds.size
  const collectionMergePreview = selectedCollectionsForRename.length >= 2
    ? (() => {
      try {
        return previewVisionClipCollectionMerge(selectedCollectionsForRename, collectionMergeTitleValue, 'source-time', collectionMergeSelectedSelections)
      } catch {
        return null
      }
    })()
    : null
  const collectionMergePreviewTags = collectionMergePreview?.collection.tags ?? []
  const collectionMergePreviewSources = collectionMergePreview?.sources ?? selectedCollectionsForRename.map((collection) => ({ collectionId: collection.id, title: collection.title, selections: collection.selections }))
  const isCollectionBatchBusy = isDuplicatingCollections || isMergingCollections || isExportingCollections || isDeletingCollections || isRenamingCollections || isUpdatingCollectionTags || isUpdatingCollectionFlags || isUpdatingCollectionSelections || isCleaningCollectionTag || isRenamingCollectionTag || isSavingCollectionTagMetadata || isTransferringCollectionTagMetadata || isExportingCollectionTagHistory || isExportingCollectionOperationHistory || isUndoingCollectionTagOperation || isRedoingCollectionTagOperation || isUndoingCollectionOperation || isRedoingCollectionOperation || isSavingCollectionTitle || isSavingCollectionTags || editingCollectionId !== null || editingCollectionTagsId !== null || duplicatingCollectionId !== null || updatingCollectionFlagId !== null
  const collectionTagImportPreviewItems = collectionTagImportPreview?.preview ?? []
  const collectionTagImportConflicts = collectionTagImportPreviewItems.filter((item) => item.state === 'conflict')
  const savedCollectionFilterImportItems = savedCollectionFilterImportPreview ?? []
  const savedCollectionFilterImportConflicts = savedCollectionFilterImportItems.filter((item) => item.state === 'conflict')
  const savedCollectionFilterImportNewCount = savedCollectionFilterImportItems.filter((item) => item.state === 'new').length
  const savedCollectionFilterImportSkippedCount = savedCollectionFilterImportItems.filter((item) => item.state !== 'new' && item.state !== 'conflict').length
  const visibleCollectionTagOperationHistory = filterVisionClipCollectionTagOperationHistory(collectionTagOperationHistory, collectionTagHistoryFilter)
  const undoableCollectionTagOperationHistory = visibleCollectionTagOperationHistory.filter((operation) => operation.status === 'active')
  const redoableCollectionTagOperationHistory = visibleCollectionTagOperationHistory.filter((operation) => operation.status === 'redoable')
  const selectedCollectionTagOperationCount = selectedCollectionTagOperationUndoIds.size + selectedCollectionTagOperationRedoIds.size
  const collectionTagHistoryPageCount = Math.ceil(collectionTagHistoryTotal / VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_PAGE_SIZE)
  const collectionTagHistoryPageNumber = collectionTagHistoryTotal === 0 ? 0 : Math.floor(collectionTagHistoryOffset / VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_PAGE_SIZE) + 1
  const isCollectionTagHistoryBusy = isLoadingCollectionTagHistory || isLoadingCollectionTagHistoryDetail
  const vectorIndexLabel = status?.vectorIndexType
    ? app.copy.vision.vectorIndex(status.vectorIndexType, status.vectorIndexDistanceType ?? '—', status.vectorIndexIndexedRows, status.vectorIndexUnindexedRows)
    : app.copy.vision.exactVectorSearch

  useEffect(() => { writeVisionSearchPreferences(searchPreferences) }, [searchPreferences])
  useEffect(() => {
    if (!hasLoadedCollections) return
    setCollectionFilterTags((current) => {
      const next = mergeVisionClipCollectionFilterTags(current, availableCollectionFilterTags)
      return JSON.stringify(next) === JSON.stringify(current) ? current : next
    })
    setCollectionFilterExcludedTags((current) => {
      const next = mergeVisionClipCollectionFilterTags(current, availableCollectionFilterTags)
      return JSON.stringify(next) === JSON.stringify(current) ? current : next
    })
  }, [hasLoadedCollections, availableCollectionFilterTagsKey])
  useEffect(() => {
    if (!hasLoadedCollections) return
    writeVisionClipCollectionFilterPreferences(collectionFilterQuery, collectionFilterTags, collectionFilterExcludedTags, collectionFilterTagMode, collectionFilterVisibility)
  }, [hasLoadedCollections, collectionFilterQuery, collectionFilterTagsKey, collectionFilterExcludedTagsKey, collectionFilterTagMode, collectionFilterVisibility])
  useEffect(() => { writeVisionClipCollectionOrderPreferences(collectionListSortMode) }, [collectionListSortMode])
  useEffect(() => { writeVisionClipCollectionSavedFilters(savedCollectionFilters) }, [savedCollectionFilters])
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
  const refreshCollectionTagOperation = (offset = 0, filter: VisionClipCollectionTagOperationHistoryFilter = collectionTagHistoryFilter): void => {
    const version = ++collectionTagOperationRefreshVersionRef.current
    setIsLoadingCollectionTagHistory(true)
    setCollectionTagHistoryDetailId(null)
    setCollectionTagHistoryDetail(null)
    void Promise.all([
      window.aiv.getVisionClipCollectionTagOperationHistory(),
      window.aiv.listVisionClipCollectionTagOperationHistoryPage({ offset, limit: VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_PAGE_SIZE, filter }),
      window.aiv.getVisionClipCollectionTagOperationRedoHistory()
    ]).then(([nextUndo, nextHistoryPage, nextRedo]) => {
      if (version === collectionTagOperationRefreshVersionRef.current) {
        setLastCollectionTagOperation(nextUndo)
        setCollectionTagOperationHistory(nextHistoryPage.entries)
        setCollectionTagHistoryOffset(nextHistoryPage.offset)
        setCollectionTagHistoryTotal(nextHistoryPage.total)
        setCollectionTagHistoryHasMore(nextHistoryPage.hasMore)
        setLastCollectionTagRedoOperation(nextRedo)
      }
    }).catch((reason: unknown) => {
      if (version === collectionTagOperationRefreshVersionRef.current) setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => {
      if (version === collectionTagOperationRefreshVersionRef.current) setIsLoadingCollectionTagHistory(false)
    })
  }
  const refreshCollectionOperation = (): void => {
    const version = ++collectionOperationRefreshVersionRef.current
    void Promise.all([window.aiv.getVisionClipCollectionOperationHistory(), window.aiv.listVisionClipCollectionOperationHistory(), window.aiv.getVisionClipCollectionOperationRedoHistory()]).then(([nextUndo, nextHistory, nextRedo]) => {
      if (version === collectionOperationRefreshVersionRef.current) {
        setLastCollectionOperation(nextUndo)
        setCollectionOperationHistory(nextHistory)
        setLastCollectionRedoOperation(nextRedo)
        const undoableIds = new Set(nextHistory.filter((operation) => operation.status === 'active').map((operation) => operation.id))
        const redoableIds = new Set(nextHistory.filter((operation) => operation.status === 'redoable').map((operation) => operation.id))
        setSelectedCollectionOperationUndoIds((current) => new Set([...current].filter((id) => undoableIds.has(id))))
        setSelectedCollectionOperationRedoIds((current) => new Set([...current].filter((id) => redoableIds.has(id))))
        collectionOperationHistoryDetailRequestVersionRef.current += 1
        setCollectionOperationHistoryDetailId(null)
        setCollectionOperationHistoryDetail(null)
        setIsLoadingCollectionOperationHistoryDetail(false)
      }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }
  const inspectCollectionOperation = (operationId: string): void => {
    if (collectionOperationHistoryDetailId === operationId) {
      collectionOperationHistoryDetailRequestVersionRef.current += 1
      setCollectionOperationHistoryDetailId(null)
      setCollectionOperationHistoryDetail(null)
      setIsLoadingCollectionOperationHistoryDetail(false)
      return
    }
    const version = ++collectionOperationHistoryDetailRequestVersionRef.current
    setCollectionOperationHistoryDetailId(operationId)
    setCollectionOperationHistoryDetail(null)
    setIsLoadingCollectionOperationHistoryDetail(true)
    setError(null)
    void window.aiv.getVisionClipCollectionOperationHistoryDetail(operationId).then((nextDetail) => {
      if (version !== collectionOperationHistoryDetailRequestVersionRef.current) return
      if (!nextDetail) {
        setCollectionOperationHistoryDetailId(null)
        setError(app.copy.vision.collectionOperationHistoryDetailUnavailable)
        return
      }
      setCollectionOperationHistoryDetail(nextDetail)
    }).catch((reason: unknown) => {
      if (version === collectionOperationHistoryDetailRequestVersionRef.current) {
        setCollectionOperationHistoryDetailId(null)
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    }).finally(() => {
      if (version === collectionOperationHistoryDetailRequestVersionRef.current) setIsLoadingCollectionOperationHistoryDetail(false)
    })
  }
  const closeCollectionOperationDetail = (): void => {
    collectionOperationHistoryDetailRequestVersionRef.current += 1
    setCollectionOperationHistoryDetailId(null)
    setCollectionOperationHistoryDetail(null)
    setIsLoadingCollectionOperationHistoryDetail(false)
  }

  const exportCollectionOperationHistory = (): void => {
    if (isCollectionBatchBusy || visibleCollectionOperationHistory.length === 0) return
    setError(null)
    setIsExportingCollectionOperationHistory(true)
    setCollectionTransferStatus(app.copy.vision.collectionOperationHistoryExporting)
    try {
      const exportedCount = downloadVisionClipCollectionOperationHistory(collectionOperationHistory, collectionOperationHistoryFilter)
      setCollectionTransferStatus(app.copy.vision.collectionOperationHistoryExported(exportedCount))
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsExportingCollectionOperationHistory(false)
    }
  }

  const applyCollectionOperationResult = (result: { collections: VisionClipCollection[]; deletedCollectionIds?: string[]; createdCollectionIds?: string[] }): void => {
    const deletedIds = new Set(result.deletedCollectionIds ?? [])
    const updatedById = new Map(result.collections.map((collection) => [collection.id, collection]))
    setCollections((current) => {
      const currentIds = new Set(current.map((collection) => collection.id))
      const next = current.filter((collection) => !deletedIds.has(collection.id)).map((collection) => updatedById.get(collection.id) ?? collection)
      for (const collection of result.collections) {
        if (!currentIds.has(collection.id) && !deletedIds.has(collection.id)) next.push(collection)
      }
      return next
    })
  }

  const toggleCollectionOperationSelection = (operationId: string, direction: CollectionOperationBatchDirection): void => {
    const setSelection = direction === 'undo' ? setSelectedCollectionOperationUndoIds : setSelectedCollectionOperationRedoIds
    setSelection((current) => {
      const next = new Set(current)
      if (next.has(operationId)) next.delete(operationId)
      else next.add(operationId)
      return next
    })
  }

  const toggleAllCollectionOperationSelection = (direction: CollectionOperationBatchDirection): void => {
    const operations = direction === 'undo' ? undoableCollectionOperationHistory : redoableCollectionOperationHistory
    const operationIds = operations.map((operation) => operation.id)
    const selected = direction === 'undo' ? selectedCollectionOperationUndoIds : selectedCollectionOperationRedoIds
    const setSelection = direction === 'undo' ? setSelectedCollectionOperationUndoIds : setSelectedCollectionOperationRedoIds
    const allVisibleSelected = operationIds.length > 0 && operationIds.every((operationId) => selected.has(operationId))
    setSelection((current) => {
      const next = new Set(current)
      if (allVisibleSelected) operationIds.forEach((operationId) => next.delete(operationId))
      else operationIds.forEach((operationId) => next.add(operationId))
      return next
    })
  }

  const clearCollectionOperationSelection = (): void => {
    setSelectedCollectionOperationUndoIds(new Set())
    setSelectedCollectionOperationRedoIds(new Set())
  }

  const removeCollectionOperationConflicts = (): void => {
    if (isCollectionBatchBusy || collectionOperationConflicts.length === 0) return
    const conflictIds = new Set(collectionOperationConflicts.map((conflict) => conflict.operationId))
    setSelectedCollectionOperationUndoIds((current) => new Set([...current].filter((operationId) => !conflictIds.has(operationId))))
    setSelectedCollectionOperationRedoIds((current) => new Set([...current].filter((operationId) => !conflictIds.has(operationId))))
    setCollectionOperationConflicts([])
    setError(null)
    setCollectionTransferStatus(app.copy.vision.collectionOperationHistoryConflictRemoved(conflictIds.size))
  }

  const toggleCollectionTagOperationSelection = (operationId: string, direction: VisionCollectionTagOperationBatchDirection): void => {
    const setSelection = direction === 'undo' ? setSelectedCollectionTagOperationUndoIds : setSelectedCollectionTagOperationRedoIds
    setSelection((current) => {
      const next = new Set(current)
      if (next.has(operationId)) next.delete(operationId)
      else next.add(operationId)
      return next
    })
  }

  const toggleAllCollectionTagOperationSelection = (direction: VisionCollectionTagOperationBatchDirection): void => {
    const operations = direction === 'undo' ? undoableCollectionTagOperationHistory : redoableCollectionTagOperationHistory
    const operationIds = operations.map((operation) => operation.id)
    if (operationIds.length === 0) return
    const selected = direction === 'undo' ? selectedCollectionTagOperationUndoIds : selectedCollectionTagOperationRedoIds
    const setSelection = direction === 'undo' ? setSelectedCollectionTagOperationUndoIds : setSelectedCollectionTagOperationRedoIds
    setSelection((current) => {
      const next = new Set(current)
      const allSelected = operationIds.every((id) => next.has(id))
      for (const id of operationIds) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const clearCollectionTagOperationSelection = (): void => {
    setSelectedCollectionTagOperationUndoIds(new Set())
    setSelectedCollectionTagOperationRedoIds(new Set())
  }

  const removeCollectionTagOperationConflicts = (): void => {
    if (isCollectionBatchBusy || collectionTagOperationConflicts.length === 0) return
    const conflictIds = new Set(collectionTagOperationConflicts.map((conflict) => conflict.operationId))
    setSelectedCollectionTagOperationUndoIds((current) => new Set([...current].filter((operationId) => !conflictIds.has(operationId))))
    setSelectedCollectionTagOperationRedoIds((current) => new Set([...current].filter((operationId) => !conflictIds.has(operationId))))
    setCollectionTagOperationConflicts([])
    setError(null)
    setCollectionTagTransferStatus(app.copy.vision.collectionTagManagerHistoryConflictRemoved(conflictIds.size))
  }

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
    refreshCollectionOperation()
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
      if (active) {
        setCollections(nextCollections)
        setHasLoadedCollections(true)
      }
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

  const updateCollection = async (collection: VisionClipCollection, patch: Partial<Pick<VisionClipCollection, 'title' | 'tags' | 'sortMode' | 'selections' | 'isFavorite' | 'isArchived'>>): Promise<VisionClipCollection | null> => {
    setError(null)
    try {
      const updated = await window.aiv.saveVisionClipCollection({
        id: collection.id,
        title: patch.title ?? collection.title,
        tags: patch.tags ?? collection.tags,
        sortMode: patch.sortMode ?? collection.sortMode,
        isFavorite: patch.isFavorite ?? collection.isFavorite,
        isArchived: patch.isArchived ?? collection.isArchived,
        selections: patch.selections ?? collection.selections
      })
      setCollections((current) => [updated, ...current.filter((item) => item.id !== updated.id)])
      return updated
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return null
    }
  }

  const updateCollectionSelections = async (collection: VisionClipCollection, selections: VisionClipSelection[]): Promise<VisionClipCollection | null> => {
    if (isCollectionBatchBusy) return null
    setIsUpdatingCollectionSelections(true)
    setError(null)
    try {
      const result = await window.aiv.updateVisionClipCollectionSelections({ collectionId: collection.id, selections })
      const updated = result.collection
      if (!result.success || !updated) {
        setError(result.message)
        return null
      }
      setCollections((current) => [updated, ...current.filter((item) => item.id !== updated.id)])
      refreshCollectionOperation()
      setCollectionTransferStatus(result.message)
      return updated
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return null
    } finally {
      setIsUpdatingCollectionSelections(false)
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
      const updated = await window.aiv.renameVisionClipCollection({ collectionId: collection.id, title })
      if (!updated) {
        setError(app.copy.vision.collectionRenameUnavailable)
        return
      }
      setCollections((current) => [updated, ...current.filter((item) => item.id !== updated.id)])
      refreshCollectionOperation()
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
      const result = await window.aiv.updateVisionClipCollectionTags({ collectionId: collection.id, tags })
      const updated = result.collection
      if (!result.success || !updated) {
        setError(result.message)
        return
      }
      setCollections((current) => [updated, ...current.filter((item) => item.id !== updated.id)])
      refreshCollectionTagOperation()
      setCollectionTransferStatus(result.message)
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
    if (isCollectionBatchBusy) return
    void updateCollectionSelections(collection, mergeVisionCollectionSelections(collection.selections))
  }

  const invertCollection = (collection: VisionClipCollection): void => {
    if (isCollectionBatchBusy) return
    const selections = invertVisionClipSelections(collection.selections)
    if (selections.length === 0) {
      setError('集合没有可反选的时间范围')
      return
    }
    void updateCollectionSelections(collection, selections)
  }

  const sortCollection = (collection: VisionClipCollection, sortMode: VisionClipCollectionSortMode): void => {
    updateCollection(collection, { sortMode })
  }

  const toggleCollectionFlag = async (collection: VisionClipCollection, flag: 'isFavorite' | 'isArchived'): Promise<void> => {
    if (isCollectionBatchBusy) return
    const enabled = !collection[flag]
    setUpdatingCollectionFlagId(collection.id)
    setError(null)
    try {
      const result = await window.aiv.updateVisionClipCollectionFlags({ collectionIds: [collection.id], [flag]: enabled })
      if (!result.success || result.collections.length === 0) {
        setError(result.message)
        return
      }
      const updated = result.collections[0]
      setCollections((current) => [updated, ...current.filter((item) => item.id !== updated.id)])
      refreshCollectionOperation()
      const label = flag === 'isFavorite'
        ? (enabled ? app.copy.vision.collectionStatusFavorite : app.copy.vision.collectionStatusUnfavorite)
        : (enabled ? app.copy.vision.collectionStatusArchived : app.copy.vision.collectionStatusUnarchived)
      setCollectionTransferStatus(app.copy.vision.collectionStatusUpdated(updated.title, label))
    } finally {
      setUpdatingCollectionFlagId(null)
    }
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
      refreshCollectionOperation()
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

  const toggleCollectionMergeSelection = (collectionId: string, selection: VisionClipSelection): void => {
    if (isCollectionBatchBusy) return
    const key = getCollectionMergeSelectionStateKey(collectionId, selection)
    setExcludedCollectionMergeSelectionKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const updateCollectionMergeRange = (collectionId: string, selection: VisionClipSelection, field: keyof CollectionMergeRangeOverride, value: string): void => {
    if (isCollectionBatchBusy) return
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) return
    const stateKey = getCollectionMergeSelectionStateKey(collectionId, selection)
    setCollectionMergeRangeOverrides((current) => {
      const currentRange = current[stateKey] ?? { startSeconds: selection.startSeconds, endSeconds: selection.endSeconds }
      const candidate = { ...currentRange, [field]: numericValue }
      const normalized = normalizeVisionTimeRange(candidate, selection.durationSeconds)
      if (!normalized) return current
      if (normalized.startSeconds === selection.startSeconds && normalized.endSeconds === selection.endSeconds) {
        const next = { ...current }
        delete next[stateKey]
        return next
      }
      return { ...current, [stateKey]: normalized }
    })
  }

  const resetCollectionMergeRange = (collectionId: string, selection: VisionClipSelection): void => {
    if (isCollectionBatchBusy) return
    const stateKey = getCollectionMergeSelectionStateKey(collectionId, selection)
    setCollectionMergeRangeOverrides((current) => {
      if (!current[stateKey]) return current
      const next = { ...current }
      delete next[stateKey]
      return next
    })
  }

  const applySavedCollectionFilter = (savedFilter: VisionClipCollectionSavedFilter): void => {
    setCollectionFilterQuery(savedFilter.query)
    const excludedTags = mergeVisionClipCollectionFilterTags(savedFilter.excludedTags, availableCollectionFilterTags)
    setCollectionFilterTags(mergeVisionClipCollectionFilterTags(savedFilter.tags, availableCollectionFilterTags).filter((tag) => !excludedTags.includes(tag)))
    setCollectionFilterExcludedTags(excludedTags)
    setCollectionFilterTagMode(savedFilter.tagMode)
    setCollectionFilterVisibility(savedFilter.visibility)
  }

  const saveCurrentCollectionFilter = (): void => {
    const name = savedCollectionFilterName.trim()
    if (savedCollectionFilterImportPreview !== null || !name || !hasCollectionFilter) return
    const now = Date.now()
    setSavedCollectionFilters((current) => {
      const existing = current.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())
      return upsertVisionClipCollectionSavedFilter(current, {
        id: existing?.id ?? createVisionClipCollectionSavedFilterId(),
        name,
        query: collectionFilterQuery,
        tags: collectionFilterTags,
        excludedTags: collectionFilterExcludedTags,
        tagMode: collectionFilterTagMode,
        visibility: collectionFilterVisibility,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      }, now)
    })
    setSavedCollectionFilterName('')
  }

  const deleteSavedCollectionFilter = (id: string): void => {
    setSavedCollectionFilters((current) => removeVisionClipCollectionSavedFilter(current, id))
  }

  const updateCollectionFilterTags = (event: ChangeEvent<HTMLSelectElement>, excluded: boolean): void => {
    const next = Array.from(event.currentTarget.selectedOptions, (option) => option.value)
    if (excluded) {
      setCollectionFilterExcludedTags(next)
      setCollectionFilterTags((current) => current.filter((tag) => !next.includes(tag)))
      return
    }
    setCollectionFilterTags(next)
    setCollectionFilterExcludedTags((current) => current.filter((tag) => !next.includes(tag)))
  }

  const clearCollectionFilters = (): void => {
    setCollectionFilterQuery('')
    setCollectionFilterTags([])
    setCollectionFilterExcludedTags([])
    setCollectionFilterTagMode('any')
    setCollectionFilterVisibility('all')
  }

  const removeCollectionFilterTag = (tag: string, excluded: boolean): void => {
    if (excluded) setCollectionFilterExcludedTags((current) => current.filter((selectedTag) => selectedTag !== tag))
    else setCollectionFilterTags((current) => current.filter((selectedTag) => selectedTag !== tag))
  }

  const exportSavedCollectionFilters = (): void => {
    if (isCollectionBatchBusy || savedCollectionFilterImportPreview !== null || savedCollectionFilters.length === 0) return
    setSavedCollectionFilterTransferStatus(null)
    downloadVisionClipCollectionSavedFilters(savedCollectionFilters)
    setSavedCollectionFilterTransferStatus(app.copy.vision.collectionFilterSavedViewsExported)
  }

  const importSavedCollectionFilters = (): void => {
    if (isCollectionBatchBusy || savedCollectionFilterImportPreview !== null) return
    setSavedCollectionFilterTransferStatus(null)
    savedCollectionFilterFileInputRef.current?.click()
  }

  const handleSavedCollectionFilterFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || isCollectionBatchBusy || savedCollectionFilterImportPreview !== null) return
    setError(null)
    setSavedCollectionFilterTransferStatus(null)
    void file.text().then((raw) => {
      const imported = parseVisionClipCollectionSavedFilterManifest(raw)
      const preview = createVisionClipCollectionSavedFilterImportPreview(savedCollectionFilters, imported)
      const defaultDecisions: Record<string, VisionClipCollectionSavedFilterImportDecision> = {}
      for (const item of preview) {
        if (item.state === 'conflict') defaultDecisions[item.incoming.id] = 'keep-local'
      }
      setSavedCollectionFilterImportDecisions(defaultDecisions)
      setSavedCollectionFilterImportPreview(preview)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const applySavedCollectionFilterImport = (): void => {
    if (!savedCollectionFilterImportPreview || isCollectionBatchBusy) return
    const result = applyVisionClipCollectionSavedFilterImportPreview(savedCollectionFilters, savedCollectionFilterImportPreview, savedCollectionFilterImportDecisions)
    setSavedCollectionFilters(result.filters)
    setSavedCollectionFilterImportPreview(null)
    setSavedCollectionFilterImportDecisions({})
    setSavedCollectionFilterTransferStatus(app.copy.vision.collectionFilterSavedViewsImported(result.importedCount, result.skippedCount))
  }

  const cancelSavedCollectionFilterImport = (): void => {
    if (isCollectionBatchBusy) return
    setSavedCollectionFilterImportPreview(null)
    setSavedCollectionFilterImportDecisions({})
    setSavedCollectionFilterTransferStatus(null)
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
      refreshCollectionOperation()
      setCollectionTransferStatus(app.copy.vision.collectionsDuplicated(result.collections.length, result.skippedCount))
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsDuplicatingCollections(false)
    }
  }

  const mergeSelectedCollections = async (): Promise<void> => {
    if (isCollectionBatchBusy || selectedCollectionsForRename.length < 2 || !collectionMergePreview) {
      if (!isCollectionBatchBusy && selectedCollectionsForRename.length < 2) setError(app.copy.vision.collectionMergeSelectionRequired)
      return
    }
    const collectionIds = selectedCollectionsForRename.map((collection) => collection.id)
    if (!window.confirm(app.copy.vision.collectionsMergeConfirm(collectionIds.length, collectionMergeTitleValue, collectionMergeSelectionCount))) return
    setIsMergingCollections(true)
    setError(null)
    try {
      const result = await window.aiv.mergeVisionClipCollections({ collectionIds, title: collectionMergeTitleValue, sortMode: 'source-time', selectedSelections: collectionMergeSelectedSelections })
      if (!result.success || !result.collection) {
        setError(result.message)
        return
      }
      setCollections((current) => [result.collection as VisionClipCollection, ...current.filter((item) => item.id !== result.collection?.id)])
      setSelectedCollectionIds(new Set())
      setCollectionMergeTitle('')
      setExcludedCollectionMergeSelectionKeys(new Set())
      setCollectionMergeRangeOverrides({})
      refreshCollectionOperation()
      setCollectionTransferStatus(app.copy.vision.collectionsMerged(result.sourceIds.length, result.collection.selections.length, result.skippedCount))
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsMergingCollections(false)
    }
  }

  const setSelectedCollectionFlag = async (flag: 'isFavorite' | 'isArchived', enabled: boolean): Promise<void> => {
    if (isCollectionBatchBusy || selectedCollectionsForRename.length === 0) return
    setIsUpdatingCollectionFlags(true)
    setError(null)
    try {
      const result = await window.aiv.updateVisionClipCollectionFlags({ collectionIds: selectedCollectionsForRename.map((collection) => collection.id), [flag]: enabled })
      if (!result.success) {
        setError(result.message)
        return
      }
      applyCollectionOperationResult(result)
      refreshCollectionOperation()
      const label = flag === 'isFavorite'
        ? (enabled ? app.copy.vision.collectionStatusFavorite : app.copy.vision.collectionStatusUnfavorite)
        : (enabled ? app.copy.vision.collectionStatusArchived : app.copy.vision.collectionStatusUnarchived)
      setCollectionTransferStatus(app.copy.vision.collectionsStatusUpdated(result.collections.length, label))
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsUpdatingCollectionFlags(false)
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
      refreshCollectionOperation()
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
      refreshCollectionOperation()
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

  const changeCollectionTagHistoryFilter = (filter: VisionClipCollectionTagOperationHistoryFilter): void => {
    if (isCollectionBatchBusy || isCollectionTagHistoryBusy) return
    setCollectionTagHistoryFilter(filter)
    refreshCollectionTagOperation(0, filter)
  }

  const changeCollectionTagHistoryPage = (direction: -1 | 1): void => {
    if (isCollectionBatchBusy || isCollectionTagHistoryBusy) return
    const nextOffset = Math.max(0, collectionTagHistoryOffset + direction * VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_PAGE_SIZE)
    if (direction < 0 && collectionTagHistoryOffset === 0) return
    if (direction > 0 && !collectionTagHistoryHasMore) return
    refreshCollectionTagOperation(nextOffset)
  }

  const inspectCollectionTagOperation = (operationId: string): void => {
    if (isCollectionBatchBusy || isCollectionTagHistoryBusy) return
    const version = ++collectionTagHistoryDetailRequestVersionRef.current
    setError(null)
    setCollectionTagHistoryDetailId(operationId)
    setCollectionTagHistoryDetail(null)
    setIsLoadingCollectionTagHistoryDetail(true)
    void window.aiv.getVisionClipCollectionTagOperationHistoryDetail(operationId).then((detail) => {
      if (version === collectionTagHistoryDetailRequestVersionRef.current) {
        if (!detail) {
          setCollectionTagHistoryDetailId(null)
          setError(app.copy.vision.collectionTagManagerHistoryDetailUnavailable)
          return
        }
        setCollectionTagHistoryDetail(detail)
      }
    }).catch((reason: unknown) => {
      if (version === collectionTagHistoryDetailRequestVersionRef.current) setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => {
      if (version === collectionTagHistoryDetailRequestVersionRef.current) setIsLoadingCollectionTagHistoryDetail(false)
    })
  }

  const closeCollectionTagOperationDetail = (): void => {
    ++collectionTagHistoryDetailRequestVersionRef.current
    setCollectionTagHistoryDetailId(null)
    setCollectionTagHistoryDetail(null)
    setIsLoadingCollectionTagHistoryDetail(false)
  }

  const exportCollectionTagOperationHistory = (): void => {
    if (isCollectionBatchBusy || isCollectionTagHistoryBusy || visibleCollectionTagOperationHistory.length === 0) return
    setError(null)
    setIsExportingCollectionTagHistory(true)
    setCollectionTagTransferStatus(app.copy.vision.collectionTagManagerHistoryExporting)
    void loadAllVisionClipCollectionTagOperationHistory(collectionTagHistoryFilter).then((entries) => {
      const exportedCount = downloadVisionClipCollectionTagOperationHistory(entries, collectionTagHistoryFilter)
      setCollectionTagTransferStatus(app.copy.vision.collectionTagManagerHistoryExported(exportedCount))
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsExportingCollectionTagHistory(false))
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

  const redoCollectionTagOperation = (): void => {
    if (isCollectionBatchBusy || !lastCollectionTagRedoOperation) return
    setIsRedoingCollectionTagOperation(true)
    setError(null)
    void window.aiv.redoVisionClipCollectionTagOperation().then((result) => {
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
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsRedoingCollectionTagOperation(false))
  }

  const undoSelectedCollectionTagOperations = (): void => {
    const operationIds = [...selectedCollectionTagOperationUndoIds]
    if (isCollectionBatchBusy || operationIds.length === 0) return
    setIsUndoingCollectionTagOperation(true)
    setError(null)
    void window.aiv.undoVisionClipCollectionTagOperations(operationIds).then((result) => {
      if (!result.success) {
        setCollectionTagOperationConflicts(result.conflicts ?? [])
        setError(result.message)
        return
      }
      const updatedById = new Map(result.collections.map((collection) => [collection.id, collection]))
      setCollections((current) => current.map((collection) => updatedById.get(collection.id) ?? collection))
      setCollectionTagMetadata(result.metadata)
      setCollectionTagOperationConflicts([])
      clearCollectionTagOperationSelection()
      setCollectionTagToManage('')
      setCollectionTagRenameTarget('')
      refreshCollectionTagOperation()
      setCollectionTransferStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsUndoingCollectionTagOperation(false))
  }

  const redoSelectedCollectionTagOperations = (): void => {
    const operationIds = [...selectedCollectionTagOperationRedoIds]
    if (isCollectionBatchBusy || operationIds.length === 0) return
    setIsRedoingCollectionTagOperation(true)
    setError(null)
    void window.aiv.redoVisionClipCollectionTagOperations(operationIds).then((result) => {
      if (!result.success) {
        setCollectionTagOperationConflicts(result.conflicts ?? [])
        setError(result.message)
        return
      }
      const updatedById = new Map(result.collections.map((collection) => [collection.id, collection]))
      setCollections((current) => current.map((collection) => updatedById.get(collection.id) ?? collection))
      setCollectionTagMetadata(result.metadata)
      setCollectionTagOperationConflicts([])
      clearCollectionTagOperationSelection()
      setCollectionTagToManage('')
      setCollectionTagRenameTarget('')
      refreshCollectionTagOperation()
      setCollectionTransferStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsRedoingCollectionTagOperation(false))
  }

  const undoCollectionOperation = (operationId?: string): void => {
    if (isCollectionBatchBusy || (operationId === undefined && !lastCollectionOperation)) return
    setIsUndoingCollectionOperation(true)
    setError(null)
    void window.aiv.undoVisionClipCollectionOperation(operationId).then((result) => {
      if (!result.success) {
        setError(operationId === undefined ? result.message : app.copy.vision.collectionOperationHistoryUndoUnavailable)
        return
      }
      applyCollectionOperationResult(result)
      refreshCollectionOperation()
      setCollectionTransferStatus(operationId === undefined ? app.copy.vision.collectionOperationUndoSuccess : app.copy.vision.collectionOperationHistoryUndoSuccess)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsUndoingCollectionOperation(false))
  }

  const redoCollectionOperation = (operationId?: string): void => {
    if (isCollectionBatchBusy || (operationId === undefined && !lastCollectionRedoOperation)) return
    setIsRedoingCollectionOperation(true)
    setError(null)
    void window.aiv.redoVisionClipCollectionOperation(operationId).then((result) => {
      if (!result.success) {
        setError(operationId === undefined ? result.message : app.copy.vision.collectionOperationHistoryRedoUnavailable)
        return
      }
      applyCollectionOperationResult(result)
      refreshCollectionOperation()
      setCollectionTransferStatus(operationId === undefined ? app.copy.vision.collectionOperationRedoSuccess : app.copy.vision.collectionOperationHistoryRedoSuccess)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsRedoingCollectionOperation(false))
  }

  const undoSelectedCollectionOperations = (): void => {
    const operationIds = [...selectedCollectionOperationUndoIds]
    if (isCollectionBatchBusy || operationIds.length === 0) return
    setIsUndoingCollectionOperation(true)
    setError(null)
    void window.aiv.undoVisionClipCollectionOperations(operationIds).then((result) => {
      if (!result.success) {
        setCollectionOperationConflicts(result.conflicts ?? [])
        setError(result.message)
        return
      }
      applyCollectionOperationResult(result)
      setCollectionOperationConflicts([])
      clearCollectionOperationSelection()
      refreshCollectionOperation()
      setCollectionTransferStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsUndoingCollectionOperation(false))
  }

  const redoSelectedCollectionOperations = (): void => {
    const operationIds = [...selectedCollectionOperationRedoIds]
    if (isCollectionBatchBusy || operationIds.length === 0) return
    setIsRedoingCollectionOperation(true)
    setError(null)
    void window.aiv.redoVisionClipCollectionOperations(operationIds).then((result) => {
      if (!result.success) {
        setCollectionOperationConflicts(result.conflicts ?? [])
        setError(result.message)
        return
      }
      applyCollectionOperationResult(result)
      setCollectionOperationConflicts([])
      clearCollectionOperationSelection()
      refreshCollectionOperation()
      setCollectionTransferStatus(result.message)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsRedoingCollectionOperation(false))
  }

  const repairCollection = async (collection: VisionClipCollection): Promise<void> => {
    if (repairingCollectionId || isCollectionBatchBusy) return
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
      await updateCollectionSelections(collection, repairedSelections)
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
    if (isCollectionBatchBusy) return
    setIsDeletingCollections(true)
    setError(null)
    void window.aiv.deleteVisionClipCollection(collection.id).then((deleted) => {
      if (!deleted) return
      setCollections((current) => current.filter((item) => item.id !== collection.id))
      setSelectedCollectionIds((current) => {
        const next = new Set(current)
        next.delete(collection.id)
        return next
      })
      refreshCollectionOperation()
      setCollectionTransferStatus(app.copy.vision.collectionsDeleted(1, 0))
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setIsDeletingCollections(false))
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

  const collectionBatchMergeAction = selectedCollectionIds.size > 0
    ? <section className="vision-card vision-collection-batch-merge">
      <div className="vision-collection-batch-merge-heading"><strong>{app.copy.vision.mergeSelectedCollections}</strong><small>{app.copy.vision.collectionMergeDescription}</small></div>
      <div className="vision-collection-batch-merge-controls"><label><span>{app.copy.vision.collectionMergeTitleLabel}</span><input className="vision-collection-merge-title-input" value={collectionMergeTitle} maxLength={200} onChange={(event) => setCollectionMergeTitle(event.target.value)} placeholder={app.copy.vision.collectionMergeDefaultTitle} aria-label={app.copy.vision.collectionMergeTitleLabel} disabled={isCollectionBatchBusy} /></label><button className="vision-secondary-action" type="button" onClick={() => void mergeSelectedCollections()} disabled={isCollectionBatchBusy || selectedCollectionIds.size < 2 || selectedCollectionsForRename.length < 2 || !collectionMergePreview}>{app.copy.vision.mergeSelectedCollections}</button></div>
      {selectedCollectionsForRename.length < 2
        ? <small className="vision-collection-merge-hint">{app.copy.vision.collectionMergeSelectionRequired}</small>
        : <div className="vision-collection-merge-preview" role="region" aria-label={app.copy.vision.collectionMergePreviewTitle}>
          <strong>{app.copy.vision.collectionMergePreviewTitle}</strong>
          <small>{collectionMergePreview ? app.copy.vision.collectionMergePreviewSummary(collectionMergePreview.collection.selections.length, collectionMergePreviewTags.length) : app.copy.vision.collectionMergePreviewUnavailable}</small>
          <small>{app.copy.vision.collectionMergePreviewSelected(collectionMergeSelectionCount)}</small>
          <div className="vision-collection-merge-preview-sources" role="list" aria-label={app.copy.vision.collectionMergePreviewSources(collectionMergePreviewSources.length)}>
            {collectionMergePreviewSources.map((source) => <div className="vision-collection-merge-preview-source" key={source.collectionId} role="listitem"><strong>{source.title}</strong><div className="vision-collection-merge-preview-source-ranges">{source.selections.length > 0 ? source.selections.map((selection, index) => {
              const selectionStateKey = getCollectionMergeSelectionStateKey(source.collectionId, selection)
              const rangeOverride = collectionMergeRangeOverrides[selectionStateKey]
              const displaySelection = rangeOverride ? { ...selection, ...rangeOverride } : selection
              const range = formatClipPreviewRange(displaySelection)
              const originalRange = formatClipPreviewRange(selection)
              return <div className="vision-collection-merge-preview-selection" key={`${selectionStateKey}-${index}`}>
                <label className="vision-collection-merge-preview-selection-toggle"><input type="checkbox" checked={!excludedCollectionMergeSelectionKeys.has(selectionStateKey)} onChange={() => toggleCollectionMergeSelection(source.collectionId, selection)} disabled={isCollectionBatchBusy} aria-label={app.copy.vision.collectionMergePreviewSelectionAriaLabel(range)} /><span>{range}</span></label>
                <div className="vision-collection-merge-preview-range-controls"><label><span>{app.copy.vision.collectionMergePreviewStart}</span><input type="number" min={0} max={selection.durationSeconds} step={0.1} value={displaySelection.startSeconds} onChange={(event) => updateCollectionMergeRange(source.collectionId, selection, 'startSeconds', event.currentTarget.value)} disabled={isCollectionBatchBusy} aria-label={`${app.copy.vision.collectionMergePreviewStart}: ${range}`} /></label><label><span>{app.copy.vision.collectionMergePreviewEnd}</span><input type="number" min={0} max={selection.durationSeconds} step={0.1} value={displaySelection.endSeconds} onChange={(event) => updateCollectionMergeRange(source.collectionId, selection, 'endSeconds', event.currentTarget.value)} disabled={isCollectionBatchBusy} aria-label={`${app.copy.vision.collectionMergePreviewEnd}: ${range}`} /></label>{rangeOverride ? <button className="vision-collection-merge-preview-reset" type="button" onClick={() => resetCollectionMergeRange(source.collectionId, selection)} disabled={isCollectionBatchBusy} aria-label={`${app.copy.vision.collectionMergePreviewResetRange}: ${originalRange}`}>{app.copy.vision.collectionMergePreviewResetRange}</button> : null}</div>
              </div>
            }) : <small>{app.copy.vision.collectionMergePreviewNoSelections}</small>}</div></div>)}
          </div>
          {collectionMergePreview ? <>
            <div className="vision-collection-merge-preview-output" role="group" aria-label={app.copy.vision.collectionMergePreviewOutputTitle}><strong>{app.copy.vision.collectionMergePreviewOutputTitle}</strong><div className="vision-collection-merge-preview-output-ranges" role="list" aria-label={app.copy.vision.collectionMergePreviewOutputTitle}>{collectionMergePreview.collection.selections.map((selection, index) => <span key={`${selection.sourceId}-${selection.startSeconds}-${index}`} role="listitem">{formatClipPreviewRange(selection)}</span>)}</div></div>
            <small>{app.copy.vision.collectionMergePreviewTags}: {collectionMergePreviewTags.join(' · ') || app.copy.vision.collectionTagsEmpty}</small>
          </> : null}
        </div>}
    </section>
    : null

  const collectionOperationDetailDiffs = collectionOperationHistoryDetail ? diffVisionClipCollectionOperationDetails(collectionOperationHistoryDetail.beforeCollections, collectionOperationHistoryDetail.afterCollections) : []

  return <div className="vision-panel">
    {collectionBatchMergeAction}
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
      <details className="vision-collection-tag-history" open>
        <summary className="vision-collection-tag-history-summary"><span><strong>{app.copy.vision.collectionTagManagerHistoryTitle}</strong><small>{app.copy.vision.collectionTagManagerHistoryDescription}</small></span><b>{collectionTagHistoryTotal}</b></summary>
        <div className="vision-collection-tag-history-toolbar">
          <label><span>{app.copy.vision.collectionTagManagerHistoryFilterLabel}</span><select value={collectionTagHistoryFilter} onChange={(event) => changeCollectionTagHistoryFilter(event.target.value as VisionClipCollectionTagOperationHistoryFilter)} aria-label={app.copy.vision.collectionTagManagerHistoryFilterLabel} disabled={isCollectionBatchBusy || isCollectionTagHistoryBusy}>
            <option value="all">{app.copy.vision.collectionTagManagerHistoryFilterAll}</option>
            <option value="cleanup">{app.copy.vision.collectionTagManagerHistoryType.cleanup}</option>
            <option value="rename">{app.copy.vision.collectionTagManagerHistoryType.rename}</option>
            <option value="metadata">{app.copy.vision.collectionTagManagerHistoryType.metadata}</option>
            <option value="batch">{app.copy.vision.collectionTagManagerHistoryType.batch}</option>
            <option value="single">{app.copy.vision.collectionTagManagerHistoryType.single}</option>
          </select></label>
          <button className="vision-secondary-action" type="button" onClick={exportCollectionTagOperationHistory} disabled={isCollectionBatchBusy || isCollectionTagHistoryBusy || visibleCollectionTagOperationHistory.length === 0}><Download size={12} />{app.copy.vision.collectionTagManagerHistoryExport}</button>
        </div>
        {visibleCollectionTagOperationHistory.length > 0 ? <div className="vision-collection-tag-history-selection-toolbar" role="group" aria-label={app.copy.vision.collectionTagManagerHistoryTitle}>
          <span className="vision-collection-tag-history-selection-count" role="status">{app.copy.vision.collectionTagManagerHistorySelectedCount(selectedCollectionTagOperationCount)}</span>
          <div className="vision-collection-tag-history-selection-actions">
            {undoableCollectionTagOperationHistory.length > 0 ? <><button className="vision-collection-tag-history-selection-action" type="button" onClick={() => toggleAllCollectionTagOperationSelection('undo')} disabled={isCollectionBatchBusy} aria-pressed={undoableCollectionTagOperationHistory.every((operation) => selectedCollectionTagOperationUndoIds.has(operation.id))}>{app.copy.vision.collectionTagManagerHistorySelectAllUndo}</button>{selectedCollectionTagOperationUndoIds.size > 0 ? <button className="vision-collection-tag-history-batch-action" type="button" onClick={undoSelectedCollectionTagOperations} disabled={isCollectionBatchBusy}><Undo2 size={11} />{app.copy.vision.collectionTagManagerHistoryBatchUndo}</button> : null}</> : null}
            {redoableCollectionTagOperationHistory.length > 0 ? <><button className="vision-collection-tag-history-selection-action" type="button" onClick={() => toggleAllCollectionTagOperationSelection('redo')} disabled={isCollectionBatchBusy} aria-pressed={redoableCollectionTagOperationHistory.every((operation) => selectedCollectionTagOperationRedoIds.has(operation.id))}>{app.copy.vision.collectionTagManagerHistorySelectAllRedo}</button>{selectedCollectionTagOperationRedoIds.size > 0 ? <button className="vision-collection-tag-history-batch-action" type="button" onClick={redoSelectedCollectionTagOperations} disabled={isCollectionBatchBusy}><Redo2 size={11} />{app.copy.vision.collectionTagManagerHistoryBatchRedo}</button> : null}</> : null}
            {selectedCollectionTagOperationCount > 0 ? <button className="vision-collection-tag-history-selection-action" type="button" onClick={clearCollectionTagOperationSelection} disabled={isCollectionBatchBusy}>{app.copy.vision.collectionTagManagerHistoryClearSelection}</button> : null}
          </div>
        </div> : null}
        {collectionTagOperationConflicts.length > 0 ? <div className="vision-collection-tag-history-conflicts" role="alert">
          <div className="vision-collection-tag-history-conflicts-heading"><strong>{app.copy.vision.collectionTagManagerHistoryConflictTitle}</strong><small>{app.copy.vision.collectionTagManagerHistoryConflictDescription(collectionTagOperationConflicts.length)}</small></div>
          <ul>
            {collectionTagOperationConflicts.slice(0, 5).map((conflict) => <li key={`${conflict.operationId}:${conflict.reason}`}><strong>{conflict.operationType ? app.copy.vision.collectionTagManagerHistoryType[conflict.operationType] : conflict.operationId}</strong><code>{conflict.operationId.slice(0, 8)}</code><small>{app.copy.vision.collectionTagManagerHistoryConflictReason[conflict.reason]}</small></li>)}
          </ul>
          {collectionTagOperationConflicts.length > 5 ? <small>{app.copy.vision.collectionTagManagerHistoryConflictMore(collectionTagOperationConflicts.length - 5)}</small> : null}
          <button className="vision-secondary-action" type="button" onClick={removeCollectionTagOperationConflicts} disabled={isCollectionBatchBusy}>{app.copy.vision.collectionTagManagerHistoryConflictRemove}</button>
        </div> : null}
        {visibleCollectionTagOperationHistory.length > 0 ? <div className="vision-collection-tag-history-list" role="list" aria-label={app.copy.vision.collectionTagManagerHistoryTitle}>
          {visibleCollectionTagOperationHistory.map((operation) => <div className={`vision-collection-tag-history-entry is-${operation.status}`} key={operation.id} role="listitem">
            <div className="vision-collection-tag-history-entry-main">
              {operation.status === 'active' ? <input className="vision-collection-tag-history-select" type="checkbox" checked={selectedCollectionTagOperationUndoIds.has(operation.id)} onChange={() => toggleCollectionTagOperationSelection(operation.id, 'undo')} aria-label={app.copy.vision.collectionTagManagerHistorySelectUndo(app.copy.vision.collectionTagManagerHistoryType[operation.type])} disabled={isCollectionBatchBusy} /> : operation.status === 'redoable' ? <input className="vision-collection-tag-history-select" type="checkbox" checked={selectedCollectionTagOperationRedoIds.has(operation.id)} onChange={() => toggleCollectionTagOperationSelection(operation.id, 'redo')} aria-label={app.copy.vision.collectionTagManagerHistorySelectRedo(app.copy.vision.collectionTagManagerHistoryType[operation.type])} disabled={isCollectionBatchBusy} /> : <span className="vision-collection-tag-history-select-placeholder" aria-hidden="true" />}
              <strong>{app.copy.vision.collectionTagManagerHistoryType[operation.type]}</strong>
            </div>
            <time dateTime={new Date(operation.createdAt).toISOString()}>{new Date(operation.createdAt).toLocaleString()}</time>
            <small>{app.copy.vision.collectionTagManagerHistoryStatus[operation.status]}</small>
            <button className="vision-collection-tag-history-detail-action" type="button" onClick={() => inspectCollectionTagOperation(operation.id)} disabled={isCollectionBatchBusy || isCollectionTagHistoryBusy} aria-current={collectionTagHistoryDetailId === operation.id ? 'true' : undefined} aria-label={`${app.copy.vision.collectionTagManagerHistoryViewDetail}: ${app.copy.vision.collectionTagManagerHistoryType[operation.type]}`}>{app.copy.vision.collectionTagManagerHistoryViewDetail}</button>
          </div>)}
        </div> : <small className="vision-collection-tag-history-empty">{collectionTagHistoryTotal > 0 ? app.copy.vision.collectionTagManagerHistoryFilterEmpty : app.copy.vision.collectionTagManagerHistoryEmpty}</small>}
        {isLoadingCollectionTagHistoryDetail ? <small className="vision-collection-tag-history-detail-loading" role="status">{app.copy.vision.collectionTagManagerHistoryDetailLoading}</small> : null}
        {collectionTagHistoryDetail ? <div className="vision-collection-tag-history-detail" role="region" aria-label={app.copy.vision.collectionTagManagerHistoryDetailTitle}>
          <div className="vision-collection-tag-history-detail-heading"><strong>{app.copy.vision.collectionTagManagerHistoryDetailTitle}</strong><button className="vision-secondary-action" type="button" onClick={closeCollectionTagOperationDetail}>{app.copy.vision.collectionTagManagerHistoryDetailClose}</button></div>
          <dl>
            <div><dt>{app.copy.vision.collectionTagManagerHistoryDetailType}</dt><dd>{app.copy.vision.collectionTagManagerHistoryType[collectionTagHistoryDetail.type]}</dd></div>
            <div><dt>{app.copy.vision.collectionTagManagerHistoryDetailId}</dt><dd><code>{collectionTagHistoryDetail.id}</code></dd></div>
            <div><dt>{app.copy.vision.collectionTagManagerHistoryDetailCreatedAt}</dt><dd><time dateTime={new Date(collectionTagHistoryDetail.createdAt).toISOString()}>{new Date(collectionTagHistoryDetail.createdAt).toLocaleString()}</time></dd></div>
            <div><dt>{app.copy.vision.collectionTagManagerHistoryDetailUndoneAt}</dt><dd>{collectionTagHistoryDetail.undoneAt === null ? app.copy.vision.collectionTagManagerHistoryDetailNeverUndone : new Date(collectionTagHistoryDetail.undoneAt).toLocaleString()}</dd></div>
            <div><dt>{app.copy.vision.collectionTagManagerHistoryDetailCollectionCount}</dt><dd>{app.copy.vision.collectionTagManagerHistoryDetailCollectionCountValue(collectionTagHistoryDetail.collectionCount)}</dd></div>
            <div><dt>{app.copy.vision.collectionTagManagerHistoryDetailMetadataCount}</dt><dd>{app.copy.vision.collectionTagManagerHistoryDetailMetadataCountValue(collectionTagHistoryDetail.metadataCount)}</dd></div>
          </dl>
        </div> : null}
        {collectionTagHistoryPageCount > 0 ? <div className="vision-collection-tag-history-pagination" aria-label={app.copy.vision.collectionTagManagerHistoryPaginationLabel}>
          <button className="vision-secondary-action" type="button" onClick={() => changeCollectionTagHistoryPage(-1)} disabled={isCollectionBatchBusy || isCollectionTagHistoryBusy || collectionTagHistoryOffset === 0}>{app.copy.vision.collectionTagManagerHistoryPreviousPage}</button>
          <small aria-live="polite">{app.copy.vision.collectionTagManagerHistoryPage(collectionTagHistoryPageNumber, collectionTagHistoryPageCount)}</small>
          <button className="vision-secondary-action" type="button" onClick={() => changeCollectionTagHistoryPage(1)} disabled={isCollectionBatchBusy || isCollectionTagHistoryBusy || !collectionTagHistoryHasMore}>{app.copy.vision.collectionTagManagerHistoryNextPage}</button>
        </div> : null}
      </details>
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
        {lastCollectionTagRedoOperation ? <div className="vision-collection-tag-manager-redo"><small>{app.copy.vision.collectionTagManagerRedoDescription}</small><button className="vision-secondary-action" type="button" onClick={redoCollectionTagOperation} disabled={isCollectionBatchBusy}><Redo2 size={13} />{app.copy.vision.collectionTagManagerRedo}</button></div> : null}
      </> : <div className="vision-collection-tag-manager-empty">{app.copy.vision.collectionTagManagerEmpty}</div>}
    </div> : null}
    {collections.length > 0 ? <div className="vision-card vision-collection-saved-filters">
      <div className="vision-saved-search-toolbar">
        <input className="vision-saved-search-name-input" value={savedCollectionFilterName} onChange={(event) => setSavedCollectionFilterName(event.target.value)} placeholder={app.copy.vision.collectionFilterSavedViewNamePlaceholder} aria-label={app.copy.vision.collectionFilterSavedViewNamePlaceholder} disabled={isCollectionBatchBusy || savedCollectionFilterImportPreview !== null} />
        <button className="vision-secondary-action" type="button" onClick={saveCurrentCollectionFilter} disabled={isCollectionBatchBusy || savedCollectionFilterImportPreview !== null || !hasCollectionFilter || !savedCollectionFilterName.trim()}>{app.copy.vision.collectionFilterSaveView}</button>
      </div>
      <div className="vision-saved-searches" aria-label={app.copy.vision.collectionFilterSavedViewsLabel}>
        <div className="vision-saved-search-heading-row">
          <strong className="vision-saved-search-heading">{app.copy.vision.collectionFilterSavedViewsLabel}</strong>
          <div className="vision-saved-search-actions">
            <button className="vision-secondary-action" type="button" onClick={importSavedCollectionFilters} disabled={isCollectionBatchBusy || savedCollectionFilterImportPreview !== null}><Upload size={12} />{app.copy.vision.collectionFilterSavedViewsImport}</button>
            <button className="vision-secondary-action" type="button" onClick={exportSavedCollectionFilters} disabled={isCollectionBatchBusy || savedCollectionFilterImportPreview !== null || savedCollectionFilters.length === 0}><Download size={12} />{app.copy.vision.collectionFilterSavedViewsExport}</button>
            <input ref={savedCollectionFilterFileInputRef} hidden type="file" accept="application/json,.json" onChange={handleSavedCollectionFilterFile} />
          </div>
        </div>
        {savedCollectionFilterImportPreview ? <div className="vision-saved-search-import-preview" role="dialog" aria-label={app.copy.vision.collectionFilterSavedViewsImportPreviewTitle}>
          <div className="vision-saved-search-import-preview-heading"><strong>{app.copy.vision.collectionFilterSavedViewsImportPreviewTitle}</strong><small>{app.copy.vision.collectionFilterSavedViewsImportPreviewDescription(savedCollectionFilterImportConflicts.length, savedCollectionFilterImportNewCount, savedCollectionFilterImportSkippedCount)}</small></div>
          {savedCollectionFilterImportConflicts.length > 0 ? <div className="vision-saved-search-import-conflicts" role="list">
            {savedCollectionFilterImportConflicts.map((item) => <div className="vision-saved-search-import-conflict" key={item.incoming.id} role="listitem">
              <div><strong>{item.incoming.name}</strong><small>{item.current?.name ?? '—'} → {item.incoming.query || app.copy.vision.collectionFilterTagAll}{item.incoming.tags.length > 0 ? ` · ${item.incoming.tags.join(' · ')}` : ''}{item.incoming.excludedTags.length > 0 ? ` · ${app.copy.vision.collectionFilterExcludedTagsLabel}: ${item.incoming.excludedTags.join(' · ')}` : ''}{item.incoming.visibility !== 'all' ? ` · ${app.copy.vision.collectionFilterVisibilityLabel}: ${item.incoming.visibility === 'favorites' ? app.copy.vision.collectionFilterVisibilityFavorites : item.incoming.visibility === 'archived' ? app.copy.vision.collectionFilterVisibilityArchived : app.copy.vision.collectionFilterVisibilityActive}` : ''}</small></div>
              <label><span>{app.copy.vision.collectionFilterSavedViewsImportDecisionLabel}</span><select value={savedCollectionFilterImportDecisions[item.incoming.id] ?? 'keep-local'} aria-label={`${app.copy.vision.collectionFilterSavedViewsImportDecisionLabel}: ${item.incoming.name}`} onChange={(event) => setSavedCollectionFilterImportDecisions((current) => ({ ...current, [item.incoming.id]: event.target.value as VisionClipCollectionSavedFilterImportDecision }))} disabled={isCollectionBatchBusy}><option value="overwrite">{app.copy.vision.collectionFilterSavedViewsImportOverwrite}</option><option value="keep-local">{app.copy.vision.collectionFilterSavedViewsImportKeepLocal}</option><option value="skip">{app.copy.vision.collectionFilterSavedViewsImportSkip}</option></select></label>
            </div>)}
          </div> : <small className="vision-saved-search-import-preview-empty">{app.copy.vision.collectionFilterSavedViewsImportPreviewNoConflicts}</small>}
          <div className="vision-saved-search-import-preview-actions"><button className="vision-primary-action" type="button" onClick={applySavedCollectionFilterImport} disabled={isCollectionBatchBusy}><Check size={12} />{app.copy.vision.collectionFilterSavedViewsImportApply}</button><button className="vision-secondary-action" type="button" onClick={cancelSavedCollectionFilterImport} disabled={isCollectionBatchBusy}><X size={12} />{app.copy.vision.collectionFilterSavedViewsImportCancel}</button></div>
        </div> : null}
        {savedCollectionFilters.length > 0 ? <div className="vision-saved-search-list" role="list">{savedCollectionFilters.map((savedFilter) => <div className="vision-saved-search" key={savedFilter.id} role="listitem">
          <button className="vision-saved-search-button" type="button" onClick={() => applySavedCollectionFilter(savedFilter)} disabled={isCollectionBatchBusy || savedCollectionFilterImportPreview !== null} aria-label={`${app.copy.vision.collectionFilterApplyView}: ${savedFilter.name}`}>
            <strong>{savedFilter.name}</strong>
            <small>{savedFilter.query || app.copy.vision.collectionFilterTagAll}{savedFilter.tags.length > 0 ? ` · ${savedFilter.tags.join(' · ')}` : ''}{savedFilter.tags.length > 1 ? ` · ${savedFilter.tagMode === 'all' ? app.copy.vision.collectionFilterTagModeAll : app.copy.vision.collectionFilterTagModeAny}` : ''}{savedFilter.excludedTags.length > 0 ? ` · ${app.copy.vision.collectionFilterExcludedTagsLabel}: ${savedFilter.excludedTags.join(' · ')}` : ''}{savedFilter.visibility !== 'all' ? ` · ${app.copy.vision.collectionFilterVisibilityLabel}: ${savedFilter.visibility === 'favorites' ? app.copy.vision.collectionFilterVisibilityFavorites : savedFilter.visibility === 'archived' ? app.copy.vision.collectionFilterVisibilityArchived : app.copy.vision.collectionFilterVisibilityActive}` : ''}</small>
          </button>
          <button className="vision-saved-search-delete" type="button" onClick={() => deleteSavedCollectionFilter(savedFilter.id)} title={app.copy.vision.collectionFilterDeleteView} aria-label={`${app.copy.vision.collectionFilterDeleteView}: ${savedFilter.name}`} disabled={isCollectionBatchBusy || savedCollectionFilterImportPreview !== null}><Trash2 size={14} /></button>
        </div>)}</div> : <small className="vision-saved-search-empty">{app.copy.vision.collectionFilterSavedViewEmpty}</small>}
        {savedCollectionFilterTransferStatus ? <small className="vision-saved-search-status" role="status">{savedCollectionFilterTransferStatus}</small> : null}
      </div>
    </div> : null}
    {collections.length > 0 && collectionTagStats.length === 0 && lastCollectionTagOperation ? <div className="vision-card vision-collection-tag-undo-only"><small>{app.copy.vision.collectionTagManagerUndoDescription}</small><button className="vision-secondary-action" type="button" onClick={undoCollectionTagOperation} disabled={isCollectionBatchBusy}><Undo2 size={13} />{app.copy.vision.collectionTagManagerUndo}</button></div> : null}
    {collections.length > 0 && collectionTagStats.length === 0 && lastCollectionTagRedoOperation ? <div className="vision-card vision-collection-tag-redo-only"><small>{app.copy.vision.collectionTagManagerRedoDescription}</small><button className="vision-secondary-action" type="button" onClick={redoCollectionTagOperation} disabled={isCollectionBatchBusy}><Redo2 size={13} />{app.copy.vision.collectionTagManagerRedo}</button></div> : null}
    {lastCollectionOperation ? <div className="vision-card vision-collection-operation-undo"><small>{app.copy.vision.collectionOperationUndoDescription}</small><button className="vision-secondary-action" type="button" onClick={() => undoCollectionOperation()} disabled={isCollectionBatchBusy}><Undo2 size={13} />{app.copy.vision.collectionOperationUndo}</button></div> : null}
    {lastCollectionRedoOperation ? <div className="vision-card vision-collection-operation-redo"><small>{app.copy.vision.collectionOperationRedoDescription}</small><button className="vision-secondary-action" type="button" onClick={() => redoCollectionOperation()} disabled={isCollectionBatchBusy}><Redo2 size={13} />{app.copy.vision.collectionOperationRedo}</button></div> : null}
    {collectionOperationHistory.length > 0 ? <div className="vision-card vision-collection-operation-history">
      <div className="vision-collection-operation-history-heading"><span><strong>{app.copy.vision.collectionOperationHistoryTitle}</strong><small>{app.copy.vision.collectionOperationHistoryDescription}</small></span><b>{app.copy.vision.collectionOperationHistoryCount(visibleCollectionOperationHistory.length)}</b></div>
      <div className="vision-collection-operation-history-toolbar">
        <label><span>{app.copy.vision.collectionOperationHistoryFilterTypeLabel}</span><select value={collectionOperationHistoryTypeFilter} onChange={(event) => setCollectionOperationHistoryTypeFilter(event.target.value as VisionClipCollectionOperationHistoryTypeFilter)} aria-label={app.copy.vision.collectionOperationHistoryFilterTypeLabel} disabled={isCollectionBatchBusy}>
          <option value="all">{app.copy.vision.collectionOperationHistoryFilterTypeAll}</option>
          <option value="flags">{app.copy.vision.collectionOperationTypeLabel.flags}</option>
          <option value="merge">{app.copy.vision.collectionOperationTypeLabel.merge}</option>
          <option value="delete">{app.copy.vision.collectionOperationTypeLabel.delete}</option>
          <option value="rename">{app.copy.vision.collectionOperationTypeLabel.rename}</option>
          <option value="duplicate">{app.copy.vision.collectionOperationTypeLabel.duplicate}</option>
          <option value="content">{app.copy.vision.collectionOperationTypeLabel.content}</option>
        </select></label>
        <label><span>{app.copy.vision.collectionOperationHistoryFilterStatusLabel}</span><select value={collectionOperationHistoryStatusFilter} onChange={(event) => setCollectionOperationHistoryStatusFilter(event.target.value as VisionClipCollectionOperationHistoryStatusFilter)} aria-label={app.copy.vision.collectionOperationHistoryFilterStatusLabel} disabled={isCollectionBatchBusy}>
          <option value="all">{app.copy.vision.collectionOperationHistoryFilterStatusAll}</option>
          <option value="active">{app.copy.vision.collectionOperationHistoryStatusLabel.active}</option>
          <option value="undone">{app.copy.vision.collectionOperationHistoryStatusLabel.undone}</option>
          <option value="redoable">{app.copy.vision.collectionOperationHistoryStatusLabel.redoable}</option>
        </select></label>
        <button className="vision-secondary-action" type="button" onClick={exportCollectionOperationHistory} disabled={isCollectionBatchBusy || visibleCollectionOperationHistory.length === 0}><Download size={12} />{isExportingCollectionOperationHistory ? app.copy.vision.collectionOperationHistoryExporting : app.copy.vision.collectionOperationHistoryExport}</button>
      </div>
      <div className="vision-collection-operation-history-selection-toolbar" role="group" aria-label={app.copy.vision.collectionOperationHistoryTitle}>
        <span className="vision-collection-operation-history-selection-count" role="status">{app.copy.vision.collectionOperationHistorySelectedCount(selectedCollectionOperationCount)}</span>
        <div className="vision-collection-operation-history-selection-actions">
          {undoableCollectionOperationHistory.length > 0 ? <><button className="vision-collection-operation-history-selection-action" type="button" onClick={() => toggleAllCollectionOperationSelection('undo')} disabled={isCollectionBatchBusy} aria-pressed={undoableCollectionOperationHistory.every((operation) => selectedCollectionOperationUndoIds.has(operation.id))}>{app.copy.vision.collectionOperationHistorySelectAllUndo}</button>{selectedCollectionOperationUndoIds.size > 0 ? <button className="vision-collection-operation-history-batch-action" type="button" onClick={undoSelectedCollectionOperations} disabled={isCollectionBatchBusy}><Undo2 size={11} />{app.copy.vision.collectionOperationHistoryBatchUndo}</button> : null}</> : null}
          {redoableCollectionOperationHistory.length > 0 ? <><button className="vision-collection-operation-history-selection-action" type="button" onClick={() => toggleAllCollectionOperationSelection('redo')} disabled={isCollectionBatchBusy} aria-pressed={redoableCollectionOperationHistory.every((operation) => selectedCollectionOperationRedoIds.has(operation.id))}>{app.copy.vision.collectionOperationHistorySelectAllRedo}</button>{selectedCollectionOperationRedoIds.size > 0 ? <button className="vision-collection-operation-history-batch-action" type="button" onClick={redoSelectedCollectionOperations} disabled={isCollectionBatchBusy}><Redo2 size={11} />{app.copy.vision.collectionOperationHistoryBatchRedo}</button> : null}</> : null}
          {selectedCollectionOperationCount > 0 ? <button className="vision-collection-operation-history-selection-action" type="button" onClick={clearCollectionOperationSelection} disabled={isCollectionBatchBusy}>{app.copy.vision.collectionOperationHistoryClearSelection}</button> : null}
        </div>
      </div>
      {collectionOperationConflicts.length > 0 ? <div className="vision-collection-operation-history-conflicts" role="alert">
        <div className="vision-collection-operation-history-conflicts-heading"><strong>{app.copy.vision.collectionOperationHistoryConflictTitle}</strong><small>{app.copy.vision.collectionOperationHistoryConflictDescription(collectionOperationConflicts.length)}</small></div>
        <ul>
          {collectionOperationConflicts.slice(0, 5).map((conflict) => <li key={`${conflict.operationId}:${conflict.reason}`}><strong>{conflict.operationType ? app.copy.vision.collectionOperationTypeLabel[conflict.operationType] : conflict.operationId}</strong><code>{conflict.operationId.slice(0, 8)}</code><small>{app.copy.vision.collectionOperationHistoryConflictReason[conflict.reason]}</small></li>)}
        </ul>
        {collectionOperationConflicts.length > 5 ? <small>{app.copy.vision.collectionOperationHistoryConflictMore(collectionOperationConflicts.length - 5)}</small> : null}
        <button className="vision-secondary-action" type="button" onClick={removeCollectionOperationConflicts} disabled={isCollectionBatchBusy}>{app.copy.vision.collectionOperationHistoryConflictRemove}</button>
      </div> : null}
      {visibleCollectionOperationHistory.length === 0 ? <small className="vision-collection-operation-history-empty">{app.copy.vision.collectionOperationHistoryFilterEmpty}</small> : null}
      <div className="vision-collection-operation-history-list" role="list" aria-label={app.copy.vision.collectionOperationHistoryTitle}>
        {visibleCollectionOperationHistory.map((operation) => {
          const targets = operation.collectionIds.map((id, index) => operation.collectionTitles[index]?.trim() || id).join(' · ')
          return <div className={`vision-collection-operation-history-entry is-${operation.status}`} key={operation.id} role="listitem">
            <div className="vision-collection-operation-history-copy">
              {operation.status === 'active' ? <input className="vision-collection-operation-history-select" type="checkbox" checked={selectedCollectionOperationUndoIds.has(operation.id)} onChange={() => toggleCollectionOperationSelection(operation.id, 'undo')} aria-label={app.copy.vision.collectionOperationHistorySelectUndo(app.copy.vision.collectionOperationTypeLabel[operation.type])} disabled={isCollectionBatchBusy} /> : operation.status === 'redoable' ? <input className="vision-collection-operation-history-select" type="checkbox" checked={selectedCollectionOperationRedoIds.has(operation.id)} onChange={() => toggleCollectionOperationSelection(operation.id, 'redo')} aria-label={app.copy.vision.collectionOperationHistorySelectRedo(app.copy.vision.collectionOperationTypeLabel[operation.type])} disabled={isCollectionBatchBusy} /> : <span className="vision-collection-operation-history-select-placeholder" aria-hidden="true" />}
              <div className="vision-collection-operation-history-copy-text"><strong>{app.copy.vision.collectionOperationTypeLabel[operation.type]}</strong><small title={targets}>{targets}</small></div>
            </div>
            <div className="vision-collection-operation-history-meta"><span>{app.copy.vision.collectionOperationHistoryStatusLabel[operation.status]}</span><span>{app.copy.vision.collectionOperationHistoryTargetCount(operation.collectionIds.length)} · {app.copy.vision.collectionOperationHistorySelectionCount(operation.selectionCount)}</span><time dateTime={new Date(operation.createdAt).toISOString()}>{new Date(operation.createdAt).toLocaleString()}</time></div>
            <div className="vision-collection-operation-history-actions">
              {operation.status === 'active' ? <button className="vision-collection-operation-history-action" type="button" onClick={() => undoCollectionOperation(operation.id)} disabled={isCollectionBatchBusy} aria-label={`${app.copy.vision.collectionOperationHistoryUndo}: ${app.copy.vision.collectionOperationTypeLabel[operation.type]}`}><Undo2 size={11} />{app.copy.vision.collectionOperationHistoryUndo}</button> : null}
              {operation.status === 'redoable' ? <button className="vision-collection-operation-history-action" type="button" onClick={() => redoCollectionOperation(operation.id)} disabled={isCollectionBatchBusy} aria-label={`${app.copy.vision.collectionOperationHistoryRedo}: ${app.copy.vision.collectionOperationTypeLabel[operation.type]}`}><Redo2 size={11} />{app.copy.vision.collectionOperationHistoryRedo}</button> : null}
              <button className="vision-collection-operation-history-detail-action" type="button" onClick={() => inspectCollectionOperation(operation.id)} disabled={isCollectionBatchBusy || isLoadingCollectionOperationHistoryDetail} aria-expanded={collectionOperationHistoryDetailId === operation.id}>{collectionOperationHistoryDetailId === operation.id ? app.copy.vision.collectionOperationHistoryDetailClose : app.copy.vision.collectionOperationHistoryViewDetail}</button>
            </div>
          </div>
        })}
      </div>
      {isLoadingCollectionOperationHistoryDetail ? <small className="vision-collection-operation-history-detail-loading" role="status">{app.copy.vision.collectionOperationHistoryDetailLoading}</small> : null}
      {collectionOperationHistoryDetail ? <div className="vision-collection-operation-history-detail" role="region" aria-label={app.copy.vision.collectionOperationHistoryDetailTitle}>
        <div className="vision-collection-operation-history-detail-heading"><strong>{app.copy.vision.collectionOperationHistoryDetailTitle}</strong><button className="vision-secondary-action" type="button" onClick={closeCollectionOperationDetail}>{app.copy.vision.collectionOperationHistoryDetailClose}</button></div>
        <div className="vision-collection-operation-history-detail-states">
          <CollectionOperationDetailState label={app.copy.vision.collectionOperationHistoryDetailBefore} collections={collectionOperationHistoryDetail.beforeCollections} diffs={collectionOperationDetailDiffs} copy={app.copy.vision} />
          <CollectionOperationDetailState label={app.copy.vision.collectionOperationHistoryDetailAfter} collections={collectionOperationHistoryDetail.afterCollections} diffs={collectionOperationDetailDiffs} copy={app.copy.vision} />
        </div>
      </div> : null}
    </div> : null}
    {collections.length > 0 ? <div className="vision-card vision-collection-status-card"><div className="vision-collection-status-summary" role="group" aria-label={app.copy.vision.collectionStatusSummaryLabel}><span className="vision-collection-status-summary-label">{app.copy.vision.collectionStatusSummaryLabel}</span><button className={`vision-collection-status-filter${collectionFilterVisibility === 'all' ? ' is-active' : ''}`} type="button" onClick={() => setCollectionFilterVisibility('all')} aria-pressed={collectionFilterVisibility === 'all'} aria-label={`${app.copy.vision.collectionStatusSummaryLabel}: ${app.copy.vision.collectionStatusSummaryAll(collectionStatusSummary.allCount)}`} disabled={isCollectionBatchBusy}>{app.copy.vision.collectionStatusSummaryAll(collectionStatusSummary.allCount)}</button><button className={`vision-collection-status-filter${collectionFilterVisibility === 'active' ? ' is-active' : ''}`} type="button" onClick={() => setCollectionFilterVisibility('active')} aria-pressed={collectionFilterVisibility === 'active'} aria-label={`${app.copy.vision.collectionStatusSummaryLabel}: ${app.copy.vision.collectionStatusSummaryActive(collectionStatusSummary.activeCount)}`} disabled={isCollectionBatchBusy}>{app.copy.vision.collectionStatusSummaryActive(collectionStatusSummary.activeCount)}</button><button className={`vision-collection-status-filter${collectionFilterVisibility === 'favorites' ? ' is-active' : ''}`} type="button" onClick={() => setCollectionFilterVisibility('favorites')} aria-pressed={collectionFilterVisibility === 'favorites'} aria-label={`${app.copy.vision.collectionStatusSummaryLabel}: ${app.copy.vision.collectionStatusSummaryFavorites(collectionStatusSummary.favoriteCount)}`} disabled={isCollectionBatchBusy}>{app.copy.vision.collectionStatusSummaryFavorites(collectionStatusSummary.favoriteCount)}</button><button className={`vision-collection-status-filter${collectionFilterVisibility === 'archived' ? ' is-active' : ''}`} type="button" onClick={() => setCollectionFilterVisibility('archived')} aria-pressed={collectionFilterVisibility === 'archived'} aria-label={`${app.copy.vision.collectionStatusSummaryLabel}: ${app.copy.vision.collectionStatusSummaryArchived(collectionStatusSummary.archivedCount)}`} disabled={isCollectionBatchBusy}>{app.copy.vision.collectionStatusSummaryArchived(collectionStatusSummary.archivedCount)}</button></div></div> : null}
    {selectedCollectionIds.size > 0 ? <div className="vision-card vision-collection-batch-tags-actions"><div className="vision-collection-batch-tags-heading"><strong>{app.copy.vision.selectedCollections(selectedCollectionIds.size)}</strong><small>{app.copy.vision.collectionTagsBatchPlaceholder}</small></div><div className="vision-collection-batch-tags-controls"><select className="vision-collection-batch-tags-mode" value={collectionBatchTagsMode} onChange={(event) => setCollectionBatchTagsMode(event.target.value as VisionClipCollectionBatchTagsMode)} aria-label={app.copy.vision.collectionTagsBatchModeAriaLabel} disabled={isCollectionBatchBusy}><option value="replace">{app.copy.vision.collectionTagsBatchModeLabel.replace}</option><option value="add">{app.copy.vision.collectionTagsBatchModeLabel.add}</option><option value="remove">{app.copy.vision.collectionTagsBatchModeLabel.remove}</option></select><input className="vision-collection-batch-tags-input" value={collectionBatchTags} maxLength={800} onChange={(event) => setCollectionBatchTags(event.target.value)} placeholder={app.copy.vision.collectionTagsBatchInputPlaceholder} aria-label={app.copy.vision.collectionTagsBatchInputPlaceholder} disabled={isCollectionBatchBusy} /><button className="vision-primary-action" type="button" onClick={updateSelectedCollectionsTags} disabled={isCollectionBatchBusy || !canUpdateCollectionTags}><Tags size={13} />{app.copy.vision.updateSelectedCollectionTags}</button>{!canUpdateCollectionTags ? <small className="vision-collection-batch-tags-hint">{app.copy.vision.collectionTagsBatchNeedInput}</small> : null}</div></div> : null}
    <section className="vision-card vision-collections"><div className="vision-collections-heading"><strong>{app.copy.vision.savedCollections}</strong><div className="vision-collection-transfer-actions">{collections.length > 0 ? <button className="vision-secondary-action" type="button" onClick={toggleAllCollectionSelection} disabled={isCollectionBatchBusy || visibleCollections.length === 0}>{allVisibleCollectionsSelected ? <Square size={12} /> : <CheckSquare size={12} />}{allVisibleCollectionsSelected ? (hasCollectionFilter ? app.copy.vision.collectionClearVisible : app.copy.vision.collectionClearSelection) : (hasCollectionFilter ? app.copy.vision.collectionSelectVisible : app.copy.vision.collectionSelectAll)}</button> : null}<button className="vision-secondary-action" type="button" onClick={importCollection} disabled={isCollectionBatchBusy}><Upload size={12} />{app.copy.vision.collectionImport}</button><Archive size={15} /></div></div>{collections.length > 0 ? <><div className="vision-collection-filter-bar"><input className="vision-collection-filter-input" value={collectionFilterQuery} onChange={(event) => setCollectionFilterQuery(event.target.value)} placeholder={app.copy.vision.collectionFilterPlaceholder} aria-label={app.copy.vision.collectionFilterPlaceholder} disabled={isCollectionBatchBusy} /><select className="vision-collection-filter-mode vision-collection-visibility" value={collectionFilterVisibility} onChange={(event) => setCollectionFilterVisibility(event.target.value as VisionClipCollectionFilterVisibility)} aria-label={app.copy.vision.collectionFilterVisibilityLabel} disabled={isCollectionBatchBusy}><option value="all">{app.copy.vision.collectionFilterVisibilityAll}</option><option value="active">{app.copy.vision.collectionFilterVisibilityActive}</option><option value="favorites">{app.copy.vision.collectionFilterVisibilityFavorites}</option><option value="archived">{app.copy.vision.collectionFilterVisibilityArchived}</option></select><select className="vision-collection-filter-tag" multiple size={Math.min(5, Math.max(2, availableCollectionFilterTags.length))} value={collectionFilterTags} onChange={(event) => updateCollectionFilterTags(event, false)} aria-label={app.copy.vision.collectionFilterTagLabel} disabled={isCollectionBatchBusy}>{availableCollectionFilterTags.map((tag) => <option key={tag} value={tag}>{getVisionCollectionTagPath(tag, collectionTagMetadata).join(' / ') || tag}</option>)}</select><select className="vision-collection-filter-tag vision-collection-filter-excluded-tag" multiple size={Math.min(5, Math.max(2, availableCollectionFilterTags.length))} value={collectionFilterExcludedTags} onChange={(event) => updateCollectionFilterTags(event, true)} aria-label={app.copy.vision.collectionFilterExcludedTagLabel} disabled={isCollectionBatchBusy}>{availableCollectionFilterTags.map((tag) => <option key={tag} value={tag}>{getVisionCollectionTagPath(tag, collectionTagMetadata).join(' / ') || tag}</option>)}</select>{collectionFilterTags.length > 1 ? <select className="vision-collection-filter-mode" value={collectionFilterTagMode} onChange={(event) => setCollectionFilterTagMode(event.target.value as VisionCollectionTagFilterMode)} aria-label={app.copy.vision.collectionFilterTagModeLabel} disabled={isCollectionBatchBusy}><option value="any">{app.copy.vision.collectionFilterTagModeAny}</option><option value="all">{app.copy.vision.collectionFilterTagModeAll}</option></select> : null}<select className="vision-collection-filter-mode vision-collection-list-sort" value={collectionListSortMode} onChange={(event) => setCollectionListSortMode(event.target.value as VisionClipCollectionListSortMode)} aria-label={app.copy.vision.collectionListSortLabel} disabled={isCollectionBatchBusy}><option value="updated-desc">{app.copy.vision.collectionListSortUpdated}</option><option value="title-asc">{app.copy.vision.collectionListSortTitle}</option><option value="selection-count-desc">{app.copy.vision.collectionListSortSelectionCount}</option><option value="duration-desc">{app.copy.vision.collectionListSortDuration}</option></select>{hasCollectionFilter ? <button className="vision-secondary-action" type="button" onClick={clearCollectionFilters} disabled={isCollectionBatchBusy}>{app.copy.vision.collectionFilterClear}</button> : null}<span className="vision-collection-filter-summary" role="status">{app.copy.vision.collectionFilterSummary(visibleCollections.length, collections.length)}</span></div>{collectionFilterTags.length > 0 ? <div className="vision-collection-filter-selected" role="group" aria-label={app.copy.vision.collectionFilterSelectedTagsLabel}><span className="vision-collection-filter-selected-label">{app.copy.vision.collectionFilterSelectedTagsLabel}</span>{collectionFilterTags.map((tag) => { const path = getVisionCollectionTagPath(tag, collectionTagMetadata).join(' / ') || tag; return <button className="vision-collection-filter-chip" key={tag} type="button" onClick={() => removeCollectionFilterTag(tag, false)} aria-label={`${app.copy.vision.collectionFilterRemoveTag}: ${path}`} disabled={isCollectionBatchBusy}><span>{path}</span><X size={11} aria-hidden="true" /></button> })}</div> : null}{collectionFilterExcludedTags.length > 0 ? <div className="vision-collection-filter-selected vision-collection-filter-excluded" role="group" aria-label={app.copy.vision.collectionFilterExcludedTagsLabel}><span className="vision-collection-filter-selected-label">{app.copy.vision.collectionFilterExcludedTagsLabel}</span>{collectionFilterExcludedTags.map((tag) => { const path = getVisionCollectionTagPath(tag, collectionTagMetadata).join(' / ') || tag; return <button className="vision-collection-filter-chip vision-collection-filter-chip-excluded" key={tag} type="button" onClick={() => removeCollectionFilterTag(tag, true)} aria-label={`${app.copy.vision.collectionFilterRemoveExcludedTag}: ${path}`} disabled={isCollectionBatchBusy}><span>{path}</span><X size={11} aria-hidden="true" /></button> })}</div> : null}</> : null}{selectedCollectionIds.size > 0 ? <div className="vision-collection-batch-actions"><span>{app.copy.vision.selectedCollections(selectedCollectionIds.size)}</span><input className="vision-collection-rename-input" value={collectionRenamePrefix} maxLength={40} onChange={(event) => setCollectionRenamePrefix(event.target.value)} placeholder={app.copy.vision.collectionRenamePrefixPlaceholder} aria-label={app.copy.vision.collectionRenamePrefixPlaceholder} disabled={isCollectionBatchBusy} /><input className="vision-collection-rename-input" value={collectionRenameSuffix} maxLength={40} onChange={(event) => setCollectionRenameSuffix(event.target.value)} placeholder={app.copy.vision.collectionRenameSuffixPlaceholder} aria-label={app.copy.vision.collectionRenameSuffixPlaceholder} disabled={isCollectionBatchBusy} />{hasRenameRule ? <div className="vision-collection-rename-preview" role="status"><span>{app.copy.vision.collectionRenamePreview}</span>{renamePreviewCollections.slice(0, 3).map((collection) => <small key={collection.id}>{collection.title}</small>)}{renamePreviewCollections.length > 3 ? <small>{app.copy.vision.collectionRenamePreviewMore(renamePreviewCollections.length - 3)}</small> : null}</div> : null}<button className="vision-secondary-action" type="button" onClick={() => void setSelectedCollectionFlag('isFavorite', !allSelectedCollectionsFavorite)} disabled={isCollectionBatchBusy} aria-label={allSelectedCollectionsFavorite ? app.copy.vision.collectionUnfavoriteAction : app.copy.vision.collectionFavoriteAction}><Star size={13} fill={allSelectedCollectionsFavorite ? 'currentColor' : 'none'} />{allSelectedCollectionsFavorite ? app.copy.vision.collectionUnfavoriteAction : app.copy.vision.collectionFavoriteAction}</button><button className="vision-secondary-action" type="button" onClick={() => void setSelectedCollectionFlag('isArchived', !allSelectedCollectionsArchived)} disabled={isCollectionBatchBusy} aria-label={allSelectedCollectionsArchived ? app.copy.vision.collectionUnarchiveAction : app.copy.vision.collectionArchiveAction}><Archive size={13} />{allSelectedCollectionsArchived ? app.copy.vision.collectionUnarchiveAction : app.copy.vision.collectionArchiveAction}</button><button className="vision-secondary-action" type="button" onClick={renameSelectedCollections} disabled={isCollectionBatchBusy || !hasRenameRule}>{app.copy.vision.renameSelectedCollections}</button><button className="vision-primary-action" type="button" onClick={() => void duplicateSelectedCollections()} disabled={isCollectionBatchBusy}><Copy size={13} />{app.copy.vision.duplicateSelectedCollections}</button><button className="vision-secondary-action" type="button" onClick={exportSelectedCollections} disabled={isCollectionBatchBusy}><Download size={12} />{app.copy.vision.exportSelectedCollections}</button><button className="vision-secondary-action vision-collection-batch-delete" type="button" onClick={deleteSelectedCollections} disabled={isCollectionBatchBusy}><Trash2 size={13} />{app.copy.vision.deleteSelectedCollections}</button></div> : null}{collections.length > 0 ? (visibleCollections.length > 0 ? visibleCollections.map((collection) => {
      const availability = collectionAvailability[collection.id]
      const isRepairing = repairingCollectionId === collection.id
      const isEditingTitle = editingCollectionId === collection.id
      const isEditingTags = editingCollectionTagsId === collection.id
      return <article className="vision-collection" key={collection.id}><div className="vision-collection-heading"><input type="checkbox" checked={selectedCollectionIds.has(collection.id)} onChange={() => toggleCollectionSelection(collection.id)} disabled={isCollectionBatchBusy} aria-label={app.copy.vision.selectCollection(collection.title)} /><div className="vision-collection-copy"><div className="vision-collection-title-row">{isEditingTitle ? <div className="vision-collection-title-edit"><input className="vision-collection-inline-title-input" value={editingCollectionTitle} maxLength={200} autoFocus onChange={(event) => setEditingCollectionTitle(event.target.value)} onKeyDown={(event) => handleCollectionTitleKeyDown(event, collection)} aria-label={app.copy.vision.collectionTitleEditLabel} /><button className="vision-collection-inline-action" type="button" onClick={() => void saveCollectionTitle(collection)} disabled={isSavingCollectionTitle} title={app.copy.vision.saveCollectionTitle} aria-label={app.copy.vision.saveCollectionTitle}><Check size={13} /></button><button className="vision-collection-inline-action" type="button" onClick={cancelCollectionTitleEdit} disabled={isSavingCollectionTitle} title={app.copy.vision.cancelCollectionTitle} aria-label={app.copy.vision.cancelCollectionTitle}><X size={13} /></button></div> : <><strong>{collection.title}</strong><button className="vision-collection-inline-action" type="button" onClick={() => beginCollectionTitleEdit(collection)} disabled={isCollectionBatchBusy} title={app.copy.vision.editCollectionTitle} aria-label={`${app.copy.vision.editCollectionTitle}: ${collection.title}`}><Pencil size={12} /></button></>}</div><span>{app.copy.vision.selectedResults(collection.selections.length)} · {collection.sortMode === 'duration-desc' ? app.copy.vision.collectionSortDuration : collection.sortMode === 'file-name' ? app.copy.vision.collectionSortFileName : app.copy.vision.collectionSortSourceTime}</span>{isEditingTags ? <div className="vision-collection-tags-edit"><input className="vision-collection-inline-tags-input" value={editingCollectionTags} maxLength={800} autoFocus onChange={(event) => setEditingCollectionTags(event.target.value)} onKeyDown={(event) => handleCollectionTagsKeyDown(event, collection)} placeholder={app.copy.vision.collectionTagsPlaceholder} aria-label={app.copy.vision.collectionTagsEditLabel} /><button className="vision-collection-inline-action" type="button" onClick={() => void saveCollectionTags(collection)} disabled={isSavingCollectionTags} title={app.copy.vision.saveCollectionTags} aria-label={app.copy.vision.saveCollectionTags}><Check size={13} /></button><button className="vision-collection-inline-action" type="button" onClick={cancelCollectionTagsEdit} disabled={isSavingCollectionTags} title={app.copy.vision.cancelCollectionTags} aria-label={app.copy.vision.cancelCollectionTags}><X size={13} /></button></div> : <div className="vision-collection-tags-row"><small className={collection.tags.length > 0 ? undefined : 'vision-collection-tags-empty'}>{collection.tags.length > 0 ? collection.tags.join(' · ') : app.copy.vision.collectionTagsEmpty}</small><button className="vision-collection-inline-action" type="button" onClick={() => beginCollectionTagsEdit(collection)} disabled={isCollectionBatchBusy} title={app.copy.vision.editCollectionTags} aria-label={`${app.copy.vision.editCollectionTags}: ${collection.title}`}><Pencil size={11} /></button></div>}{availability?.missingPaths ? <small className="vision-collection-missing">{app.copy.vision.collectionMissingSources(availability.missingPaths)}</small> : null}</div></div><div className="vision-collection-actions"><select className="vision-collection-sort" value={collection.sortMode} aria-label={app.copy.vision.collectionSortLabel} onChange={(event) => sortCollection(collection, event.target.value as VisionClipCollectionSortMode)} disabled={isEditingTitle || isEditingTags || isSavingCollectionTitle || isSavingCollectionTags}><option value="source-time">{app.copy.vision.collectionSortSourceTime}</option><option value="duration-desc">{app.copy.vision.collectionSortDuration}</option><option value="file-name">{app.copy.vision.collectionSortFileName}</option></select><button className="vision-secondary-action vision-collection-flag-action" type="button" onClick={() => void toggleCollectionFlag(collection, 'isFavorite')} disabled={isCollectionBatchBusy || isEditingTitle || isEditingTags} aria-pressed={collection.isFavorite} aria-label={`${collection.isFavorite ? app.copy.vision.collectionUnfavoriteAction : app.copy.vision.collectionFavoriteAction}: ${collection.title}`}><Star size={13} fill={collection.isFavorite ? 'currentColor' : 'none'} />{collection.isFavorite ? app.copy.vision.collectionUnfavoriteAction : app.copy.vision.collectionFavoriteAction}</button><button className="vision-secondary-action vision-collection-flag-action" type="button" onClick={() => void toggleCollectionFlag(collection, 'isArchived')} disabled={isCollectionBatchBusy || isEditingTitle || isEditingTags} aria-pressed={collection.isArchived} aria-label={`${collection.isArchived ? app.copy.vision.collectionUnarchiveAction : app.copy.vision.collectionArchiveAction}: ${collection.title}`}><Archive size={13} />{collection.isArchived ? app.copy.vision.collectionUnarchiveAction : app.copy.vision.collectionArchiveAction}</button>{availability?.missingPaths ? <button className="vision-secondary-action" type="button" onClick={() => void repairCollection(collection)} disabled={isCollectionBatchBusy || isRepairing || isEditingTitle || isEditingTags}>{isRepairing ? app.copy.vision.repairingCollectionSources : app.copy.vision.repairCollectionSources}</button> : null}<button className="vision-secondary-action" type="button" onClick={() => mergeCollection(collection)} disabled={isCollectionBatchBusy || isEditingTitle || isEditingTags}>{app.copy.vision.collectionMerge}</button><button className="vision-secondary-action" type="button" onClick={() => invertCollection(collection)} disabled={isCollectionBatchBusy || isEditingTitle || isEditingTags}>{app.copy.vision.collectionInvert}</button><button className="vision-secondary-action" type="button" onClick={() => exportCollection(collection, 'json')} disabled={isEditingTitle || isEditingTags}>{app.copy.vision.exportJson}</button><button className="vision-secondary-action" type="button" onClick={() => exportCollection(collection, 'csv')} disabled={isEditingTitle || isEditingTags}>{app.copy.vision.exportCsv}</button><button className="vision-secondary-action" type="button" onClick={() => exportCollection(collection, 'edl')} disabled={isEditingTitle || isEditingTags}>{app.copy.vision.exportEdl}</button><button className="vision-secondary-action" type="button" onClick={() => void duplicateCollection(collection)} disabled={isCollectionBatchBusy || isEditingTitle || isEditingTags} title={app.copy.vision.duplicateCollection}><Copy size={13} />{app.copy.vision.duplicateCollection}</button><button className="vision-primary-action" type="button" onClick={() => createProjectFromCollection(collection)} disabled={isEditingTitle || isEditingTags} title={app.copy.vision.openCollection}><FilePlus size={13} />{app.copy.vision.openCollection}</button><button className="vision-collection-delete" type="button" onClick={() => deleteCollection(collection)} disabled={isEditingTitle || isEditingTags} title={app.copy.vision.deleteCollection} aria-label={app.copy.vision.deleteCollection}><Trash2 size={14} /></button></div></article>
    }) : <div className="vision-empty">{app.copy.vision.collectionFilterEmpty}</div>) : <div className="vision-empty">{app.copy.vision.savedCollectionEmpty}</div>}{collectionTransferStatus ? <small className="vision-saved-search-status" role="status">{collectionTransferStatus}</small> : null}</section>
  </div>
}
