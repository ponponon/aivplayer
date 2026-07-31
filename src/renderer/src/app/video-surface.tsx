import type { CSSProperties, SyntheticEvent } from 'react'
import { AudioLines, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { editedTimeToSource, getVideoClipSpans } from '../../../core/editing/timeline-math'
import { buildEditingClipFilterCss, isEditingClipFilterNeutral } from '../../../core/editing/filter-operations'
import { getEditingClipMotionStyle } from '../../../core/editing/clip-motion'
import { getEditingPersonMatteFeatherPixels, getEditingPersonMatteOutlinePixels, getEditingPersonMatteSettings } from '../../../core/editing/person-matte'
import { getEditingClipTransition } from '../../../core/editing/transition-operations'
import { getEditingClipTreatment, getEditingClipTreatmentAnchor, getEditingClipTreatmentScale } from '../../../core/editing/treatment-operations'
import { getEditingCanvasDimensions } from '../../../core/editing/canvases'
import { findActiveEditingVideoBlocks, getEditingVideoBlockSize } from '../../../core/editing/video-block-operations'
import { resolvePlaybackStartTime } from './playback-progress'
import { useAppContext } from './app-context'
import { createPersonMattePreviewMask } from './person-matte-preview'
import type { PersonMatteTrackFrame, PersonMatteTrackProgress } from '../../../shared/person-matte-types'

export function VideoSurface(): React.ReactElement {
  const app = useAppContext()
  const { state, copy } = app
  const editingPreviewFile = app.editingPreviewSourceId ? app.editingSourceFiles[app.editingPreviewSourceId] : null
  const mediaUrl = app.isEditingMode && editingPreviewFile ? editingPreviewFile.url : state.currentFile?.url ?? ''
  const projectEditingClip = app.isEditingMode && app.editingProject ? editedTimeToSource(app.editingProject.videoClips, app.editingCurrentTime)?.clip ?? null : null
  const currentEditingClip = projectEditingClip && app.editingClipPreview?.clipId === projectEditingClip.id ? { ...projectEditingClip, ...(app.editingClipPreview.filter === undefined ? {} : { filter: app.editingClipPreview.filter }), ...(app.editingClipPreview.treatment === undefined ? {} : { treatment: app.editingClipPreview.treatment }), ...(app.editingClipPreview.treatmentScale === undefined ? {} : { treatmentScale: app.editingClipPreview.treatmentScale }), ...(app.editingClipPreview.treatmentAnchor === undefined ? {} : { treatmentAnchor: app.editingClipPreview.treatmentAnchor }) } : projectEditingClip
  const activeSplitBlock = app.isEditingMode && app.editingProject ? findActiveEditingVideoBlocks(app.editingProject.videoBlocks ?? [], app.editingCurrentTime).find((block) => block.position === 'split-left' || block.position === 'split-right') ?? null : null
  const activeSplitPosition = activeSplitBlock?.position ?? null
  const currentEditingSpan = app.isEditingMode && app.editingProject && currentEditingClip ? getVideoClipSpans(app.editingProject.videoClips).find((span) => span.clip.id === currentEditingClip.id) ?? null : null
  const currentEditingSource = app.isEditingMode && app.editingProject && currentEditingClip ? app.editingProject.sources.find((source) => source.id === currentEditingClip.sourceId) ?? null : null
  const personMatteSettings = getEditingPersonMatteSettings(currentEditingClip?.personMatte)
  const personMatteEnabled = Boolean(app.isEditingMode && currentEditingClip && personMatteSettings.enabled)
  const personMatteTrackKey = personMatteEnabled && currentEditingClip && currentEditingSource ? `${currentEditingSource.path}|${currentEditingSource.fingerprint}|${currentEditingClip.sourceStartSeconds}|${currentEditingClip.sourceEndSeconds}` : null
  const [personMatteTrack, setPersonMatteTrack] = useState<{ key: string; frames: PersonMatteTrackFrame[] } | null>(null)
  const [personMatteFrameUrl, setPersonMatteFrameUrl] = useState<string | null>(null)
  const [personMattePreviewFrameUrl, setPersonMattePreviewFrameUrl] = useState<string | null>(null)
  const [personMatteTrackProgress, setPersonMatteTrackProgress] = useState<PersonMatteTrackProgress | null>(null)
  useEffect(() => {
    let active = true
    setPersonMatteTrack(null)
    setPersonMatteFrameUrl(null)
    setPersonMattePreviewFrameUrl(null)
    setPersonMatteTrackProgress(null)
    if (!personMatteTrackKey || !currentEditingClip || !currentEditingSource) return () => { active = false }
    void window.aiv.buildPersonMatteTrack({ sourcePath: currentEditingSource.path, sourceFingerprint: currentEditingSource.fingerprint, sourceStartSeconds: currentEditingClip.sourceStartSeconds, sourceEndSeconds: currentEditingClip.sourceEndSeconds }).then((result) => {
      if (!active) return
      setPersonMatteTrackProgress(null)
      if (!result.success || result.frames.length === 0) return
      setPersonMatteTrack({ key: personMatteTrackKey, frames: result.frames })
    }).catch(() => undefined)
    return () => { active = false }
  }, [currentEditingClip?.id, currentEditingClip?.sourceStartSeconds, currentEditingClip?.sourceEndSeconds, currentEditingSource?.fingerprint, currentEditingSource?.path, personMatteTrackKey])
  useEffect(() => {
    if (!personMatteTrackKey) return
    return window.aiv.onPersonMatteTrackProgress((progress) => {
      setPersonMatteTrackProgress(progress.status === 'processing' ? progress : null)
    })
  }, [personMatteTrackKey])
  useEffect(() => {
    if (!personMatteEnabled || !personMatteTrack || personMatteTrack.key !== personMatteTrackKey) {
      setPersonMatteFrameUrl(null)
      return
    }
    let active = true
    let animationFrame = 0
    let lastUrl: string | null = null
    const updateFrame = (): void => {
      if (!active) return
      const sourceSeconds = app.videoRef.current?.currentTime ?? personMatteTrack.frames[0]?.sourceSeconds ?? 0
      let selected = personMatteTrack.frames[0] ?? null
      for (const frame of personMatteTrack.frames) {
        if (frame.sourceSeconds > sourceSeconds + 0.001) break
        selected = frame
      }
      if (selected?.url !== lastUrl) {
        lastUrl = selected?.url ?? null
        setPersonMatteFrameUrl(lastUrl)
      }
      animationFrame = window.requestAnimationFrame(updateFrame)
    }
    updateFrame()
    return () => {
      active = false
      window.cancelAnimationFrame(animationFrame)
    }
  }, [app.videoRef, personMatteEnabled, personMatteTrack, personMatteTrackKey])
  useEffect(() => {
    if (!personMatteFrameUrl) {
      setPersonMattePreviewFrameUrl(null)
      return
    }
    let active = true
    const featherPixels = getEditingPersonMatteFeatherPixels(personMatteSettings)
    setPersonMattePreviewFrameUrl(null)
    void createPersonMattePreviewMask(personMatteFrameUrl, featherPixels).then((previewUrl) => {
      if (active) setPersonMattePreviewFrameUrl(previewUrl)
    }).catch(() => {
      if (active) setPersonMattePreviewFrameUrl(personMatteFrameUrl)
    })
    return () => { active = false }
  }, [personMatteFrameUrl, personMatteSettings.featherPercent])
  if (!state.currentFile) {
    return <div className="empty-state"><div className="empty-icon"><AudioLines size={46} /></div><h1>{copy.emptyState.title}</h1><p>{copy.emptyState.description}</p><button className="primary-action" type="button" onClick={app.openFiles}><FolderOpen size={18} />{copy.emptyState.openVideo}</button></div>
  }
  const isPunchIn = !activeSplitPosition && currentEditingClip ? getEditingClipTreatment(currentEditingClip) === 'punch-in' : false
  const punchInOrigin = currentEditingClip ? getEditingClipTreatmentAnchor(currentEditingClip) : 'center'
  const transformOrigin = punchInOrigin === 'left' ? '0% 50%' : punchInOrigin === 'right' ? '100% 50%' : '50% 50%'
  const hasColorFilter = currentEditingClip ? !isEditingClipFilterNeutral(currentEditingClip) : false
  const transition = getEditingClipTransition(currentEditingClip ?? {})
  const transitionHalfDuration = transition && currentEditingSpan ? Math.min(transition.durationSeconds / 2, (currentEditingSpan.editedEndSeconds - currentEditingSpan.editedStartSeconds) / 2) : 0
  const transitionProgress = transitionHalfDuration > 0 && currentEditingSpan ? Math.min(1, Math.max(0, (app.editingCurrentTime - currentEditingSpan.editedStartSeconds) / transitionHalfDuration)) : 1
  const transitionTransform = transition?.type === 'slide-left' ? `translateX(${(1 - transitionProgress) * -100}%)` : transition?.type === 'slide-right' ? `translateX(${(1 - transitionProgress) * 100}%)` : transition?.type === 'zoom' ? `scale(${0.82 + transitionProgress * 0.18})` : transition?.type === 'crosszoom' ? `scale(${1.18 - transitionProgress * 0.18})` : ''
  const punchTransform = isPunchIn ? `scale(${getEditingClipTreatmentScale(currentEditingClip!)})` : ''
  const transitionClipPath = transition?.type === 'wipe-left' ? `inset(0 ${(1 - transitionProgress) * 100}% 0 0)` : transition?.type === 'wipe-right' ? `inset(0 0 0 ${(1 - transitionProgress) * 100}%)` : transition?.type === 'circleopen' ? `circle(${transitionProgress * 75}% at 50% 50%)` : undefined
  const transitionOpacity = transition?.type === 'fade' || transition?.type === 'fadeblack' || transition?.type === 'dissolve' ? transitionProgress : undefined
  const clipMotionStyle = currentEditingClip && currentEditingSpan ? getEditingClipMotionStyle(currentEditingClip, app.editingCurrentTime - currentEditingSpan.editedStartSeconds) : { opacity: 1, translateXPercent: 0, translateYPercent: 0, scale: 1 }
  const clipMotionTransform = clipMotionStyle.translateXPercent !== 0 || clipMotionStyle.translateYPercent !== 0 || clipMotionStyle.scale !== 1 ? `translate(${clipMotionStyle.translateXPercent}%, ${clipMotionStyle.translateYPercent}%) scale(${clipMotionStyle.scale})` : ''
  const splitMainWidth = activeSplitBlock ? `${100 - getEditingVideoBlockSize(activeSplitBlock)}%` : undefined
  const editingCanvas = app.isEditingMode && app.editingProject ? getEditingCanvasDimensions(app.editingProject.canvasPreset ?? 'source', app.editingProject.sources[0]?.width, app.editingProject.sources[0]?.height) : null
  const videoTransform = [punchTransform, transitionTransform, clipMotionTransform].filter(Boolean).join(' ')
  const personMatteOutlinePixels = personMattePreviewFrameUrl ? getEditingPersonMatteOutlinePixels(personMatteSettings, editingCanvas?.width ?? state.videoWidth, editingCanvas?.height ?? state.videoHeight) : 0
  const videoFilter = [hasColorFilter ? buildEditingClipFilterCss(currentEditingClip!) : '', personMatteOutlinePixels > 0 ? `drop-shadow(0 0 ${personMatteOutlinePixels}px ${personMatteSettings.outlineColor})` : ''].filter(Boolean).join(' ')
  const videoStyle: CSSProperties = { ...(editingCanvas ? { width: splitMainWidth ?? '100%', height: '100%', aspectRatio: `${editingCanvas.width} / ${editingCanvas.height}`, objectFit: editingCanvas.fitMode } : state.videoWidth > 0 && state.videoHeight > 0 ? { aspectRatio: `${state.videoWidth} / ${state.videoHeight}` } : {}), ...(splitMainWidth && !editingCanvas ? { width: splitMainWidth } : {}), ...(videoTransform ? { transform: videoTransform, transformOrigin } : {}), ...(transitionClipPath ? { clipPath: transitionClipPath } : {}), ...(videoFilter ? { filter: videoFilter } : {}), ...(personMattePreviewFrameUrl ? { maskImage: `url("${personMattePreviewFrameUrl}")`, WebkitMaskImage: `url("${personMattePreviewFrameUrl}")`, maskPosition: 'center', WebkitMaskPosition: 'center', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskSize: editingCanvas?.fitMode === 'cover' ? 'cover' : 'contain', WebkitMaskSize: editingCanvas?.fitMode === 'cover' ? 'cover' : 'contain' } : {}), opacity: transitionOpacity === undefined ? clipMotionStyle.opacity : transitionOpacity * clipMotionStyle.opacity }
  const onLoadedMetadata = (event: SyntheticEvent<HTMLVideoElement>): void => {
    const video = event.currentTarget
    const duration = video.duration || 0
    const currentTime = video.currentTime
    if (app.isEditingMode) {
      app.setState((current) => ({ ...current, duration, currentTime, videoWidth: video.videoWidth || 0, videoHeight: video.videoHeight || 0, error: null }))
      return
    }
    const resumeTime = resolvePlaybackStartTime(currentTime, duration)
    if (Math.abs(currentTime - resumeTime) > 0.25) video.currentTime = resumeTime
    app.setState((current) => ({ ...current, duration, currentTime: resumeTime, videoWidth: video.videoWidth || 0, videoHeight: video.videoHeight || 0, error: null }))
    app.updatePlaybackHistoryDuration(duration)
    app.persistPlaybackProgress(resumeTime, true)
  }
  const progressPercent = personMatteTrackProgress && personMatteTrackProgress.totalFrames > 0 ? Math.min(100, Math.round(personMatteTrackProgress.processedFrames / personMatteTrackProgress.totalFrames * 100)) : 0
  return <><video ref={app.videoRef} className={`video-surface ${isPunchIn ? 'is-punch-in' : ''} ${activeSplitPosition ? `is-${activeSplitPosition}` : ''} ${personMattePreviewFrameUrl ? 'is-person-matte' : ''}`} data-testid={personMattePreviewFrameUrl ? 'editing-person-matte-preview' : undefined} style={videoStyle} src={mediaUrl} preload="metadata" onClick={app.handleVideoClick} onDoubleClick={app.handleVideoDoubleClick} onPlay={() => app.setState((current) => ({ ...current, isPlaying: true }))} onPlaying={app.clearPlaybackError} onCanPlay={app.clearPlaybackError} onPause={(event) => { const currentTime = event.currentTarget.currentTime; if (!app.isEditingMode || !app.editingResumePlaybackRef.current) app.setState((current) => ({ ...current, isPlaying: false })); if (!app.isEditingMode) app.persistPlaybackProgress(currentTime, true) }} onEnded={() => { app.playbackEndedRef.current = true; app.editingResumePlaybackRef.current = false; app.setState((current) => ({ ...current, isPlaying: false })); if (!app.isEditingMode) app.persistPlaybackProgress(0, true) }} onLoadedMetadata={onLoadedMetadata} onTimeUpdate={(event) => { const currentTime = event.currentTarget.currentTime; app.setState((current) => ({ ...current, currentTime, error: null })); if (!app.isEditingMode) app.persistPlaybackProgress(currentTime) }} onVolumeChange={(event) => { const { volume, muted } = event.currentTarget; app.setState((current) => ({ ...current, volume, muted })) }} onError={app.handleMediaError} controls={false} />{personMatteTrackProgress?.status === 'processing' ? <div className="editing-person-matte-track-progress" data-testid="editing-person-matte-track-progress" role="status" aria-live="polite"><span>{copy.editing.personMatteProcessing(personMatteTrackProgress.processedFrames, personMatteTrackProgress.totalFrames)}</span><strong>{progressPercent}%</strong><i><b style={{ width: `${progressPercent}%` }} /></i></div> : null}</>
}
