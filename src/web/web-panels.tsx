import { useState, type FormEvent, type MutableRefObject, type ReactElement, type RefObject } from 'react'
import type { WebDesktopState, WebRemoteCommand, WebShareMediaDetails, WebShareMediaItem, WebSubtitleTrack, WebTranscodeStatus } from '../shared/web-types'
import { getHistoryEntry, getWebLibraryBreadcrumbs, getWebLibraryDirectoryItems, type WebLibraryFilterMode, type WebLibraryPreferences, type WebLibrarySortMode, type WebLibraryTreeNode } from './library-state'
import { buildWebBatchDownloadUrl, formatBytes, formatDuration, formatProgress, getSupportClass, getSupportLabel, getTranscodeStateLabel, isImageMediaItem } from './web-ui'

export function LoginScreen({ onLogin, error }: { onLogin: (token: string) => Promise<void>; error: string | null }): ReactElement {
  const [token, setToken] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!token.trim() || isSubmitting) return
    setIsSubmitting(true)
    try { await onLogin(token.trim()) } finally { setIsSubmitting(false) }
  }
  return <main className="login-page"><section className="login-panel"><div className="brand-lockup"><span className="brand-mark">A</span><strong>AIVPlayer</strong><span>LAN Web</span></div><h1>连接本机媒体库</h1><p>请输入 AIVPlayer 桌面端显示的局域网访问令牌。视频不会上传到云端。</p><form onSubmit={submit}><label htmlFor="access-token">访问令牌</label><input id="access-token" value={token} onChange={(event) => setToken(event.currentTarget.value)} autoComplete="off" spellCheck={false} placeholder="粘贴访问令牌" /><button type="submit" disabled={!token.trim() || isSubmitting}>{isSubmitting ? '连接中…' : '连接媒体库'}</button></form>{error ? <p className="error-message" role="alert">{error}</p> : null}</section></main>
}

export function LibraryItem({ item, selected, favorite, history, selectionMode, selectedForBatch, onSelect, onToggleSelection, onToggleFavorite }: { item: WebShareMediaItem; selected: boolean; favorite: boolean; history: ReturnType<typeof getHistoryEntry>; selectionMode: boolean; selectedForBatch: boolean; onSelect: () => void; onToggleSelection: () => void; onToggleFavorite: () => void }): ReactElement {
  const progress = history?.duration && history.duration > 0 ? Math.min(100, history.position / history.duration * 100) : 0
  const image = isImageMediaItem(item)
  return <div className={`library-item ${selected ? 'is-selected' : ''} ${selectionMode ? 'is-selection-mode' : ''} ${selectedForBatch ? 'is-batch-selected' : ''}`}><button className="library-item-select" type="button" onClick={selectionMode ? onToggleSelection : onSelect} aria-pressed={selectionMode ? selectedForBatch : undefined} title={selectionMode ? (selectedForBatch ? `取消选择 ${item.name}` : `选择 ${item.name}`) : item.name}><span className="library-thumbnail"><img src={item.thumbnailUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /><span className="thumbnail-fallback">{image ? '▧' : '▶'}</span></span><span className="library-item-copy"><span className="library-item-title">{item.name}</span><span className="library-item-path">{item.relativePath}</span><span className="library-item-meta"><span>{item.extension.replace(/^\./u, '').toUpperCase()}</span><span>{formatBytes(item.sizeBytes)}</span><span className={getSupportClass(item)}>{getSupportLabel(item)}</span></span>{progress > 0 ? <span className="library-progress"><span style={{ width: `${progress}%` }} /></span> : null}</span></button>{selectionMode ? <button className={`selection-button ${selectedForBatch ? 'is-selected' : ''}`} type="button" onClick={onToggleSelection} aria-label={selectedForBatch ? `取消选择 ${item.name}` : `选择 ${item.name}`} aria-pressed={selectedForBatch}>{selectedForBatch ? '✓' : '○'}</button> : null}<button className={`favorite-button ${favorite ? 'is-favorite' : ''}`} type="button" onClick={onToggleFavorite} aria-label={favorite ? `取消收藏 ${item.name}` : `收藏 ${item.name}`} title={favorite ? '取消收藏' : '收藏'}>{favorite ? '★' : '☆'}</button></div>
}

export type WebTranscodeTaskEntry = { item: WebShareMediaItem; status: WebTranscodeStatus; updatedAt: number }

export function TaskCenterPanel({ tasks, onSelect, onRetry }: { tasks: WebTranscodeTaskEntry[]; onSelect: (item: WebShareMediaItem) => void; onRetry: (itemId: string) => void }): ReactElement {
  const activeCount = tasks.filter(({ status }) => status.state === 'queued' || status.state === 'running').length
  return <section className="task-center-panel" aria-label="任务中心"><div className="task-center-heading"><div><span className="panel-kicker">TASKS</span><strong>任务中心</strong></div><span>{activeCount > 0 ? `${activeCount} 个进行中` : `${tasks.length} 条记录`}</span></div>{tasks.length === 0 ? <div className="task-center-empty">暂无转码任务</div> : <div className="task-center-list">{tasks.map(({ item, status }) => <div className={`task-center-item task-state-${status.state}`} key={item.id}><button className="task-center-select" type="button" onClick={() => onSelect(item)} title={`打开 ${item.name}`}><span className="task-center-main"><strong>{item.name}</strong><small>{getTranscodeStateLabel(status.state)}{status.message ? ` · ${status.message}` : ''}</small></span><span className="task-center-progress">{status.state === 'running' || status.state === 'queued' ? formatProgress(status.progress) : status.state === 'ready' ? formatBytes(status.outputBytes) : status.state === 'error' ? '重试可用' : ''}</span></button>{status.state === 'error' ? <button className="task-center-retry" type="button" onClick={() => onRetry(item.id)}>重试</button> : null}</div>)}</div>}</section>
}

export function DetailsPanel({ item, details, subtitleTrack, audioTrack, copyLinkStatus, copyLinkMessage, onCopyLink, onSubtitleTrackChange, onAudioTrackChange }: { item: WebShareMediaItem | null; details: WebShareMediaDetails | null; subtitleTrack: string; audioTrack: string; copyLinkStatus: 'idle' | 'copying' | 'success' | 'error'; copyLinkMessage: string | null; onCopyLink: () => void; onSubtitleTrackChange: (trackId: string) => void; onAudioTrackChange: (trackId: string) => void }): ReactElement {
  if (!item) return <aside className="details-panel"><div className="empty-panel"><strong>选择一个媒体</strong><span>媒体信息会显示在这里</span></div></aside>
  const image = isImageMediaItem(item)
  const metadata = details?.metadata
  const subtitleTracks: WebSubtitleTrack[] = details?.subtitleTracks ?? (item.subtitleUrl ? [{ id: 'sidecar', label: '外挂字幕', url: item.subtitleUrl, language: null, codec: 'webvtt', streamIndex: null, default: true }] : [])
  const audioTracks = details?.audioTracks ?? []
  return <aside className="details-panel"><div className="panel-heading"><div><span className="panel-kicker">DETAILS</span><h2>媒体信息</h2></div><span className={`support-mark ${getSupportClass(item)}`}>{getSupportLabel(item)}</span></div><div className="details-actions"><a className="details-action-button" href={`/download/${item.id}`} target="_blank" rel="noreferrer">下载原文件</a><button className="details-action-button" type="button" onClick={onCopyLink} disabled={copyLinkStatus === 'copying'}>{copyLinkStatus === 'copying' ? '生成链接…' : '复制共享链接'}</button></div>{copyLinkMessage ? <div className={`details-action-status is-${copyLinkStatus}`} role="status">{copyLinkMessage}</div> : null}<dl className="details-list"><div><dt>文件名</dt><dd title={item.name}>{item.name}</dd></div><div><dt>文件大小</dt><dd>{formatBytes(item.sizeBytes)}</dd></div><div><dt>所在目录</dt><dd title={item.relativePath}>{item.sourceGroupLabel}</dd></div><div><dt>类型</dt><dd>{image ? '图片' : '视频'}</dd></div><div><dt>容器</dt><dd>{item.extension.replace(/^\./u, '').toUpperCase()}</dd></div>{!image ? <><div><dt>时长</dt><dd>{formatDuration(details?.durationSeconds ?? item.durationSeconds)}</dd></div><div><dt>视频编码</dt><dd>{metadata?.video?.codec ?? item.videoCodec ?? '等待探测'}</dd></div><div><dt>音频编码</dt><dd>{metadata?.audio?.codec ?? item.audioCodec ?? '等待探测'}</dd></div>{metadata?.video ? <div><dt>分辨率</dt><dd>{metadata.video.width && metadata.video.height ? `${metadata.video.width} × ${metadata.video.height}` : '未知'}</dd></div> : null}{metadata?.video?.bitRateKbps ? <div><dt>视频码率</dt><dd>{Math.round(metadata.video.bitRateKbps)} kbps</dd></div> : null}</> : null}</dl>{!image && subtitleTracks.length > 0 ? <label className="media-select"><span>字幕</span><select value={subtitleTrack} onChange={(event) => onSubtitleTrackChange(event.currentTarget.value)}><option value="off">关闭字幕</option>{subtitleTracks.map((track) => <option key={track.id} value={track.id}>{track.label}{track.language ? ` · ${track.language}` : ''}</option>)}</select></label> : null}{!image && audioTracks.length > 1 ? <label className="media-select"><span>音轨</span><select value={audioTrack} onChange={(event) => onAudioTrackChange(event.currentTarget.value)}><option value="direct">默认音轨</option>{audioTracks.map((track) => <option key={track.id} value={track.id}>{track.label}{track.language ? ` · ${track.language}` : ''}{track.codec ? ` · ${track.codec}` : ' · 未知编码'}</option>)}</select><small>切换音轨会在本机生成一个只包含所选音轨的 MP4，不修改原文件。</small></label> : null}<div className="details-note">{image ? '图片通过局域网媒体流加载，不会上传到云端；可直接下载原文件或复制当前共享链接。' : '播放采用 HTTP Range，拖动时只请求目标位置附近的数据，不会一次下载完整文件。'}</div></aside>
}

function LibraryTreeNodeView({ node, depth, preferences, onSelect, onSelectNode, updatePreferences }: { node: WebLibraryTreeNode; depth: number; preferences: WebLibraryPreferences; onSelect: (item: WebShareMediaItem) => void; onSelectNode: (nodeId: string) => void; updatePreferences: (updater: (current: WebLibraryPreferences) => WebLibraryPreferences) => void }): ReactElement {
  const expandable = node.children.length > 0
  const expanded = preferences.expandedGroups.includes(node.id)
  const selected = preferences.selectedGroupId === node.id
  const item = node.item
  const toggleExpanded = (): void => updatePreferences((current) => ({ ...current, expandedGroups: expanded ? current.expandedGroups.filter((id) => id !== node.id) : [...current.expandedGroups, node.id] }))
  return <div className="library-tree-node"><div className={`library-tree-row ${selected ? 'is-selected' : ''}`} style={{ paddingLeft: `${depth * 13 + 5}px` }}>{expandable ? <button className="library-tree-toggle" type="button" onClick={toggleExpanded} aria-label={expanded ? `折叠 ${node.label}` : `展开 ${node.label}`}>{expanded ? '▾' : '▸'}</button> : <span className="library-tree-toggle-spacer" />}{item ? <button className="library-tree-select is-file" type="button" onClick={() => onSelect(item)} title={node.relativePath}><span className="library-tree-icon">▸</span><span className="library-tree-label">{node.label}</span><span className="library-tree-count">{node.itemCount}</span></button> : <button className="library-tree-select" type="button" onClick={() => onSelectNode(node.id)} title={node.relativePath || node.label}><span className="library-tree-icon">{node.kind === 'group' ? '▣' : '▰'}</span><span className="library-tree-label">{node.label}</span><span className="library-tree-count">{node.itemCount}</span></button>}</div>{expanded ? <div className="library-tree-children">{node.children.map((child) => <LibraryTreeNodeView key={child.id} node={child} depth={depth + 1} preferences={preferences} onSelect={onSelect} onSelectNode={onSelectNode} updatePreferences={updatePreferences} />)}</div> : null}</div>
}

type LibrarySidebarProps = {
  items: WebShareMediaItem[]
  visibleItems: WebShareMediaItem[]
  tree: WebLibraryTreeNode[]
  selectedId: string | null
  query: string
  preferences: WebLibraryPreferences
  selectionMode: boolean
  selectedBatchIds: string[]
  allVisibleSelected: boolean
  allSelectedFavorited: boolean
  onQueryChange: (query: string) => void
  onSelect: (item: WebShareMediaItem) => void
  onSelectNode: (nodeId: string) => void
  updatePreferences: (updater: (current: WebLibraryPreferences) => WebLibraryPreferences) => void
  onEnterSelectionMode: () => void
  onExitSelectionMode: () => void
  onToggleBatchSelection: (id: string) => void
  onSelectAllVisible: () => void
  onClearBatchSelection: () => void
  onBatchFavorite: () => void
  transcodeTasks: WebTranscodeTaskEntry[]
  onSelectTask: (item: WebShareMediaItem) => void
  onRetryTranscode: (itemId: string) => void
}

export function LibrarySidebar({ items, visibleItems, tree, selectedId, query, preferences, selectionMode, selectedBatchIds, allVisibleSelected, allSelectedFavorited, onQueryChange, onSelect, onSelectNode, updatePreferences, onEnterSelectionMode, onExitSelectionMode, onToggleBatchSelection, onSelectAllVisible, onClearBatchSelection, onBatchFavorite, transcodeTasks, onSelectTask, onRetryTranscode }: LibrarySidebarProps): ReactElement {
  const breadcrumbs = getWebLibraryBreadcrumbs(tree, preferences.selectedGroupId)
  const currentDirectoryItems = getWebLibraryDirectoryItems(items, preferences)
  const currentDirectoryDownloadUrl = buildWebBatchDownloadUrl(currentDirectoryItems.map((item) => item.id))
  const handleItemSelect = (item: WebShareMediaItem): void => { if (selectionMode) onToggleBatchSelection(item.id); else onSelect(item) }
  return <aside className="library-panel"><div className="panel-heading"><div><span className="panel-kicker">LIBRARY</span><h1>媒体库</h1></div><span className="item-count">{visibleItems.length}/{items.length}</span></div><label className="search-field"><span>搜索</span><input value={query} onChange={(event) => onQueryChange(event.currentTarget.value)} placeholder="搜索文件名或目录" /></label><div className="library-toolbar"><label><span>排序</span><select value={preferences.sort} onChange={(event) => { const value = event.currentTarget.value as WebLibrarySortMode; updatePreferences((current) => ({ ...current, sort: value })) }}><option value="name-asc">名称 A → Z</option><option value="name-desc">名称 Z → A</option><option value="recent">最近播放</option><option value="size-desc">文件最大</option><option value="duration-desc">时长最长</option></select></label><label><span>筛选</span><select value={preferences.filter} onChange={(event) => { const value = event.currentTarget.value as WebLibraryFilterMode; updatePreferences((current) => ({ ...current, filter: value })) }}><option value="all">全部媒体</option><option value="favorites">我的收藏</option><option value="in-progress">继续观看</option><option value="unwatched">未观看</option></select></label></div><div className="library-view-toggle" role="group" aria-label="媒体库视图"><button className={preferences.view === 'list' ? 'is-selected' : ''} type="button" onClick={() => updatePreferences((current) => ({ ...current, view: 'list' }))} aria-pressed={preferences.view === 'list'}>列表</button><button className={preferences.view === 'grid' ? 'is-selected' : ''} type="button" onClick={() => updatePreferences((current) => ({ ...current, view: 'grid' }))} aria-pressed={preferences.view === 'grid'}>网格</button></div><div className="library-batch-toolbar">{selectionMode ? <><div className="library-batch-heading"><strong>多选媒体</strong><span>{selectedBatchIds.length} / {visibleItems.length} 已选</span></div><div className="library-batch-actions"><button type="button" onClick={onSelectAllVisible} disabled={visibleItems.length === 0}>{allVisibleSelected ? '取消全选' : '全选当前列表'}</button><button type="button" onClick={onClearBatchSelection} disabled={selectedBatchIds.length === 0}>清空</button></div><div className="library-batch-actions"><button type="button" onClick={onBatchFavorite} disabled={selectedBatchIds.length === 0}>{allSelectedFavorited ? '批量取消收藏' : '批量收藏'}</button><a className={`library-batch-button ${selectedBatchIds.length === 0 ? 'is-disabled' : ''}`} href={buildWebBatchDownloadUrl(selectedBatchIds)} onClick={(event) => { if (selectedBatchIds.length === 0) event.preventDefault() }}>下载选中</a><button type="button" onClick={onExitSelectionMode}>退出多选</button></div></> : <div className="library-batch-entry-row"><button className="library-batch-entry" type="button" onClick={onEnterSelectionMode}>多选</button><a className={`library-batch-button ${currentDirectoryItems.length === 0 ? 'is-disabled' : ''}`} href={currentDirectoryDownloadUrl} onClick={(event) => { if (currentDirectoryItems.length === 0) event.preventDefault() }}>下载当前目录</a></div>}</div><TaskCenterPanel tasks={transcodeTasks} onSelect={onSelectTask} onRetry={onRetryTranscode} /><div className="library-tree"><button className={`library-tree-all ${preferences.selectedGroupId === 'all' ? 'is-selected' : ''}`} type="button" onClick={() => onSelectNode('all')}><span>▦</span><span>全部媒体</span><span>{items.length}</span></button>{tree.map((node) => <LibraryTreeNodeView key={node.id} node={node} depth={0} preferences={preferences} onSelect={handleItemSelect} onSelectNode={onSelectNode} updatePreferences={updatePreferences} />)}</div>{breadcrumbs.length > 0 ? <nav className="library-breadcrumbs" aria-label="当前目录"><button type="button" onClick={() => onSelectNode('all')}>全部媒体</button>{breadcrumbs.map((node) => <span key={node.id}><span aria-hidden="true">/</span><button type="button" onClick={() => onSelectNode(node.id)}>{node.label}</button></span>)}</nav> : null}<div className={`library-list ${preferences.view === 'grid' ? 'is-grid' : ''}`}>{visibleItems.map((item) => <LibraryItem key={item.id} item={item} selected={item.id === selectedId} selectedForBatch={selectedBatchIds.includes(item.id)} selectionMode={selectionMode} favorite={preferences.favorites.includes(item.id)} history={getHistoryEntry(preferences, item.id)} onSelect={() => onSelect(item)} onToggleSelection={() => onToggleBatchSelection(item.id)} onToggleFavorite={() => updatePreferences((current) => ({ ...current, favorites: current.favorites.includes(item.id) ? current.favorites.filter((id) => id !== item.id) : [...current.favorites, item.id] }))} />)}{visibleItems.length === 0 ? <div className="empty-panel"><strong>{items.length === 0 ? '还没有共享媒体' : '没有匹配文件'}</strong><span>{items.length === 0 ? '请在桌面端打开视频后重新刷新' : '换一个搜索词、筛选条件或目录试试'}</span></div> : null}</div></aside>
}

type PlayerPanelProps = {
  selected: WebShareMediaItem | null
  selectedWithDetails: WebShareMediaItem | null
  selectedSubtitleTrack: WebSubtitleTrack | null
  currentHistory: ReturnType<typeof getHistoryEntry>
  showResume: boolean
  selectedIndex: number
  queueItems: WebShareMediaItem[]
  mediaPlaybackUrl: string | null
  isPlaying: boolean
  isSelectedFavorite: boolean
  desktopState: WebDesktopState | null
  allowRemoteControl: boolean
  desktopItem: WebShareMediaItem | null
  remoteError: string | null
  error: string | null
  isTranscoding: boolean
  transcodeStatus: WebTranscodeStatus | null
  canRequestTranscode: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  autoPlayNextRef: MutableRefObject<boolean>
  onSelect: (item: WebShareMediaItem) => void
  onPlayAdjacent: (direction: -1 | 1) => void
  onToggleFavorite: () => void
  onSendRemoteCommand: (command: WebRemoteCommand) => void
  onSaveProgress: (item: WebShareMediaItem, position: number, duration: number | null) => void
  onSetPlaying: (playing: boolean) => void
  onRequestTranscode: (itemId: string) => void
  onClearError: () => void
  onSetError: (message: string) => void
}

export function PlayerPanel({ selected, selectedWithDetails, selectedSubtitleTrack, currentHistory, showResume, selectedIndex, queueItems, mediaPlaybackUrl, isPlaying, isSelectedFavorite, desktopState, allowRemoteControl, desktopItem, remoteError, error, isTranscoding, transcodeStatus, canRequestTranscode, videoRef, autoPlayNextRef, onSelect, onPlayAdjacent, onToggleFavorite, onSendRemoteCommand, onSaveProgress, onSetPlaying, onRequestTranscode, onClearError, onSetError }: PlayerPanelProps): ReactElement {
  const queueLength = queueItems.length
  const image = isImageMediaItem(selected)
  return <section className="player-panel">
    <div className="player-heading"><div><span className="panel-kicker">NOW PLAYING · {selectedIndex >= 0 ? String(selectedIndex + 1) + '/' + queueLength : '—'}</span><h2 title={selected?.name}>{selected?.name ?? 'AIVPlayer LAN Web'}</h2></div><span className="player-format">{selected?.extension.replace(/^\./u, '').toUpperCase() ?? '—'}</span></div>
    <div className="desktop-sync-panel"><div className="desktop-sync-heading"><span className={'status-dot ' + (desktopState ? 'is-live' : 'is-idle')} /><div><strong>Desktop 联动</strong><span>{desktopState?.currentMediaName ? (desktopState.isPlaying ? '正在播放' : '已暂停') + ' · ' + desktopState.currentMediaName : '等待桌面端播放状态'}</span></div>{desktopItem ? <button type="button" onClick={() => onSelect(desktopItem)}>跟随当前</button> : null}</div>{desktopState ? <div className="desktop-sync-progress"><span>{formatDuration(desktopState.currentTime)} / {formatDuration(desktopState.duration)}</span><span>{desktopState.playbackRate.toFixed(2)}×</span><span>{allowRemoteControl ? '允许远程控制' : '仅状态同步'}</span></div> : null}{allowRemoteControl ? <div className="remote-controls"><button type="button" onClick={() => onSendRemoteCommand({ type: 'previous' })}>上一部</button><button type="button" onClick={() => onSendRemoteCommand({ type: desktopState?.isPlaying ? 'pause' : 'play' })}>{desktopState?.isPlaying ? '暂停 Desktop' : '播放 Desktop'}</button><button type="button" onClick={() => onSendRemoteCommand({ type: 'next' })}>下一部</button>{desktopState ? <button type="button" onClick={() => onSendRemoteCommand({ type: 'seek', position: desktopState.currentTime })}>同步到此处</button> : null}</div> : null}{remoteError ? <span className="remote-error">{remoteError}</span> : null}</div>
    <div className={'video-frame' + (image ? ' image-frame' : '')}>{selected ? image ? <img className="web-image-preview" src={selected.streamUrl} alt={selected.name} decoding="async" /> : <video ref={videoRef} key={selected.id + ':' + (mediaPlaybackUrl ?? 'direct')} src={mediaPlaybackUrl ?? selected.streamUrl} controls playsInline preload="metadata" onLoadedMetadata={(event) => { const video = event.currentTarget; if (currentHistory && currentHistory.position < video.duration - 10) video.currentTime = currentHistory.position; if (autoPlayNextRef.current) { autoPlayNextRef.current = false; void video.play().catch(() => undefined) } }} onTimeUpdate={(event) => onSaveProgress(selected, event.currentTarget.currentTime, event.currentTarget.duration)} onPlay={() => onSetPlaying(true)} onPause={(event) => { onSetPlaying(false); onSaveProgress(selected, event.currentTarget.currentTime, event.currentTarget.duration) }} onEnded={() => { onSaveProgress(selected, videoRef.current?.duration ?? selected.durationSeconds ?? 0, videoRef.current?.duration ?? selected.durationSeconds); onPlayAdjacent(1) }} onError={() => { if (canRequestTranscode) onRequestTranscode(selected.id); else onSetError('浏览器无法播放当前媒体版本') }}>{selectedSubtitleTrack ? <track kind="subtitles" src={selectedSubtitleTrack.url} label={selectedSubtitleTrack.label} default /> : null}</video> : <div className="video-empty"><span className="play-symbol">▶</span><strong>从左侧选择媒体</strong><span>视频会在当前浏览器中播放，图片会在这里预览</span></div>}</div>
    {selected && !image && showResume ? <div className="resume-banner">已记录到 {formatDuration(currentHistory?.position ?? 0)}，当前文件会自动从上次位置继续</div> : null}
    {selectedWithDetails && !image && (selectedWithDetails.browserSupport === 'needs-transcode' || transcodeStatus?.state === 'queued' || transcodeStatus?.state === 'running' || transcodeStatus?.state === 'ready' || transcodeStatus?.state === 'error') ? <div className="transcode-panel"><div><strong>{transcodeStatus?.state === 'ready' ? '已准备浏览器版本' : '这个文件可能需要转码'}</strong><span>{transcodeStatus?.state === 'queued' ? '正在等待本机转码队列…' : transcodeStatus?.state === 'running' ? '正在生成兼容版本 · ' + formatProgress(transcodeStatus.progress) : '原文件保留不变，转码结果只缓存在本机。'}</span>{selectedWithDetails.sizeBytes >= 1024 ** 3 && transcodeStatus?.state !== 'ready' ? <span className="transcode-size-note">这是大文件，首次转码可能需要较长时间，并额外占用约 {formatBytes(selectedWithDetails.sizeBytes)} 磁盘空间。</span> : null}</div>{transcodeStatus?.state !== 'ready' ? <button type="button" onClick={() => onRequestTranscode(selectedWithDetails.id)} disabled={isTranscoding}>{isTranscoding ? '转码中…' : '开始转码播放'}</button> : null}</div> : null}
    {error ? <div className="player-error" role="alert">{error}<button className="inline-button" type="button" onClick={onClearError}>关闭</button></div> : null}
    <div className="player-controls"><button type="button" onClick={() => onPlayAdjacent(-1)} disabled={!selected || selectedIndex <= 0}>上一部</button><button type="button" onClick={() => onPlayAdjacent(1)} disabled={!selected || selectedIndex < 0 || selectedIndex >= queueLength - 1}>下一部</button><button type="button" className={isSelectedFavorite ? 'is-favorite' : ''} onClick={onToggleFavorite} disabled={!selected}>{isSelectedFavorite ? '★ 已收藏' : '☆ 收藏'}</button></div>
    <div className="queue-panel"><div className="queue-heading"><span>播放队列</span><span>{queueItems.length} 个媒体</span></div><div className="queue-list">{queueItems.map((item, index) => <button className={'queue-item ' + (item.id === selected?.id ? 'is-selected' : '')} type="button" key={item.id} onClick={() => onSelect(item)}><span className="queue-index">{index + 1}</span><span className="queue-copy"><strong>{item.name}</strong><small>{item.relativePath}</small></span><span className="queue-format">{item.extension.replace(/^\./u, '').toUpperCase()}</span></button>)}</div></div>
    <div className="player-footer"><span>{isPlaying ? '正在播放' : image ? '图片预览' : selected ? '已暂停' : '等待选择'}</span><span>当前 Web 媒体队列 · 原始文件直流 · 不上传</span></div>
  </section>
}
