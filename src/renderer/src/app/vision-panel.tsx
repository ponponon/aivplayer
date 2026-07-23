import { Database, ImageUp, ScanSearch, Search, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { VisionIndexProgress, VisionRuntimeStatus, VisionSearchResult } from '../../../shared/media-types'
import { useAppContext } from './app-context'
import { useVisionLibraryFolder } from './use-vision-library-folder'
import { VisionLibraryFolder } from './vision-library-folder'
import { VisionSearchResults } from './vision-search-results'

export function VisionPanel(): React.ReactElement {
  const app = useAppContext()
  const [status, setStatus] = useState<VisionRuntimeStatus | null>(null)
  const [progress, setProgress] = useState<VisionIndexProgress | null>(null)
  const [query, setQuery] = useState('')
  const [sampleImagePath, setSampleImagePath] = useState<string | null>(null)
  const [sampleImageName, setSampleImageName] = useState<string | null>(null)
  const [results, setResults] = useState<VisionSearchResult[]>([])
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isIndexing = progress?.status === 'loading' || progress?.status === 'indexing'
  const folder = useVisionLibraryFolder(app, isIndexing, { onError: setError })
  const isBusy = folder.isBusy

  useEffect(() => {
    let active = true
    void window.aiv.getVisionStatus().then((next) => {
      if (active) setStatus(next)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    const removeProgressListener = window.aiv.onVisionIndexProgress((next) => {
      if (!active) return
      setProgress(next)
      if (next.status === 'completed' || next.status === 'cancelled') {
        void window.aiv.getVisionStatus().then((latest) => { if (active) setStatus(latest) }).catch(() => undefined)
      }
    })
    return () => {
      active = false
      removeProgressListener()
    }
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

  const startIndex = (): void => {
    if (app.state.playlist.length === 0 || isBusy) return
    setError(null)
    setProgress(null)
    void window.aiv.startVisionIndex({ mediaPaths: app.state.playlist.map((file) => file.path), intervalSeconds: 3 }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  const startFolderIndex = (): void => {
    if (folder.videoPaths.length === 0 || isBusy) return
    setError(null)
    setProgress(null)
    void window.aiv.startVisionIndex({ mediaPaths: folder.videoPaths, intervalSeconds: 3 }).catch((reason: unknown) => {
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
    void window.aiv.searchVisionText({ query, limit: 24, mode: 'hybrid' }).then(setResults).catch((reason: unknown) => {
      setResults([])
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => setIsSearching(false))
  }

  const runImageSearch = (): void => {
    if (!sampleImagePath || isSearching) return
    setIsSearching(true)
    setError(null)
    void window.aiv.searchVisionImage({ imagePath: sampleImagePath, limit: 24 }).then(setResults).catch((reason: unknown) => {
      setResults([])
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
      window.setTimeout(() => app.seekTo(result.timestampSeconds), 120)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const progressLabel = progress?.status === 'loading'
    ? app.copy.vision.loading
    : progress?.status === 'indexing'
      ? app.copy.vision.indexing(progress.processedFrames, progress.totalFrames, progress.currentVideoIndex, progress.totalVideos)
      : progress?.status === 'completed'
        ? progress.skippedVideos > 0 || progress.captionOnlyVideos > 0
          ? app.copy.vision.completedIncremental(progress.processedFrames, progress.skippedVideos, progress.captionOnlyVideos)
          : app.copy.vision.completed(progress.processedFrames)
        : progress?.status === 'cancelled'
          ? app.copy.vision.cancelled
          : status?.indexedFrameCount
            ? app.copy.vision.indexReady(status.indexedFrameCount)
            : null

  return <div className="vision-panel">
    <section className="vision-card vision-intro">
      <div className="vision-heading"><div><span className="panel-kicker">{app.copy.panels.visionKicker}</span><h2>{app.copy.panels.visionTitle}</h2></div><ScanSearch size={18} /></div>
      <p>{app.copy.vision.description}</p>
      <div className="vision-model-status"><Database size={14} /><span>{status?.available ? app.copy.vision.model : app.copy.vision.unavailable}</span><small>{status?.indexedFrameCount ?? 0}</small></div>
      {!status?.available ? <small className="vision-error">{status?.message ?? app.copy.vision.unavailable}</small> : null}
      <VisionLibraryFolder copy={app.copy.vision} folderPath={folder.folderPath} savedFolders={folder.savedFolders} videoPaths={folder.videoPaths} includeSubfolders={folder.includeSubfolders} scanProgress={folder.scanProgress} batchScanProgress={folder.batchScanProgress} isBusy={isBusy} onChooseFolder={folder.chooseFolder} onScanFolder={folder.scanCurrentFolder} onScanAllFolders={folder.scanAllFolders} onIncludeSubfoldersChange={folder.setIncludeSubfolders} onStartIndex={startFolderIndex} onUseFolder={folder.useSavedFolder} onRemoveFolder={folder.removeSavedFolder} />
      <div className="vision-index-actions">
        <button className="vision-primary-action" type="button" onClick={startIndex} disabled={isBusy || app.state.playlist.length === 0}><Database size={15} />{app.copy.vision.indexPlaylist}</button>
        {isBusy ? <button className="vision-secondary-action" type="button" onClick={cancelCurrentTask}><Square size={13} />{app.copy.vision.cancelIndex}</button> : null}
      </div>
      {progressLabel ? <div className="vision-progress" role="status"><span>{progressLabel}</span><span>{progress?.currentVideoPath ? progress.currentVideoPath.split(/[\\/]/).pop() : ''}</span></div> : null}
    </section>

    <section className="vision-card vision-search-card">
      <form className="vision-text-search" onSubmit={(event) => { event.preventDefault(); runTextSearch() }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={app.copy.vision.textPlaceholder} aria-label={app.copy.vision.textPlaceholder} />
        <button className="vision-search-button" type="submit" disabled={!query.trim() || isSearching}><Search size={15} />{app.copy.vision.hybridSearch}</button>
      </form>
      <div className="vision-image-search">
        <label className="vision-file-picker"><ImageUp size={15} /><span>{sampleImageName ?? app.copy.vision.chooseImage}</span><input type="file" accept="image/*" onChange={handleImageChange} /></label>
        <button className="vision-search-button" type="button" onClick={runImageSearch} disabled={!sampleImagePath || isSearching}><Search size={15} />{app.copy.vision.searchImage}</button>
      </div>
    </section>

    {error ? <div className="vision-error vision-error-card" role="alert">{error}</div> : null}
    <VisionSearchResults copy={app.copy.vision} results={results} thumbnailUrls={thumbnailUrls} onOpenResult={openResult} />
  </div>
}
