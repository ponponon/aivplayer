import { BookOpen, Clapperboard, FilePlus, RefreshCw, Sparkles, TestTube, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { DramaProject, DramaProjectData, DramaProviderSettings } from '../../../shared/drama-types'
import { useAppContext } from './app-context'

export function DramaPanel(): React.ReactElement {
  const app = useAppContext()
  const copy = app.copy.drama
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [projects, setProjects] = useState<DramaProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [data, setData] = useState<DramaProjectData | null>(null)
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [providerSettings, setProviderSettings] = useState<DramaProviderSettings | null>(null)
  const [providerBaseUrl, setProviderBaseUrl] = useState('')
  const [providerModel, setProviderModel] = useState('')
  const [providerKey, setProviderKey] = useState('')
  const [providerMock, setProviderMock] = useState(false)
  const [providerBusy, setProviderBusy] = useState(false)
  const [providerMessage, setProviderMessage] = useState<string | null>(null)

  const refreshProjects = async (preferredId?: string): Promise<void> => {
    const next = await window.aiv.listDramaProjects()
    setProjects(next)
    const nextId = preferredId ?? selectedProjectId
    setSelectedProjectId(next.some((project) => project.id === nextId) ? nextId : next[0]?.id ?? '')
  }

  const refreshData = async (projectId = selectedProjectId): Promise<void> => {
    if (!projectId) {
      setData(null)
      return
    }
    setData(await window.aiv.getDramaProjectData(projectId))
  }

  useEffect(() => {
    let active = true
    void refreshProjects().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    const removeProgress = window.aiv.onDramaProgress((value) => {
      if (active) setProgress(copy.progress(value.message))
    })
    return () => {
      active = false
      removeProgress()
    }
  }, [])

  useEffect(() => {
    let active = true
    void window.aiv.getDramaProviderSettings().then((settings) => {
      if (!active) return
      setProviderSettings(settings)
      setProviderBaseUrl(settings.apiBaseUrl ?? '')
      setProviderModel(settings.model ?? '')
      setProviderMock(settings.useMock)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (!selectedProjectId) {
      setData(null)
      return () => { active = false }
    }
    void refreshData(selectedProjectId).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [selectedProjectId])

  const createProject = (): void => {
    if (!title.trim() || busy) return
    setBusy(true)
    setError(null)
    void window.aiv.createDramaProject({ title, genre }).then(async (project) => {
      setTitle('')
      setGenre('')
      await refreshProjects(project.id)
      await refreshData(project.id)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setBusy(false))
  }

  const importNovel = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !selectedProjectId || busy) return
    const path = window.aiv.getPathForFile(file)
    if (!path) return
    setBusy(true)
    setError(null)
    void window.aiv.readFileContent(path).then((text) => window.aiv.importDramaText(selectedProjectId, text)).then(async () => {
      await refreshData()
      await refreshProjects(selectedProjectId)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setBusy(false))
  }

  const execute = (action: () => Promise<unknown>): void => {
    if (!selectedProjectId || busy) return
    setBusy(true)
    setError(null)
    setProgress(copy.loading)
    void action().then(() => refreshData()).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setBusy(false))
  }

  const saveProvider = (testAfterSave = false): void => {
    if (providerBusy) return
    setProviderBusy(true)
    setProviderMessage(null)
    void window.aiv.setDramaProviderSettings({ apiBaseUrl: providerBaseUrl, model: providerModel, apiKey: providerKey.trim() || undefined, useMock: providerMock }).then(async (settings) => {
      setProviderSettings(settings)
      setProviderKey('')
      setProviderMessage(copy.providerSaved)
      if (testAfterSave) {
        const result = await window.aiv.testDramaProvider()
        setProviderMessage(result.message)
      }
    }).catch((reason: unknown) => setProviderMessage(reason instanceof Error ? reason.message : String(reason))).finally(() => setProviderBusy(false))
  }

  const clearProviderKey = (): void => {
    if (providerBusy) return
    setProviderBusy(true)
    void window.aiv.setDramaProviderSettings({ apiKey: null }).then((settings) => {
      setProviderSettings(settings)
      setProviderKey('')
      setProviderMessage(copy.providerSaved)
    }).catch((reason: unknown) => setProviderMessage(reason instanceof Error ? reason.message : String(reason))).finally(() => setProviderBusy(false))
  }

  const selectedChapterCount = data?.chapters.length ?? 0
  const eventsReady = selectedChapterCount > 0 && data?.chapters.every((chapter) => chapter.eventStatus === 'completed')
  const scriptReady = Boolean(data?.scripts.some((script) => script.episodeIndex === 1 && script.content))
  const assetsReady = (data?.assets.length ?? 0) > 0
  const storyboardReady = (data?.storyboards.length ?? 0) > 0

  return <div className="drama-panel">
    <section className="drama-card drama-intro">
      <div className="drama-heading"><div><span className="panel-kicker">{app.copy.panels.dramaKicker}</span><h2>{app.copy.panels.dramaTitle}</h2></div><Clapperboard size={18} /></div>
      <p>{copy.description}</p>
      <small className="drama-hint">{copy.configurationHint}</small>
    </section>

    <section className="drama-card drama-provider-card">
      <div className="drama-section-heading"><strong>{copy.providerTitle}</strong><TestTube size={16} /></div>
      <p>{copy.providerDescription}</p>
      <input value={providerBaseUrl} onChange={(event) => setProviderBaseUrl(event.target.value)} placeholder={copy.apiBaseUrl} aria-label={copy.apiBaseUrl} disabled={providerBusy} />
      <div className="drama-create-fields"><input value={providerModel} onChange={(event) => setProviderModel(event.target.value)} placeholder={copy.model} aria-label={copy.model} disabled={providerBusy} /><input type="password" value={providerKey} onChange={(event) => setProviderKey(event.target.value)} placeholder={providerSettings?.apiKeyConfigured ? copy.apiKeyPlaceholder : copy.apiKey} aria-label={copy.apiKey} autoComplete="new-password" disabled={providerBusy} /></div>
      <label className="drama-provider-toggle"><input type="checkbox" checked={providerMock} onChange={(event) => setProviderMock(event.target.checked)} disabled={providerBusy} /><span><strong>{copy.mockMode}</strong><small>{copy.mockModeDescription}</small></span></label>
      <div className="drama-actions"><button className="drama-secondary-action" type="button" onClick={() => saveProvider(false)} disabled={providerBusy}><FilePlus size={14} />{copy.saveProvider}</button><button className="drama-primary-action" type="button" onClick={() => saveProvider(true)} disabled={providerBusy}>{providerBusy ? copy.testingProvider : copy.testProvider}</button>{providerSettings?.apiKeyConfigured ? <button className="drama-secondary-action" type="button" onClick={clearProviderKey} disabled={providerBusy}>{copy.clearApiKey}</button> : null}</div>
      {providerMessage ? <div className="drama-progress" role="status">{providerMessage}</div> : null}
    </section>

    <section className="drama-card drama-project-card">
      <div className="drama-section-heading"><strong>{copy.chooseProject}</strong><button className="drama-icon-button" type="button" onClick={() => void refreshProjects()} title={copy.refresh} aria-label={copy.refresh}><RefreshCw size={14} /></button></div>
      {projects.length > 0 ? <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} aria-label={copy.chooseProject}>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select> : <div className="drama-empty"><BookOpen size={18} /><span>{copy.noProjects}</span><small>{copy.createFirst}</small></div>}
      <div className="drama-create-fields"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy.titlePlaceholder} aria-label={copy.titlePlaceholder} /><input value={genre} onChange={(event) => setGenre(event.target.value)} placeholder={copy.genrePlaceholder} aria-label={copy.genrePlaceholder} /></div>
      <div className="drama-actions"><button className="drama-primary-action" type="button" onClick={createProject} disabled={!title.trim() || busy}><FilePlus size={14} />{copy.create}</button><button className="drama-secondary-action" type="button" onClick={() => fileInputRef.current?.click()} disabled={!selectedProjectId || busy}><Upload size={14} />{copy.import}</button><input ref={fileInputRef} className="drama-file-input" type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={importNovel} /></div>
    </section>

    {data ? <section className="drama-card drama-workflow-card">
      <div className="drama-project-meta"><strong>{data.project.title}</strong><span>{copy.chapters(selectedChapterCount)} · {copy.scripts(data.scripts.length)} · {copy.assets(data.assets.length)} · {copy.storyboard(data.storyboards.length)}</span></div>
      <div className="drama-stage-list">
        <StageRow label={copy.events} ready={Boolean(eventsReady)} />
        <StageRow label={copy.skeleton} ready={Boolean(data.plan?.storySkeleton)} />
        <StageRow label={copy.adaptation} ready={Boolean(data.plan?.adaptationStrategy)} />
        <StageRow label={copy.assets(data.assets.length)} ready={assetsReady} />
        <StageRow label={`${copy.storyboardStage} · ${copy.storyboard(data.storyboards.length)}`} ready={storyboardReady} />
      </div>
      <div className="drama-actions drama-stage-actions">
        <button className="drama-secondary-action" type="button" disabled={busy || selectedChapterCount === 0} onClick={() => execute(() => window.aiv.generateDramaEvents(selectedProjectId))}><Sparkles size={14} />{copy.generateEvents}</button>
        <button className="drama-secondary-action" type="button" disabled={busy || selectedChapterCount === 0} onClick={() => execute(() => window.aiv.generateDramaSkeleton(selectedProjectId))}><Sparkles size={14} />{copy.generateSkeleton}</button>
        <button className="drama-secondary-action" type="button" disabled={busy || selectedChapterCount === 0} onClick={() => execute(() => window.aiv.generateDramaAdaptation(selectedProjectId))}><Sparkles size={14} />{copy.generateAdaptation}</button>
        <button className="drama-primary-action" type="button" disabled={busy || selectedChapterCount === 0} onClick={() => execute(() => window.aiv.generateDramaScript(selectedProjectId, 1))}><Clapperboard size={14} />{copy.generateScript}</button>
        <button className="drama-secondary-action" type="button" disabled={busy || selectedChapterCount === 0} onClick={() => execute(() => window.aiv.generateDramaAssets(selectedProjectId))}><Sparkles size={14} />{copy.generateAssets}</button>
        <button className="drama-primary-action" type="button" disabled={busy || !scriptReady} onClick={() => execute(() => window.aiv.generateDramaStoryboard(selectedProjectId, 1))}><Clapperboard size={14} />{copy.generateStoryboard}</button>
      </div>
      {progress ? <div className="drama-progress" role="status">{progress}</div> : null}
      {data.scripts[0] ? <article className="drama-script-preview"><strong>{data.scripts[0].title}</strong><p>{data.scripts[0].content}</p></article> : null}
      {data.storyboards[0] ? <article className="drama-script-preview"><strong>{copy.storyboardStage} · {data.storyboards[0].title}</strong><p>{data.storyboards[0].location} · {data.storyboards[0].characters.join('、')}\n{data.storyboards[0].action}\n{data.storyboards[0].dialogue}</p></article> : null}
    </section> : null}
    {error ? <div className="drama-error" role="alert">{error}</div> : null}
  </div>
}

function StageRow({ label, ready }: { label: string; ready: boolean }): React.ReactElement {
  return <div className="drama-stage-row"><span>{label}</span><small className={ready ? 'ready' : ''}>{ready ? '✓' : '—'}</small></div>
}
