import { ArrowDownToLine, AudioLines, Ban, Image, Plus, Search, Video } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DramaAsset, DramaGenerationTask, DramaGenerationTaskInput, DramaGenerationTaskStatus, DramaGenerationMediaType } from '../../../shared/drama-types'
import type { LocaleCopy } from '../../../shared/i18n'

type QueueFilter = 'all' | DramaGenerationMediaType

type DramaGenerationQueueProps = {
  assets: readonly DramaAsset[]
  tasks: readonly DramaGenerationTask[]
  copy: LocaleCopy['drama']
  busy: boolean
  onCreate: (input: DramaGenerationTaskInput) => void
  onCancel: (task: DramaGenerationTask) => void
  canHandoff: boolean
  onHandoff: (task: DramaGenerationTask) => void
}

export function DramaGenerationQueue({ assets, tasks, copy, busy, onCreate, onCancel, canHandoff, onHandoff }: DramaGenerationQueueProps): React.ReactElement {
  const [filter, setFilter] = useState<QueueFilter>('all')
  const [mediaType, setMediaType] = useState<DramaGenerationMediaType>('image')
  const [targetId, setTargetId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [query, setQuery] = useState('')
  const visibleTasks = useMemo(() => tasks.filter((task) => {
    if (filter !== 'all' && task.mediaType !== filter) return false
    if (!query.trim()) return true
    return `${task.prompt} ${task.message}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  }).slice().reverse(), [filter, query, tasks])

  const mediaLabel = (value: DramaGenerationMediaType): string => value === 'image' ? copy.generationMediaImage : value === 'video' ? copy.generationMediaVideo : copy.generationMediaAudio
  const statusLabel = (value: DramaGenerationTaskStatus): string => value === 'queued' ? copy.generationQueued : value === 'running' ? copy.generationRunning : value === 'completed' ? copy.generationCompleted : value === 'failed' ? copy.generationFailed : copy.generationCancelled
  const mediaIcon = (value: DramaGenerationMediaType): React.ReactElement => value === 'image' ? <Image size={13} aria-hidden="true" /> : value === 'video' ? <Video size={13} aria-hidden="true" /> : <AudioLines size={13} aria-hidden="true" />

  const enqueue = (): void => {
    if (!prompt.trim() || busy) return
    onCreate({ mediaType, targetId: targetId || undefined, prompt: prompt.trim(), message: copy.generationQueuedMessage })
    setPrompt('')
    setTargetId('')
  }

  return <section className="drama-generation-queue" data-testid="drama-generation-queue" aria-label={copy.generationQueueTitle}>
    <div className="drama-generation-heading"><div><strong>{copy.generationQueueTitle}</strong><small>{copy.generationQueuedMessage}</small></div><Plus size={15} /></div>
    <p className="drama-generation-description">{copy.generationQueueDescription}</p>
    <div className="drama-generation-form">
      <div className="drama-generation-form-row"><label><span>{copy.generationMediaAll}</span><select value={mediaType} onChange={(event) => setMediaType(event.currentTarget.value as DramaGenerationMediaType)}><option value="image">{copy.generationMediaImage}</option><option value="video">{copy.generationMediaVideo}</option><option value="audio">{copy.generationMediaAudio}</option></select></label><label><span>{copy.generationTarget}</span><select value={targetId} onChange={(event) => setTargetId(event.currentTarget.value)}><option value="">{copy.generationTargetNone}</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label></div>
      <label><span>{copy.generationPrompt}</span><textarea value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} placeholder={copy.generationPromptPlaceholder} rows={2} /></label>
      <button className="drama-primary-action" type="button" onClick={enqueue} disabled={busy || !prompt.trim()}><Plus size={13} />{copy.generationEnqueue}</button>
    </div>
    <div className="drama-generation-toolbar"><div className="drama-generation-filters" role="tablist" aria-label={copy.generationQueueTitle}>{(['all', 'image', 'video', 'audio'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? copy.generationMediaAll : mediaLabel(value)}</button>)}</div><label className="drama-generation-search"><Search size={12} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={copy.assetSearchPlaceholder} aria-label={copy.assetSearchPlaceholder} /></label></div>
    {visibleTasks.length > 0 ? <div className="drama-generation-list" data-testid="drama-generation-list">{visibleTasks.map((task) => <article className="drama-generation-task" key={task.id} data-testid={`drama-generation-task-${task.id}`}><div className="drama-generation-task-heading"><span>{mediaIcon(task.mediaType)}{mediaLabel(task.mediaType)}</span><strong className={`drama-generation-status ${task.status}`}>{statusLabel(task.status)}</strong></div><p>{task.prompt}</p><small>{task.message}{task.targetId ? ` · ${assets.find((asset) => asset.id === task.targetId)?.name ?? task.targetId}` : ''}</small><div className="drama-generation-task-actions">{task.resultPath && task.status === 'completed' && canHandoff ? <button className="drama-secondary-action" type="button" onClick={() => onHandoff(task)} disabled={busy}><ArrowDownToLine size={12} />{copy.generationHandoff}</button> : null}{task.status === 'queued' || task.status === 'running' ? <button className="drama-icon-button drama-generation-cancel" type="button" onClick={() => onCancel(task)} disabled={busy} title={copy.generationCancel} aria-label={`${copy.generationCancel}: ${task.prompt}`}><Ban size={13} /></button> : null}</div></article>)}</div> : <p className="drama-generation-empty">{tasks.length > 0 ? copy.generationNoMatch : copy.generationEmpty}</p>}
    <p className="drama-generation-hint">{copy.generationNotStarted}</p>
  </section>
}
