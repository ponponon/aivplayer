import { Database, ImageUp, ScanSearch, Search, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { VisionIndexProgress, VisionRuntimeStatus, VisionSearchResult } from '../../../shared/media-types'
import { useAppContext } from './app-context'

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
    if (app.state.playlist.length === 0 || isIndexing) return
    setError(null)
    setProgress(null)
    void window.aiv.startVisionIndex({ mediaPaths: app.state.playlist.map((file) => file.path), intervalSeconds: 3 }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  const cancelIndex = (): void => {
    void window.aiv.cancelVisionIndex()
  }

  const runTextSearch = (): void => {
    if (!query.trim() || isSearching) return
    setIsSearching(true)
    setError(null)
    void window.aiv.searchVisionText({ query, limit: 24 }).then(setResults).catch((reason: unknown) => {
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
      ? app.copy.vision.indexing(progress.processedFrames, progress.totalFrames)
      : progress?.status === 'completed'
        ? app.copy.vision.completed(progress.processedFrames)
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
      <div className="vision-index-actions">
        <button className="vision-primary-action" type="button" onClick={startIndex} disabled={isIndexing || app.state.playlist.length === 0}><Database size={15} />{app.copy.vision.indexPlaylist}</button>
        {isIndexing ? <button className="vision-secondary-action" type="button" onClick={cancelIndex}><Square size={13} />{app.copy.vision.cancelIndex}</button> : null}
      </div>
      {progressLabel ? <div className="vision-progress" role="status"><span>{progressLabel}</span><span>{progress?.currentVideoPath ? progress.currentVideoPath.split(/[\\/]/).pop() : ''}</span></div> : null}
    </section>

    <section className="vision-card vision-search-card">
      <form className="vision-text-search" onSubmit={(event) => { event.preventDefault(); runTextSearch() }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={app.copy.vision.textPlaceholder} aria-label={app.copy.vision.textPlaceholder} />
        <button className="vision-search-button" type="submit" disabled={!query.trim() || isSearching}><Search size={15} />{app.copy.vision.searchText}</button>
      </form>
      <div className="vision-image-search">
        <label className="vision-file-picker"><ImageUp size={15} /><span>{sampleImageName ?? app.copy.vision.chooseImage}</span><input type="file" accept="image/*" onChange={handleImageChange} /></label>
        <button className="vision-search-button" type="button" onClick={runImageSearch} disabled={!sampleImagePath || isSearching}><Search size={15} />{app.copy.vision.searchImage}</button>
      </div>
    </section>

    {error ? <div className="vision-error vision-error-card" role="alert">{error}</div> : null}
    <section className="vision-results" aria-live="polite">
      {results.length === 0 ? <div className="vision-empty">{app.copy.vision.noResults}</div> : results.map((result) => <button className="vision-result" key={result.id} type="button" onClick={() => openResult(result)} title={app.copy.vision.clickResult}>
        {thumbnailUrls[result.id] ? <img src={thumbnailUrls[result.id]} alt="" /> : <span className="vision-result-placeholder"><ScanSearch size={18} /></span>}
        <span className="vision-result-copy"><strong>{result.fileName}</strong><span>{formatTimestamp(result.timestampSeconds)} · {app.copy.vision.score(result.score)}</span></span>
      </button>)}
    </section>
  </div>
}

function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const remainder = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${remainder}`
}
