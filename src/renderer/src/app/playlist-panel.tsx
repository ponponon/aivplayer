import { ArrowLeft, FolderOpen, History, ListFilter, ListX, Play, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { formatTime } from '../lib/time'
import { isUnfinishedPlaybackHistoryEntry, type PlaybackHistoryEntry } from '../../../shared/playback-history'
import { useAppContext } from './app-context'

type HistoryContextMenuState = {
  entry: PlaybackHistoryEntry
  x: number
  y: number
}

export function PlaylistPanel(): React.ReactElement {
  const app = useAppContext()
  const { state, copy } = app
  const [view, setView] = useState<'playlist' | 'history'>('playlist')
  const [historyFilter, setHistoryFilter] = useState<'all' | 'unfinished'>('all')
  const [unavailableHistoryPaths, setUnavailableHistoryPaths] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<HistoryContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const history = app.appSettings.playback.history
  const historyDateFormatter = useMemo(() => new Intl.DateTimeFormat(app.appSettings.ui.locale, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }), [app.appSettings.ui.locale])
  const getHistoryProgress = (entry: PlaybackHistoryEntry): number | undefined => app.appSettings.playback.lastProgressByPath[entry.path]
  const isUnfinishedHistoryEntry = (entry: PlaybackHistoryEntry): boolean => isUnfinishedPlaybackHistoryEntry(entry, getHistoryProgress(entry))
  const unfinishedHistoryCount = history.filter(isUnfinishedHistoryEntry).length
  const visibleHistory = historyFilter === 'unfinished' ? history.filter(isUnfinishedHistoryEntry) : history
  const formatHistoryMeta = (entry: PlaybackHistoryEntry): string => {
    const playedAt = historyDateFormatter.format(new Date(entry.lastPlayedAt))
    const progress = getHistoryProgress(entry) ?? 0
    return copy.panels.historyMeta(playedAt, progress > 0 ? formatTime(progress) : null)
  }
  const getHistoryProgressPercent = (entry: PlaybackHistoryEntry): number | null => {
    const progress = getHistoryProgress(entry) ?? 0
    const duration = entry.durationSeconds
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(progress) || progress <= 0) return null
    return Math.min(100, Math.max(0, progress / duration * 100))
  }
  const isHistoryView = view === 'history'
  const unavailableHistoryCount = unavailableHistoryPaths.size
  const isFilteredHistoryEmpty = isHistoryView && historyFilter === 'unfinished' && history.length > 0 && visibleHistory.length === 0
  const items = isHistoryView ? visibleHistory : state.playlist
  const isEmpty = items.length === 0
  useEffect(() => {
    if (!isHistoryView) return
    let cancelled = false
    void Promise.all(history.map(async (entry) => {
      try {
        return [entry.path, await window.aiv.isMediaFileAvailable(entry.path)] as const
      } catch {
        return [entry.path, false] as const
      }
    })).then((results) => {
      if (cancelled) return
      setUnavailableHistoryPaths(new Set(results.filter(([, available]) => !available).map(([path]) => path)))
    })
    return () => { cancelled = true }
  }, [history, isHistoryView])
  const handleHistoryItemClick = async (entry: PlaybackHistoryEntry): Promise<void> => {
    if (await app.openHistoryItem(entry)) return
    setUnavailableHistoryPaths((current) => new Set(current).add(entry.path))
  }
  const handleHistoryContextMenu = (event: MouseEvent<HTMLButtonElement>, entry: PlaybackHistoryEntry): void => {
    event.preventDefault()
    const anchorX = event.clientX > 0 ? event.clientX : event.currentTarget.getBoundingClientRect().right
    const anchorY = event.clientY > 0 ? event.clientY : event.currentTarget.getBoundingClientRect().bottom
    setContextMenu({ entry, x: Math.max(8, Math.min(anchorX, window.innerWidth - 224)), y: Math.max(8, Math.min(anchorY, window.innerHeight - 148)) })
  }
  const closeHistoryContextMenu = (): void => setContextMenu(null)
  const showHistoryItemInFolder = async (entry: PlaybackHistoryEntry): Promise<void> => {
    closeHistoryContextMenu()
    if (await window.aiv.showItemInFolder(entry.path)) return
    setUnavailableHistoryPaths((current) => new Set(current).add(entry.path))
  }
  useEffect(() => {
    if (!contextMenu) return
    const handlePointerDown = (event: PointerEvent): void => {
      if (contextMenuRef.current?.contains(event.target as Node)) return
      closeHistoryContextMenu()
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeHistoryContextMenu()
    }
    const handleViewportChange = (): void => closeHistoryContextMenu()
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [contextMenu])

  return <>
    <div className="panel-header">
      <div className="panel-header-heading">
        <span className="panel-kicker">{isHistoryView ? copy.panels.historyKicker : copy.panels.playlistKicker}</span>
        <h2>{isHistoryView ? copy.panels.historyTitle : copy.panels.playlistTitle}</h2>
      </div>
      <div className="panel-header-actions">
        {isHistoryView ? <>
          <button className="panel-header-action" type="button" onClick={() => { setView('playlist'); closeHistoryContextMenu() }} title={copy.panels.backToPlaylist} aria-label={copy.panels.backToPlaylist}><ArrowLeft size={17} /></button>
          <button className={`panel-header-action history-filter-button ${historyFilter === 'unfinished' ? 'is-active' : ''}`} type="button" onClick={() => setHistoryFilter((current) => current === 'unfinished' ? 'all' : 'unfinished')} disabled={history.length === 0} title={historyFilter === 'unfinished' ? copy.panels.showAllHistory : copy.panels.showUnfinishedHistory} aria-label={historyFilter === 'unfinished' ? copy.panels.showAllHistory : copy.panels.showUnfinishedHistory} aria-pressed={historyFilter === 'unfinished'}><ListFilter size={16} />{unfinishedHistoryCount > 0 ? <span className="history-filter-count">{unfinishedHistoryCount > 99 ? '99+' : unfinishedHistoryCount}</span> : null}</button>
          {unavailableHistoryCount > 0 ? <button className="panel-header-action panel-header-action-danger history-clear-unavailable-button" type="button" onClick={() => { app.removeUnavailablePlaybackHistory([...unavailableHistoryPaths]); setUnavailableHistoryPaths(new Set()) }} title={copy.panels.clearUnavailableHistory} aria-label={copy.panels.clearUnavailableHistory}><ListX size={16} /><span className="history-unavailable-count">{unavailableHistoryCount > 99 ? '99+' : unavailableHistoryCount}</span></button> : null}
          <button className="panel-header-action panel-header-action-danger" type="button" onClick={app.clearPlaybackHistory} disabled={history.length === 0} title={copy.panels.clearHistory} aria-label={copy.panels.clearHistory}><Trash2 size={16} /></button>
        </> : <button className="panel-header-action" type="button" onClick={() => setView('history')} title={copy.panels.openHistory} aria-label={copy.panels.openHistory} aria-pressed={false}><History size={18} />{history.length > 0 ? <span className="history-count">{history.length > 99 ? '99+' : history.length}</span> : null}</button>}
      </div>
    </div>
    <div className={`playlist ${isEmpty ? 'is-empty' : ''} ${isHistoryView ? 'is-history' : ''}`}>
      {isEmpty ? <div className="panel-empty">{isFilteredHistoryEmpty ? <><ListFilter size={24} strokeWidth={1.5} /><span>{copy.panels.noUnfinishedHistory}</span><button className="history-filter-reset" type="button" onClick={() => setHistoryFilter('all')}>{copy.panels.showAllHistory}</button></> : <><History size={24} strokeWidth={1.5} /><span>{isHistoryView ? copy.panels.noHistory : copy.panels.noMedia}</span>{isHistoryView ? <small>{copy.panels.historyEmptyDescription}</small> : null}</>}</div> : isHistoryView ? visibleHistory.map((entry, index) => {
        const isUnavailable = unavailableHistoryPaths.has(entry.path)
        const progressPercent = getHistoryProgressPercent(entry)
        return <div className={`history-item ${isUnavailable ? 'is-unavailable' : ''}`} key={entry.path}>
        <button className={`history-item-main ${state.currentFile?.path === entry.path ? 'active' : ''}`} type="button" onClick={() => void handleHistoryItemClick(entry)} onContextMenu={(event) => handleHistoryContextMenu(event, entry)} title={isUnavailable ? copy.panels.historyFileUnavailable : entry.path}>
          <span className="history-index">{String(index + 1).padStart(2, '0')}</span>
          <span className="history-copy"><span className="history-name">{entry.name}</span><span className="history-meta">{isUnavailable ? copy.panels.historyFileUnavailable : formatHistoryMeta(entry)}</span>{progressPercent != null ? <span className="history-progress" aria-hidden="true"><span className="history-progress-fill" style={{ width: `${progressPercent}%` }} /></span> : null}</span>
          <span className="history-ext">{entry.extension}</span>
        </button>
        <button className="history-remove" type="button" onClick={() => app.removePlaybackHistory(entry.path)} title={copy.panels.removeHistory} aria-label={`${copy.panels.removeHistory}: ${entry.name}`}><X size={14} /></button>
      </div>
      }) : state.playlist.map((file, index) => <button className={`playlist-item ${state.currentFile?.path === file.path ? 'active' : ''}`} key={file.id} type="button" onClick={() => app.selectFile(file)}><span className="playlist-index">{String(index + 1).padStart(2, '0')}</span><span className="playlist-name">{file.name}</span><span className="playlist-ext">{file.extension}</span></button>)}
    </div>
    {contextMenu ? <div ref={contextMenuRef} className="history-context-menu" role="menu" aria-label={copy.panels.historyContextMenu} style={{ left: contextMenu.x, top: contextMenu.y }} onContextMenu={(event) => event.preventDefault()}>
      <div className="history-context-menu-heading" title={contextMenu.entry.path}>{contextMenu.entry.name}</div>
      <button className="history-context-menu-item" type="button" role="menuitem" autoFocus disabled={unavailableHistoryPaths.has(contextMenu.entry.path)} onClick={() => { closeHistoryContextMenu(); void handleHistoryItemClick(contextMenu.entry) }}><Play size={14} />{copy.panels.playHistory}</button>
      <button className="history-context-menu-item" type="button" role="menuitem" disabled={unavailableHistoryPaths.has(contextMenu.entry.path)} onClick={() => void showHistoryItemInFolder(contextMenu.entry)}><FolderOpen size={14} />{copy.panels.showHistoryInFolder}</button>
      <button className="history-context-menu-item is-danger" type="button" role="menuitem" onClick={() => { closeHistoryContextMenu(); app.removePlaybackHistory(contextMenu.entry.path) }}><Trash2 size={14} />{copy.panels.removeHistory}</button>
    </div> : null}
  </>
}
