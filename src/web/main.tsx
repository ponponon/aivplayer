import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { WebRemoteCommand, WebShareMediaDetails, WebShareMediaItem, WebShareLibraryResponse, WebSubtitleTrack, WebTranscodeStatus } from '../shared/web-types'
import { buildWebLibraryTree, filterWebLibraryItems, getHistoryEntry, isInProgress, readWebLibraryPreferences, sortWebLibraryItems, syncWebLibraryPreferencesToUrl, writeWebLibraryPreferences, type WebLibraryPreferences } from './library-state'
import { DetailsPanel, LibrarySidebar, LoginScreen, PlayerPanel } from './web-panels'
import { useDesktopState } from './use-desktop-state'
import { useDesktopFollow } from './use-desktop-follow'
import { useVisibleSelection } from './use-visible-selection'
import { readJson } from './web-ui'
import { useWebCopyLink } from './use-web-copy-link'
import { useWebLibraryBatch } from './use-web-library-batch'
import './styles.css'
import './library-styles.css'

type SessionResponse = { authenticated: boolean }
function WebApp(): ReactElement {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [items, setItems] = useState<WebShareMediaItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [details, setDetails] = useState<WebShareMediaDetails | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [subtitleTrack, setSubtitleTrack] = useState('off')
  const [audioTrack, setAudioTrack] = useState('direct')
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [followDesktop, setFollowDesktop] = useState(true)
  const [preferences, setPreferences] = useState<WebLibraryPreferences>(() => readWebLibraryPreferences())
  const [transcodeStatus, setTranscodeStatus] = useState<WebTranscodeStatus | null>(null)
  const [transcodePlaybackUrl, setTranscodePlaybackUrl] = useState<string | null>(null)
  const [transcodingIds, setTranscodingIds] = useState<Set<string>>(() => new Set())
  const transcodingIdsRef = useRef<Set<string>>(new Set())
  const selectedIdRef = useRef<string | null>(null)
  const detailsRequestIdRef = useRef(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const lastSavedAtRef = useRef(0)
  const autoPlayNextRef = useRef(false)
  const { desktopState, allowRemoteControl } = useDesktopState(authenticated === true)
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null
  const { copyLinkStatus, copyLinkMessage, copySelectedLink } = useWebCopyLink(selected)
  selectedIdRef.current = selected?.id ?? null
  const selectedWithDetails = selected && details?.id === selected.id ? { ...selected, browserSupport: details.browserSupport } : selected
  const isTranscoding = selected ? transcodingIds.has(selected.id) : false
  const visibleItems = useMemo(() => sortWebLibraryItems(filterWebLibraryItems(items, query, preferences), preferences), [items, preferences, query])
  const tree = useMemo(() => buildWebLibraryTree(items), [items])
  const updatePreferences = useCallback((updater: (current: WebLibraryPreferences) => WebLibraryPreferences): void => {
    setPreferences((current) => updater(current))
  }, [])
  const batch = useWebLibraryBatch(visibleItems, preferences, updatePreferences)
  useEffect(() => { writeWebLibraryPreferences(preferences); syncWebLibraryPreferencesToUrl(preferences) }, [preferences])
  const sendRemoteCommand = useCallback(async (command: WebRemoteCommand): Promise<void> => {
    setRemoteError(null)
    try {
      await readJson<{ accepted: boolean }>('/api/v1/desktop/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) })
    } catch (reason) {
      setRemoteError(reason instanceof Error ? reason.message : '远程控制失败')
    }
  }, [])
  const loadLibrary = useCallback(async (refresh = false): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await readJson<WebShareLibraryResponse>(refresh ? '/api/v1/library/refresh' : '/api/v1/library', refresh ? { method: 'POST' } : undefined)
      setItems(result.items)
      setSelectedId((current) => current && result.items.some((item) => item.id === current) ? current : result.items[0]?.id ?? null)
      updatePreferences((current) => {
        const selectedNodeStillExists = current.selectedGroupId === 'all' || filterWebLibraryItems(result.items, '', { ...current, filter: 'all' }).length > 0
        return {
          ...current,
          favorites: current.favorites.filter((id) => result.items.some((item) => item.id === id)),
          selectedGroupId: selectedNodeStillExists ? current.selectedGroupId : 'all'
        }
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取媒体库')
    } finally {
      setIsLoading(false)
    }
  }, [updatePreferences])
  const login = async (token: string): Promise<void> => {
    setError(null)
    try {
      await readJson<SessionResponse>('/api/v1/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      setAuthenticated(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '访问令牌无效')
    }
  }
  const saveProgress = useCallback((item: WebShareMediaItem, position: number, duration: number | null): void => {
    if (!Number.isFinite(position) || position <= 0) return
    const now = Date.now()
    if (now - lastSavedAtRef.current < 2_000 && position < (preferences.history[item.id]?.position ?? 0) + 5) return
    lastSavedAtRef.current = now
    updatePreferences((current) => ({ ...current, history: { ...current.history, [item.id]: { position, duration: duration && duration > 0 ? duration : null, updatedAt: now } } }))
  }, [preferences.history, updatePreferences])
  const selectItem = useCallback((item: WebShareMediaItem, autoPlay = false): void => {
    autoPlayNextRef.current = autoPlay
    setSelectedId(item.id)
    setIsPlaying(false)
    setError(null)
    if (allowRemoteControl) void sendRemoteCommand({ type: 'select', mediaId: item.id })
  }, [allowRemoteControl, sendRemoteCommand])
  useDesktopFollow({ followDesktop, desktopState, items, selected, videoRef, selectItem })

  useVisibleSelection(visibleItems, selected, setSelectedId, setIsPlaying)
  const playAdjacent = useCallback((direction: -1 | 1, autoPlay = true): void => {
    if (!selected) return
    const index = visibleItems.findIndex((item) => item.id === selected.id)
    const next = visibleItems[index + direction]
    if (next) selectItem(next, autoPlay)
  }, [selectItem, selected, visibleItems])

  const requestTranscode = async (itemId: string): Promise<void> => {
    if (transcodingIdsRef.current.has(itemId)) return
    transcodingIdsRef.current.add(itemId)
    setTranscodingIds((current) => new Set(current).add(itemId))
    setError(null)
    try {
      let status = await readJson<WebTranscodeStatus>(`/api/v1/media/${itemId}/transcode`, { method: 'POST' })
      if (selectedIdRef.current === itemId) setTranscodeStatus(status)
      for (let attempt = 0; attempt < 720 && status.state !== 'ready' && status.state !== 'error'; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000))
        status = await readJson<WebTranscodeStatus>(`/api/v1/transcode/${itemId}`)
        if (selectedIdRef.current === itemId) setTranscodeStatus(status)
      }
      if (selectedIdRef.current === itemId) {
        setTranscodeStatus(status)
        if (status.state === 'ready' && status.streamUrl) { setTranscodePlaybackUrl(status.streamUrl); setError(null) }
        else if (status.state === 'error') setError(status.message ?? '浏览器转码失败')
      }
    } catch (reason) {
      if (selectedIdRef.current === itemId) setError(reason instanceof Error ? reason.message : '无法启动浏览器转码')
    } finally {
      transcodingIdsRef.current.delete(itemId)
      setTranscodingIds((current) => { const next = new Set(current); next.delete(itemId); return next })
    }
  }

  useEffect(() => {
    void readJson<SessionResponse>('/api/v1/session').then((result) => {
      setAuthenticated(result.authenticated)
      if (result.authenticated) void loadLibrary()
    }).catch(() => setAuthenticated(false))
  }, [loadLibrary])

  useEffect(() => {
    const requestId = detailsRequestIdRef.current + 1
    detailsRequestIdRef.current = requestId
    setDetails(null)
    setTranscodeStatus(null)
    setTranscodePlaybackUrl(null)
    setSubtitleTrack('off')
    setAudioTrack('direct')
    if (!selected) return
    void readJson<WebShareMediaDetails>(`/api/v1/media/${selected.id}`).then((nextDetails) => {
      if (detailsRequestIdRef.current !== requestId) return
      setDetails(nextDetails)
      setSubtitleTrack(nextDetails.subtitleTracks.find((track) => track.default)?.id ?? nextDetails.subtitleTracks[0]?.id ?? 'off')
    }).catch(() => undefined)
    void readJson<WebTranscodeStatus>(`/api/v1/transcode/${selected.id}`).then((status) => {
      if (detailsRequestIdRef.current !== requestId) return
      setTranscodeStatus(status)
      if (status.state === 'ready' && status.streamUrl) setTranscodePlaybackUrl(status.streamUrl)
    }).catch(() => undefined)
  }, [selected])

  useEffect(() => {
    const save = (): void => { if (selected && videoRef.current) saveProgress(selected, videoRef.current.currentTime, videoRef.current.duration) }
    window.addEventListener('pagehide', save)
    return () => { window.removeEventListener('pagehide', save); save() }
  }, [saveProgress, selected])

  if (authenticated === null) return <main className="loading-page">正在连接 AIVPlayer…</main>
  if (!authenticated) return <LoginScreen onLogin={login} error={error} />

  const currentHistory = selected ? getHistoryEntry(preferences, selected.id) : null
  const selectedSubtitleTrack: WebSubtitleTrack | null = details?.subtitleTracks.find((track) => track.id === subtitleTrack) ?? (selected?.subtitleUrl ? { id: 'sidecar', label: '外挂字幕', url: selected.subtitleUrl, language: null, codec: 'webvtt', streamIndex: null, default: true } : null)
  const selectedAudioTrack = details?.audioTracks.find((track) => track.id === audioTrack) ?? null
  const mediaPlaybackUrl = transcodePlaybackUrl ?? selectedAudioTrack?.streamUrl ?? selected?.streamUrl ?? null
  const isSelectedFavorite = selected ? preferences.favorites.includes(selected.id) : false
  const selectedIndex = selected ? visibleItems.findIndex((item) => item.id === selected.id) : -1
  const desktopItem = desktopState?.currentMediaId ? items.find((item) => item.id === desktopState.currentMediaId) ?? null : null

  return <div className="web-shell">
    <header className="web-topbar">
      <div className="brand-lockup"><span className="brand-mark">A</span><strong>AIVPlayer</strong><span>LAN Web</span></div>
      <div className="connection-status"><span className="status-dot" />局域网连接<span className="status-divider">·</span>{items.length} 个文件</div>
      <button className="text-button" type="button" onClick={() => setFollowDesktop((current) => !current)}>{followDesktop ? '取消跟随 Desktop' : '跟随 Desktop'}</button>
      <button className="text-button" type="button" onClick={() => void loadLibrary(true)} disabled={isLoading} title={preferences.selectedGroupId === 'all' ? '重新扫描全部共享媒体' : '重新扫描当前目录'}>{isLoading ? '刷新中…' : preferences.selectedGroupId === 'all' ? '刷新媒体库' : '刷新目录'}</button>
    </header>
    <main className="web-layout">
      <LibrarySidebar items={items} visibleItems={visibleItems} tree={tree} selectedId={selected?.id ?? null} query={query} preferences={preferences} selectionMode={batch.selectionMode} selectedBatchIds={batch.selectedIds} allVisibleSelected={batch.allVisibleSelected} allSelectedFavorited={batch.allSelectedFavorited} onQueryChange={(value) => { setFollowDesktop(false); setQuery(value) }} onSelect={selectItem} onSelectNode={(nodeId) => { setFollowDesktop(false); updatePreferences((current) => ({ ...current, selectedGroupId: nodeId })) }} updatePreferences={updatePreferences} onEnterSelectionMode={batch.enterSelectionMode} onExitSelectionMode={batch.exitSelectionMode} onToggleBatchSelection={batch.toggleSelection} onSelectAllVisible={batch.selectAllVisible} onClearBatchSelection={batch.clearSelection} onBatchFavorite={batch.toggleFavorites} />
      <PlayerPanel selected={selected} selectedWithDetails={selectedWithDetails} selectedSubtitleTrack={selectedSubtitleTrack} currentHistory={currentHistory} showResume={Boolean(selected && currentHistory && isInProgress(selected, preferences))} selectedIndex={selectedIndex} queueItems={visibleItems} mediaPlaybackUrl={mediaPlaybackUrl} isPlaying={isPlaying} isSelectedFavorite={isSelectedFavorite} desktopState={desktopState} allowRemoteControl={allowRemoteControl} desktopItem={desktopItem} remoteError={remoteError} error={error} isTranscoding={isTranscoding} transcodeStatus={transcodeStatus} canRequestTranscode={audioTrack === 'direct' && !transcodePlaybackUrl} videoRef={videoRef} autoPlayNextRef={autoPlayNextRef} onSelect={selectItem} onPlayAdjacent={playAdjacent} onToggleFavorite={() => selected && updatePreferences((current) => ({ ...current, favorites: current.favorites.includes(selected.id) ? current.favorites.filter((id) => id !== selected.id) : [...current.favorites, selected.id] }))} onSendRemoteCommand={(command) => void sendRemoteCommand(command)} onSaveProgress={saveProgress} onSetPlaying={setIsPlaying} onRequestTranscode={(itemId) => void requestTranscode(itemId)} onClearError={() => setError(null)} onSetError={setError} />
      <DetailsPanel item={selectedWithDetails} details={details} subtitleTrack={subtitleTrack} audioTrack={audioTrack} copyLinkStatus={copyLinkStatus} copyLinkMessage={copyLinkMessage} onCopyLink={() => void copySelectedLink()} onSubtitleTrackChange={setSubtitleTrack} onAudioTrackChange={(trackId) => { setAudioTrack(trackId); setTranscodePlaybackUrl(null) }} />
    </main>
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><WebApp /></StrictMode>)
