import { StrictMode, useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { WebShareMediaDetails, WebShareMediaItem, WebShareLibraryResponse } from '../shared/web-types'
import './styles.css'

type SessionResponse = { authenticated: boolean }
type ApiError = { message?: string }

function isApiError(value: unknown): value is ApiError {
  return value !== null && typeof value === 'object' && 'message' in value
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = -1
  do {
    value /= 1024
    unitIndex += 1
  } while (value >= 1024 && unitIndex < units.length - 1)
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '--:--'
  const totalSeconds = Math.round(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainder = totalSeconds % 60
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function getSupportLabel(item: WebShareMediaItem): string {
  if (item.browserSupport === 'likely') return '浏览器优先支持'
  if (item.browserSupport === 'possible') return '浏览器兼容性待确认'
  if (item.browserSupport === 'needs-transcode') return '可能需要转码'
  return '格式待确认'
}

function getSupportClass(item: WebShareMediaItem): string {
  return `support-${item.browserSupport}`
}

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const body = await response.json() as T | ApiError
  if (!response.ok) throw new Error(isApiError(body) && typeof body.message === 'string' ? body.message : `请求失败（${response.status}）`)
  return body as T
}

function LoginScreen({ onLogin, error }: { onLogin: (token: string) => Promise<void>; error: string | null }): ReactElement {
  const [token, setToken] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!token.trim() || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onLogin(token.trim())
    } finally {
      setIsSubmitting(false)
    }
  }
  return <main className="login-page">
    <section className="login-panel">
      <div className="brand-lockup"><span className="brand-mark">A</span><strong>AIVPlayer</strong><span>LAN Web</span></div>
      <h1>连接本机媒体库</h1>
      <p>请输入 AIVPlayer 桌面端显示的局域网访问令牌。视频不会上传到云端。</p>
      <form onSubmit={submit}>
        <label htmlFor="access-token">访问令牌</label>
        <input id="access-token" value={token} onChange={(event) => setToken(event.currentTarget.value)} autoComplete="off" spellCheck={false} placeholder="粘贴访问令牌" />
        <button type="submit" disabled={!token.trim() || isSubmitting}>{isSubmitting ? '连接中…' : '连接媒体库'}</button>
      </form>
      {error ? <p className="error-message" role="alert">{error}</p> : null}
    </section>
  </main>
}

function LibraryItem({ item, selected, onSelect }: { item: WebShareMediaItem; selected: boolean; onSelect: () => void }): ReactElement {
  return <button className={`library-item ${selected ? 'is-selected' : ''}`} type="button" onClick={onSelect} title={item.name}>
    <span className="library-item-title">{item.name}</span>
    <span className="library-item-meta"><span>{item.extension.replace(/^\./u, '').toUpperCase()}</span><span>{formatBytes(item.sizeBytes)}</span><span className={getSupportClass(item)}>{getSupportLabel(item)}</span></span>
  </button>
}

function DetailsPanel({ item, details }: { item: WebShareMediaItem | null; details: WebShareMediaDetails | null }): ReactElement {
  if (!item) return <aside className="details-panel"><div className="empty-panel"><strong>选择一个视频</strong><span>媒体信息会显示在这里</span></div></aside>
  const metadata = details?.metadata
  return <aside className="details-panel">
    <div className="panel-heading"><div><span className="panel-kicker">DETAILS</span><h2>媒体信息</h2></div><span className={`support-mark ${getSupportClass(item)}`}>{getSupportLabel(item)}</span></div>
    <dl className="details-list">
      <div><dt>文件名</dt><dd title={item.name}>{item.name}</dd></div>
      <div><dt>文件大小</dt><dd>{formatBytes(item.sizeBytes)}</dd></div>
      <div><dt>容器</dt><dd>{item.extension.replace(/^\./u, '').toUpperCase()}</dd></div>
      <div><dt>时长</dt><dd>{formatDuration(details?.durationSeconds ?? item.durationSeconds)}</dd></div>
      <div><dt>视频编码</dt><dd>{metadata?.video?.codec ?? item.videoCodec ?? '等待探测'}</dd></div>
      <div><dt>音频编码</dt><dd>{metadata?.audio?.codec ?? item.audioCodec ?? '等待探测'}</dd></div>
      {metadata?.video ? <div><dt>分辨率</dt><dd>{metadata.video.width && metadata.video.height ? `${metadata.video.width} × ${metadata.video.height}` : '未知'}</dd></div> : null}
      {metadata?.video?.bitRateKbps ? <div><dt>视频码率</dt><dd>{Math.round(metadata.video.bitRateKbps)} kbps</dd></div> : null}
    </dl>
    <div className="details-note">播放采用 HTTP Range，拖动时只请求目标位置附近的数据，不会一次下载完整文件。</div>
  </aside>
}

function WebApp(): ReactElement {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [items, setItems] = useState<WebShareMediaItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [details, setDetails] = useState<WebShareMediaDetails | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null
  const filteredItems = items.filter((item) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  const loadLibrary = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await readJson<WebShareLibraryResponse>('/api/v1/library')
      setItems(result.items)
      setSelectedId((current) => current && result.items.some((item) => item.id === current) ? current : result.items[0]?.id ?? null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取媒体库')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const login = async (token: string): Promise<void> => {
    setError(null)
    try {
      await readJson<SessionResponse>('/api/v1/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      setAuthenticated(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '访问令牌无效')
    }
  }

  useEffect(() => {
    void readJson<SessionResponse>('/api/v1/session').then((result) => {
      setAuthenticated(result.authenticated)
      if (result.authenticated) void loadLibrary()
    }).catch(() => setAuthenticated(false))
  }, [loadLibrary])

  useEffect(() => {
    setDetails(null)
    if (!selected) return
    void readJson<WebShareMediaDetails>(`/api/v1/media/${selected.id}`).then(setDetails).catch(() => undefined)
  }, [selected])

  if (authenticated === null) return <main className="loading-page">正在连接 AIVPlayer…</main>
  if (!authenticated) return <LoginScreen onLogin={login} error={error} />

  return <div className="web-shell">
    <header className="web-topbar">
      <div className="brand-lockup"><span className="brand-mark">A</span><strong>AIVPlayer</strong><span>LAN Web</span></div>
      <div className="connection-status"><span className="status-dot" />局域网连接<span className="status-divider">·</span>{items.length} 个文件</div>
      <button className="text-button" type="button" onClick={() => void loadLibrary()} disabled={isLoading}>{isLoading ? '刷新中…' : '刷新媒体库'}</button>
    </header>
    <main className="web-layout">
      <aside className="library-panel">
        <div className="panel-heading"><div><span className="panel-kicker">LIBRARY</span><h1>媒体库</h1></div><span className="item-count">{filteredItems.length}</span></div>
        <label className="search-field"><span>搜索</span><input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="搜索文件名" /></label>
        <div className="library-list">
          {filteredItems.map((item) => <LibraryItem key={item.id} item={item} selected={selected?.id === item.id} onSelect={() => setSelectedId(item.id)} />)}
          {filteredItems.length === 0 ? <div className="empty-panel"><strong>{items.length === 0 ? '还没有共享媒体' : '没有匹配文件'}</strong><span>{items.length === 0 ? '请在桌面端打开视频后重新刷新' : '换一个搜索词试试'}</span></div> : null}
        </div>
      </aside>
      <section className="player-panel">
        <div className="player-heading"><div><span className="panel-kicker">NOW PLAYING</span><h2 title={selected?.name}>{selected?.name ?? 'AIVPlayer LAN Web'}</h2></div><span className="player-format">{selected?.extension.replace(/^\./u, '').toUpperCase() ?? '—'}</span></div>
        <div className="video-frame">
          {selected ? <video key={selected.id} src={selected.streamUrl} controls playsInline preload="metadata" onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onError={() => setError('浏览器无法直接解码这个文件。可以先尝试其他视频，后续可加入转码缓存。')}><>{selected.subtitleUrl ? <track kind="subtitles" src={selected.subtitleUrl} label="外挂字幕" default /> : null}</></video> : <div className="video-empty"><span className="play-symbol">▶</span><strong>从左侧选择视频</strong><span>视频会在当前浏览器中直接播放</span></div>}
        </div>
        {error ? <div className="player-error" role="alert">{error}<button className="inline-button" type="button" onClick={() => setError(null)}>关闭</button></div> : null}
        <div className="player-footer"><span>{isPlaying ? '正在播放' : selected ? '已暂停' : '等待选择'}</span><span>原始文件直流 · 不上传</span></div>
      </section>
      <DetailsPanel item={selected} details={details} />
    </main>
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><WebApp /></StrictMode>)
