import { Archive, Database, FilePlus, ImageUp, ScanSearch, Search, Square, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { VisionIndexProgress, VisionRuntimeStatus, VisionSearchResult } from '../../../shared/media-types'
import type { AsrSubtitleResult } from '../../../shared/media-types'
import type { MediaEvidenceDraftImportResult } from '../../../shared/evidence-task-types'
import type { VisionClipCollection, VisionClipCollectionExportFormat, VisionClipCollectionSortMode, VisionIndexFailureRecord, VisionLibrarySource } from '../../../shared/vision-types'
import { invertVisionClipSelections, mergeVisionCollectionSelections, normalizeVisionCollectionTags } from '../../../core/ai/clip-inbox-operations'
import { createVisionClipSelections, normalizeVisionTimeRange } from '../../../core/ai/vision-evidence'
import { useAppContext } from './app-context'
import { useVisionLibraryFolder } from './use-vision-library-folder'
import { VisionLibraryFolder } from './vision-library-folder'
import { VisionOcrTask } from './vision-ocr-task'
import { VisionTtsTask } from './vision-tts-task'
import { VisionSearchResults } from './vision-search-results'
import { useVisionImportInbox } from './use-vision-import-inbox'
import { VisionImportInbox } from './vision-import-inbox'
import { VisionLibrarySources } from './vision-library-sources'
import { VisionEntityCatalog } from './vision-entity-catalog'
import { VisionIndexFailures } from './vision-index-failures'
import type { VisionEntityCatalog as VisionEntityCatalogState, VisionEntityCatalogBatchPatch, VisionEntityCatalogPatch } from '../../../shared/vision-entity-types'

const VISION_SOURCE_PAGE_SIZE = 100

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.max(1, Math.round(milliseconds))}ms`
  const seconds = milliseconds / 1000
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
}

type CollectionAvailability = { missingPaths: number; availablePaths: number }

export function VisionPanel(): React.ReactElement {
  const app = useAppContext()
  const [status, setStatus] = useState<VisionRuntimeStatus | null>(null)
  const [progress, setProgress] = useState<VisionIndexProgress | null>(null)
  const [query, setQuery] = useState('')
  const [sampleImagePath, setSampleImagePath] = useState<string | null>(null)
  const [sampleImageName, setSampleImageName] = useState<string | null>(null)
  const [includeEntityEvidence, setIncludeEntityEvidence] = useState(false)
  const [results, setResults] = useState<VisionSearchResult[]>([])
  const [sources, setSources] = useState<VisionLibrarySource[]>([])
  const [hasMoreSources, setHasMoreSources] = useState(false)
  const [isLoadingMoreSources, setIsLoadingMoreSources] = useState(false)
  const [failures, setFailures] = useState<VisionIndexFailureRecord[]>([])
  const [entityCatalog, setEntityCatalog] = useState<VisionEntityCatalogState | null>(null)
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set())
  const [collectionTitle, setCollectionTitle] = useState('')
  const [collectionTags, setCollectionTags] = useState('')
  const [collections, setCollections] = useState<VisionClipCollection[]>([])
  const [collectionAvailability, setCollectionAvailability] = useState<Record<string, CollectionAvailability>>({})
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})
  const [sourceThumbnailUrls, setSourceThumbnailUrls] = useState<Record<string, string>>({})
  const [isSearching, setIsSearching] = useState(false)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [repairingCollectionId, setRepairingCollectionId] = useState<string | null>(null)
  const [pendingResultSeek, setPendingResultSeek] = useState<{ videoPath: string; seconds: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isIndexing = progress?.status === 'loading' || progress?.status === 'indexing'
  const folder = useVisionLibraryFolder(app, isIndexing, { onError: setError })
  const importInbox = useVisionImportInbox(app)
  const isBusy = folder.isBusy
  const vectorIndexLabel = status?.vectorIndexType
    ? app.copy.vision.vectorIndex(status.vectorIndexType, status.vectorIndexDistanceType ?? '—', status.vectorIndexIndexedRows, status.vectorIndexUnindexedRows)
    : app.copy.vision.exactVectorSearch

  const refreshFailures = (): void => { void window.aiv.listVisionIndexFailures().then(setFailures).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))) }

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
    const statusTimer = window.setInterval(refreshStatus, 5000)
    const removeProgressListener = window.aiv.onVisionIndexProgress((next) => {
      if (!active) return
      setProgress(next)
      if (next.status === 'completed' || next.status === 'cancelled' || next.status === 'error') {
        refreshStatus()
        refreshSources()
      }
    })
    const removeInboxPipelineListener = window.aiv.onMediaImportInboxPipelineProgress((next) => {
      if (active && next.stage === 'vision' && (next.status === 'ready' || next.status === 'failed')) refreshSources()
    })
    return () => {
      active = false
      window.clearInterval(statusTimer)
      removeProgressListener()
      removeInboxPipelineListener()
    }
  }, [])

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

  const startIndex = (): void => {
    if (app.state.playlist.length === 0 || isBusy) return
    setError(null)
    setProgress(null)
    void window.aiv.startVisionIndex({ mediaPaths: app.state.playlist.map((file) => file.path), intervalSeconds: 3, includeEntityEvidence }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  const startFolderIndex = (): void => {
    if (folder.videoPaths.length === 0 || isBusy) return
    setError(null)
    setProgress(null)
    void window.aiv.startVisionIndex({ mediaPaths: folder.videoPaths, intervalSeconds: 3, includeEntityEvidence }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  const cancelCurrentTask = (): void => {
    if (folder.isScanning) void window.aiv.cancelVisionDirectoryScan()
    else void window.aiv.cancelVisionIndex()
  }

  const runTextSearch = (): void => {
    if (!query.trim() || isSearching) return
    setIsSearching(true)
    setError(null)
    void window.aiv.searchVisionText({ query, limit: 24, mode: 'hybrid' }).then((nextResults) => {
      setResults(nextResults)
      setSelectedResultIds(new Set())
    }).catch((reason: unknown) => {
      setResults([])
      setSelectedResultIds(new Set())
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => setIsSearching(false))
  }

  const runImageSearch = (): void => {
    if (!sampleImagePath || isSearching) return
    setIsSearching(true)
    setError(null)
    void window.aiv.searchVisionImage({ imagePath: sampleImagePath, limit: 24 }).then((nextResults) => {
      setResults(nextResults)
      setSelectedResultIds(new Set())
    }).catch((reason: unknown) => {
      setResults([])
      setSelectedResultIds(new Set())
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => setIsSearching(false))
  }

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
        : progress?.stage === 'entity-evidence'
          ? app.copy.vision.entityAnalyzing(progress.entityEvidenceProcessed ?? 0, progress.entityEvidenceTotal ?? 0)
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
      formatDuration(progress.timings.entityEvidenceMs),
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
      {!status?.available ? <small className="vision-error">{status?.message ?? app.copy.vision.unavailable}</small> : null}
      <VisionLibraryFolder copy={app.copy.vision} folderPath={folder.folderPath} savedFolders={folder.savedFolders} videoPaths={folder.videoPaths} includeSubfolders={folder.includeSubfolders} scanProgress={folder.scanProgress} batchScanProgress={folder.batchScanProgress} isBusy={isBusy} onChooseFolder={folder.chooseFolder} onScanFolder={folder.scanCurrentFolder} onScanAllFolders={folder.scanAllFolders} onIncludeSubfoldersChange={folder.setIncludeSubfolders} onStartIndex={startFolderIndex} onUseFolder={folder.useSavedFolder} onRemoveFolder={folder.removeSavedFolder} />
      <VisionImportInbox copy={app.copy.vision} directories={importInbox.directories} items={importInbox.items} progress={importInbox.progress} pipelineProgress={importInbox.pipelineProgress} isBusy={importInbox.isBusy} error={importInbox.error} writeSidecars={importInbox.writeSidecars} onAddFolder={importInbox.addFolder} onRemoveFolder={importInbox.removeFolder} onScan={importInbox.scan} onQueue={importInbox.queueItem} onIgnore={importInbox.ignoreItem} onRetry={importInbox.retryItem} onBatchQueue={importInbox.batchQueue} onBatchIgnore={importInbox.batchIgnore} onBatchRetry={importInbox.batchRetry} onWriteSidecarsChange={importInbox.setWriteSidecars} onUpdateMetadata={importInbox.updateMetadata} />
      <VisionLibrarySources copy={app.copy.vision} sources={sources} thumbnailUrls={sourceThumbnailUrls} hasMoreSources={hasMoreSources} isLoadingMoreSources={isLoadingMoreSources} onLoadMore={loadMoreSources} onOpenSource={openSource} />
      <VisionEntityCatalog copy={app.copy.vision} catalog={entityCatalog} onUpdate={updateEntityCatalog} onBatchUpdate={updateEntityCatalogBatch} />
      <VisionIndexFailures copy={app.copy.vision} failures={failures} onRetry={retryVisionFailure} onBatchRetry={retryVisionFailures} />
      <div className="vision-index-actions">
        <label className="vision-folder-option"><input type="checkbox" checked={includeEntityEvidence} disabled={isBusy} onChange={(event) => setIncludeEntityEvidence(event.target.checked)} /><span>{app.copy.vision.includeEntityEvidence}</span></label>
        <button className="vision-primary-action" type="button" onClick={startIndex} disabled={isBusy || app.state.playlist.length === 0}><Database size={15} />{app.copy.vision.indexPlaylist}</button>
        {isBusy ? <button className="vision-secondary-action" type="button" onClick={cancelCurrentTask}><Square size={13} />{app.copy.vision.cancelIndex}</button> : null}
      </div>
      {progressLabel ? <div className="vision-progress" role="status"><span>{progressLabel}</span><span title={timingLabel ?? undefined}>{timingLabel ?? (progress?.currentVideoPath ? progress.currentVideoPath.split(/[\\/]/).pop() : '')}</span></div> : null}
    </section>

    <VisionOcrTask copy={app.copy.vision} mediaPath={app.state.currentFile?.path ?? null} currentTime={app.state.currentTime} />
    <VisionTtsTask copy={app.copy.vision} mediaPath={app.state.currentFile?.path ?? null} currentTime={app.state.currentTime} onSubtitleImported={handleImportedSubtitle} />

    <section className="vision-card vision-search-card">
      <form className="vision-text-search" onSubmit={(event) => { event.preventDefault(); runTextSearch() }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={app.copy.vision.textPlaceholder} aria-label={app.copy.vision.textPlaceholder} />
        <button className="vision-search-button" type="submit" disabled={!query.trim() || isSearching}><Search size={15} />{app.copy.vision.hybridSearch}</button>
      </form>
      <div className="vision-image-search">
        <label className="vision-file-picker"><ImageUp size={15} /><span>{sampleImageName ?? app.copy.vision.chooseImage}</span><input type="file" accept="image/*" onChange={handleImageChange} /></label>
        <button className="vision-search-button" type="button" onClick={runImageSearch} disabled={!sampleImagePath || isSearching}><Search size={15} />{app.copy.vision.searchImage}</button>
      </div>
      {selectedResultIds.size > 0 ? <div className="vision-selection-actions"><span>{app.copy.vision.selectedResults(selectedResultIds.size)}</span><input className="vision-collection-title-input" value={collectionTitle} onChange={(event) => setCollectionTitle(event.target.value)} placeholder={app.copy.vision.collectionTitlePlaceholder} aria-label={app.copy.vision.collectionTitlePlaceholder} /><input className="vision-collection-title-input" value={collectionTags} onChange={(event) => setCollectionTags(event.target.value)} placeholder={app.copy.vision.collectionTagsPlaceholder} aria-label={app.copy.vision.collectionTagsPlaceholder} /><button className="vision-secondary-action" type="button" onClick={saveSelectedCollection} disabled={!collectionTitle.trim()}><Archive size={14} />{app.copy.vision.saveCollection}</button><button className="vision-primary-action" type="button" onClick={createProjectFromSelection} disabled={isCreatingProject}><FilePlus size={14} />{isCreatingProject ? app.copy.vision.creatingProject : app.copy.vision.createProject}</button></div> : null}
    </section>

    {error ? <div className="vision-error vision-error-card" role="alert">{error}</div> : null}
    <VisionSearchResults copy={app.copy.vision} results={results} thumbnailUrls={thumbnailUrls} onOpenResult={openResult} selectedIds={selectedResultIds} onToggleSelection={toggleResultSelection} />
    {collections.length > 0 ? <section className="vision-card vision-collections"><div className="vision-collections-heading"><strong>{app.copy.vision.savedCollections}</strong><Archive size={15} /></div>{collections.map((collection) => {
      const availability = collectionAvailability[collection.id]
      const isRepairing = repairingCollectionId === collection.id
      return <article className="vision-collection" key={collection.id}><div className="vision-collection-copy"><strong>{collection.title}</strong><span>{app.copy.vision.selectedResults(collection.selections.length)} · {collection.sortMode === 'duration-desc' ? app.copy.vision.collectionSortDuration : collection.sortMode === 'file-name' ? app.copy.vision.collectionSortFileName : app.copy.vision.collectionSortSourceTime}</span>{collection.tags.length > 0 ? <small>{collection.tags.join(' · ')}</small> : null}{availability?.missingPaths ? <small className="vision-collection-missing">{app.copy.vision.collectionMissingSources(availability.missingPaths)}</small> : null}</div><div className="vision-collection-actions"><select className="vision-collection-sort" value={collection.sortMode} aria-label={app.copy.vision.collectionSortLabel} onChange={(event) => sortCollection(collection, event.target.value as VisionClipCollectionSortMode)}><option value="source-time">{app.copy.vision.collectionSortSourceTime}</option><option value="duration-desc">{app.copy.vision.collectionSortDuration}</option><option value="file-name">{app.copy.vision.collectionSortFileName}</option></select>{availability?.missingPaths ? <button className="vision-secondary-action" type="button" onClick={() => void repairCollection(collection)} disabled={isRepairing}>{isRepairing ? app.copy.vision.repairingCollectionSources : app.copy.vision.repairCollectionSources}</button> : null}<button className="vision-secondary-action" type="button" onClick={() => mergeCollection(collection)}>{app.copy.vision.collectionMerge}</button><button className="vision-secondary-action" type="button" onClick={() => invertCollection(collection)}>{app.copy.vision.collectionInvert}</button><button className="vision-secondary-action" type="button" onClick={() => exportCollection(collection, 'json')}>{app.copy.vision.exportJson}</button><button className="vision-secondary-action" type="button" onClick={() => exportCollection(collection, 'csv')}>{app.copy.vision.exportCsv}</button><button className="vision-secondary-action" type="button" onClick={() => exportCollection(collection, 'edl')}>{app.copy.vision.exportEdl}</button><button className="vision-primary-action" type="button" onClick={() => createProjectFromCollection(collection)} title={app.copy.vision.openCollection}><FilePlus size={13} />{app.copy.vision.openCollection}</button><button className="vision-collection-delete" type="button" onClick={() => deleteCollection(collection)} title={app.copy.vision.deleteCollection} aria-label={app.copy.vision.deleteCollection}><Trash2 size={14} /></button></div></article>
    })}</section> : null}
  </div>
}
