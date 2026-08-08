import { AudioLines, Check, Square, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MediaEvidenceCapabilities, MediaEvidenceDraftImportResult, MediaEvidenceTask, TtsAudioArtifact } from '../../../shared/evidence-task-types'
import type { LocaleCopy } from '../../../shared/i18n'
import { useVisionTtsDrafts } from './vision-tts-drafts'
import { VisionTtsDraftList } from './vision-tts-draft-list'

type VisionTtsTaskProps = {
  copy: LocaleCopy['vision']
  mediaPath: string | null
  currentTime: number
  onSubtitleImported?: (result: MediaEvidenceDraftImportResult) => void
}

function formatSeconds(value: number): string {
  return Math.max(0, value).toFixed(1)
}

function taskStatusLabel(copy: LocaleCopy['vision'], task: MediaEvidenceTask | null): string {
  if (!task) return ''
  if (task.status === 'queued') return copy.ttsQueued
  if (task.status === 'running' || task.status === 'retrying') return copy.ttsProcessing(Math.round(task.progress * 100))
  if (task.status === 'cancelled') return copy.ttsCancelled
  if (task.status === 'failed') return task.error ?? copy.ttsFailed
  return copy.ttsCompleted
}

export function VisionTtsTask({ copy, mediaPath, currentTime, onSubtitleImported }: VisionTtsTaskProps): React.ReactElement {
  const [capabilities, setCapabilities] = useState<MediaEvidenceCapabilities | null>(null)
  const [task, setTask] = useState<MediaEvidenceTask | null>(null)
  const [startInput, setStartInput] = useState('0.0')
  const [endInput, setEndInput] = useState('5.0')
  const [textInput, setTextInput] = useState('')
  const [draftText, setDraftText] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { draft, drafts, pendingImport, draftBusyId, draftNotice, selectedDraftIds, clearCurrentDraft, clearPendingImport, toggleDraftSelection, saveDraft: saveDraftRequest, deleteDraft, importDraft, mergeSelectedDrafts } = useVisionTtsDrafts({ copy, mediaPath, onSubtitleImported, onError: setError })
  const isRunning = task?.status === 'queued' || task?.status === 'running' || task?.status === 'retrying'
  const audioArtifact = task?.status === 'completed'
    ? task.artifacts.find((artifact): artifact is TtsAudioArtifact => artifact.artifactType === 'tts-audio' && Boolean(artifact.audioPath))
    : null

  useEffect(() => {
    let active = true
    void window.aiv.getMediaEvidenceCapabilities().then((next) => {
      if (active) setCapabilities(next)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    const removeProgressListener = window.aiv.onMediaEvidenceTaskProgress((next) => {
      if (active && next.kind === 'tts') setTask(next)
    })
    return () => {
      active = false
      removeProgressListener()
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!audioArtifact?.audioPath) {
      setAudioPath(null)
      setAudioUrl(null)
      return () => { active = false }
    }
    setAudioPath(audioArtifact.audioPath)
    void window.aiv.createMediaFile(audioArtifact.audioPath).then((file) => {
      if (active) setAudioUrl(file.url)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [audioArtifact?.audioPath])

  useEffect(() => {
    if (task?.status !== 'completed' || !audioArtifact) return
    setDraftText(task.inputText ?? '')
    clearCurrentDraft()
  }, [audioArtifact, task?.inputText, task?.status])

  const usePlayhead = (): void => {
    const start = Math.max(0, currentTime)
    setStartInput(formatSeconds(start))
    setEndInput(formatSeconds(start + 5))
    setError(null)
  }

  const startTts = (): void => {
    if (!mediaPath || isRunning) return
    const startSeconds = Number(startInput)
    const endSeconds = Number(endInput)
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds) {
      setError(copy.ttsInvalidRange)
      return
    }
    if (!textInput.trim()) {
      setError(copy.ttsEmptyText)
      return
    }
    setError(null)
    setTask(null)
    clearCurrentDraft()
    setAudioPath(null)
    setAudioUrl(null)
    void window.aiv.startMediaEvidenceTask({
      kind: 'tts',
      mediaPath,
      inputHash: `tts:${startSeconds.toFixed(3)}:${endSeconds.toFixed(3)}:${textInput.trim()}`,
      inputText: textInput.trim(),
      ranges: [{ startSeconds, endSeconds }],
      maxRetries: 2
    }).then(setTask).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const cancelTts = (): void => {
    void window.aiv.cancelMediaEvidenceTask().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const saveDraft = (): void => {
    if (!mediaPath || !task || task.status !== 'completed' || !draftText.trim() || isSavingDraft) return
    const artifact = task.artifacts.find((candidate) => candidate.artifactType === 'tts-audio')
    if (!artifact) return
    setError(null)
    setIsSavingDraft(true)
    void saveDraftRequest({
      mediaPath,
      sourceFingerprint: task.sourceFingerprint,
      startSeconds: artifact.startSeconds,
      endSeconds: artifact.endSeconds,
      text: draftText.trim()
    }).finally(() => setIsSavingDraft(false))
  }

  const capabilityMessage = capabilities === null
    ? copy.ttsChecking
    : capabilities.tts.available
      ? copy.ttsReady
      : capabilities.tts.message || copy.ttsUnavailable

  return <section className="vision-card vision-tts-card" data-testid="vision-tts-task" data-draft-status={draft || drafts.length > 0 ? 'saved' : 'idle'}>
    <div className="vision-heading"><div><span className="panel-kicker">{copy.ttsKicker}</span><h3>{copy.ttsTitle}</h3></div><AudioLines size={17} /></div>
    <p className="vision-tts-description">{copy.ttsDescription}</p>
    <div className={`vision-tts-capability${capabilities?.tts.available ? ' is-ready' : ''}`} role="status"><span>{capabilityMessage}</span><small>{mediaPath ? mediaPath.split(/[\\/]/).pop() : copy.ttsNoMedia}</small></div>
    <label className="vision-tts-text-field"><span>{copy.ttsTextLabel}</span><textarea data-testid="vision-tts-text" value={textInput} onChange={(event) => setTextInput(event.currentTarget.value)} placeholder={copy.ttsTextPlaceholder} disabled={isRunning} rows={2} /></label>
    <div className="vision-tts-fields">
      <label><span>{copy.ttsStartLabel}</span><input data-testid="vision-tts-start" type="number" min="0" step="0.1" value={startInput} onChange={(event) => setStartInput(event.currentTarget.value)} disabled={isRunning} /></label>
      <label><span>{copy.ttsEndLabel}</span><input data-testid="vision-tts-end" type="number" min="0" step="0.1" value={endInput} onChange={(event) => setEndInput(event.currentTarget.value)} disabled={isRunning} /></label>
    </div>
    <div className="vision-index-actions">
      <button className="vision-primary-action" data-testid="vision-tts-start-button" type="button" onClick={startTts} disabled={!mediaPath || !capabilities?.tts.available || isRunning || !textInput.trim()}><Volume2 size={14} />{copy.ttsStart}</button>
      <button className="vision-secondary-action" type="button" onClick={usePlayhead} disabled={isRunning}>{copy.ttsUsePlayhead}</button>
      {isRunning ? <button className="vision-secondary-action" data-testid="vision-tts-cancel-button" type="button" onClick={cancelTts}><Square size={13} />{copy.ttsCancel}</button> : null}
    </div>
    {task ? <div className="vision-tts-status" role="status"><span>{taskStatusLabel(copy, task)}</span>{isRunning ? <strong>{Math.round(task.progress * 100)}%</strong> : null}</div> : null}
    {audioUrl ? <div className="vision-tts-audio"><span>{copy.ttsAudioLabel}</span><audio data-testid="vision-tts-audio" controls preload="metadata" src={audioUrl} /></div> : null}
    {audioPath && task?.status === 'completed' ? <div className="vision-tts-draft">
      <div className="vision-tts-draft-heading"><div><strong>{copy.ttsDraftTitle}</strong><small>{copy.ttsDraftDescription}</small></div><Check size={15} /></div>
      <label className="vision-tts-text-field"><span>{copy.ttsDraftTextLabel}</span><textarea data-testid="vision-tts-draft-text" value={draftText} onChange={(event) => setDraftText(event.currentTarget.value)} placeholder={copy.ttsDraftTextPlaceholder} rows={2} /></label>
      <button className="vision-secondary-action" data-testid="vision-tts-save-draft-button" type="button" onClick={saveDraft} disabled={!draftText.trim() || isSavingDraft}>{isSavingDraft ? copy.ttsSavingDraft : copy.ttsSaveDraft}</button>
      {draft ? <small className="vision-tts-draft-saved" data-testid="vision-tts-draft-saved">{copy.ttsDraftSaved} · {draft.draftPath.split(/[\\/]/).pop()}</small> : null}
    </div> : null}
    <VisionTtsDraftList copy={copy} drafts={drafts} pendingImportId={pendingImport?.id ?? null} draftBusyId={draftBusyId} draftNotice={draftNotice} selectedDraftIds={selectedDraftIds} onImport={importDraft} onDelete={deleteDraft} onToggleSelection={toggleDraftSelection} onMergeSelected={mergeSelectedDrafts} onCancelImport={clearPendingImport} />
    {error ? <small className="vision-error">{error}</small> : null}
  </section>
}
