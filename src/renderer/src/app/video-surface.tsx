import type { SyntheticEvent } from 'react'
import { AudioLines, FolderOpen } from 'lucide-react'
import { editedTimeToSource, getVideoClipSpans } from '../../../core/editing/timeline-math'
import { buildEditingClipFilterCss, isEditingClipFilterNeutral } from '../../../core/editing/filter-operations'
import { getEditingClipMotionStyle } from '../../../core/editing/clip-motion'
import { getEditingClipTransition } from '../../../core/editing/transition-operations'
import { getEditingClipTreatment, getEditingClipTreatmentAnchor, getEditingClipTreatmentScale } from '../../../core/editing/treatment-operations'
import { getEditingCanvasDimensions } from '../../../core/editing/canvases'
import { findActiveEditingVideoBlocks, getEditingVideoBlockSize } from '../../../core/editing/video-block-operations'
import { resolvePlaybackStartTime } from './playback-progress'
import { useAppContext } from './app-context'

export function VideoSurface(): React.ReactElement {
  const app = useAppContext()
  const { state, copy } = app
  if (!state.currentFile) {
    return <div className="empty-state"><div className="empty-icon"><AudioLines size={46} /></div><h1>{copy.emptyState.title}</h1><p>{copy.emptyState.description}</p><button className="primary-action" type="button" onClick={app.openFiles}><FolderOpen size={18} />{copy.emptyState.openVideo}</button></div>
  }
  const editingPreviewFile = app.editingPreviewSourceId ? app.editingSourceFiles[app.editingPreviewSourceId] : null
  const mediaUrl = app.isEditingMode && editingPreviewFile ? editingPreviewFile.url : state.currentFile.url
  const currentEditingClip = app.isEditingMode && app.editingProject ? editedTimeToSource(app.editingProject.videoClips, app.editingCurrentTime)?.clip ?? null : null
  const activeSplitBlock = app.isEditingMode && app.editingProject ? findActiveEditingVideoBlocks(app.editingProject.videoBlocks ?? [], app.editingCurrentTime).find((block) => block.position === 'split-left' || block.position === 'split-right') ?? null : null
  const activeSplitPosition = activeSplitBlock?.position ?? null
  const currentEditingSpan = app.isEditingMode && app.editingProject && currentEditingClip ? getVideoClipSpans(app.editingProject.videoClips).find((span) => span.clip.id === currentEditingClip.id) ?? null : null
  const isPunchIn = !activeSplitPosition && currentEditingClip ? getEditingClipTreatment(currentEditingClip) === 'punch-in' : false
  const punchInOrigin = currentEditingClip ? getEditingClipTreatmentAnchor(currentEditingClip) : 'center'
  const transformOrigin = punchInOrigin === 'left' ? '0% 50%' : punchInOrigin === 'right' ? '100% 50%' : '50% 50%'
  const hasColorFilter = currentEditingClip ? !isEditingClipFilterNeutral(currentEditingClip) : false
  const transition = getEditingClipTransition(currentEditingClip ?? {})
  const transitionHalfDuration = transition && currentEditingSpan ? Math.min(transition.durationSeconds / 2, (currentEditingSpan.editedEndSeconds - currentEditingSpan.editedStartSeconds) / 2) : 0
  const transitionProgress = transitionHalfDuration > 0 && currentEditingSpan ? Math.min(1, Math.max(0, (app.editingCurrentTime - currentEditingSpan.editedStartSeconds) / transitionHalfDuration)) : 1
  const transitionTransform = transition?.type === 'slide-left' ? `translateX(${(1 - transitionProgress) * -100}%)` : transition?.type === 'slide-right' ? `translateX(${(1 - transitionProgress) * 100}%)` : transition?.type === 'zoom' ? `scale(${0.82 + transitionProgress * 0.18})` : ''
  const punchTransform = isPunchIn ? `scale(${getEditingClipTreatmentScale(currentEditingClip!)})` : ''
  const transitionClipPath = transition?.type === 'wipe-left' ? `inset(0 ${(1 - transitionProgress) * 100}% 0 0)` : transition?.type === 'wipe-right' ? `inset(0 0 0 ${(1 - transitionProgress) * 100}%)` : undefined
  const transitionOpacity = transition?.type === 'fade' || transition?.type === 'fadeblack' || transition?.type === 'dissolve' ? transitionProgress : undefined
  const clipMotionStyle = currentEditingClip && currentEditingSpan ? getEditingClipMotionStyle(currentEditingClip, app.editingCurrentTime - currentEditingSpan.editedStartSeconds) : { opacity: 1, translateXPercent: 0, translateYPercent: 0, scale: 1 }
  const clipMotionTransform = clipMotionStyle.translateXPercent !== 0 || clipMotionStyle.translateYPercent !== 0 || clipMotionStyle.scale !== 1 ? `translate(${clipMotionStyle.translateXPercent}%, ${clipMotionStyle.translateYPercent}%) scale(${clipMotionStyle.scale})` : ''
  const splitMainWidth = activeSplitBlock ? `${100 - getEditingVideoBlockSize(activeSplitBlock)}%` : undefined
  const editingCanvas = app.isEditingMode && app.editingProject ? getEditingCanvasDimensions(app.editingProject.canvasPreset ?? 'source', app.editingProject.sources[0]?.width, app.editingProject.sources[0]?.height) : null
  const videoTransform = [punchTransform, transitionTransform, clipMotionTransform].filter(Boolean).join(' ')
  const videoStyle = { ...(editingCanvas ? { width: splitMainWidth ?? '100%', height: '100%', aspectRatio: `${editingCanvas.width} / ${editingCanvas.height}`, objectFit: editingCanvas.fitMode } : state.videoWidth > 0 && state.videoHeight > 0 ? { aspectRatio: `${state.videoWidth} / ${state.videoHeight}` } : {}), ...(splitMainWidth && !editingCanvas ? { width: splitMainWidth } : {}), ...(videoTransform ? { transform: videoTransform, transformOrigin } : {}), ...(transitionClipPath ? { clipPath: transitionClipPath } : {}), ...(hasColorFilter ? { filter: buildEditingClipFilterCss(currentEditingClip!) } : {}), opacity: transitionOpacity === undefined ? clipMotionStyle.opacity : transitionOpacity * clipMotionStyle.opacity }
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
  return <video ref={app.videoRef} className={`video-surface ${isPunchIn ? 'is-punch-in' : ''} ${activeSplitPosition ? `is-${activeSplitPosition}` : ''}`} style={videoStyle} src={mediaUrl} preload="metadata" onClick={app.handleVideoClick} onDoubleClick={app.handleVideoDoubleClick} onPlay={() => app.setState((current) => ({ ...current, isPlaying: true }))} onPlaying={app.clearPlaybackError} onCanPlay={app.clearPlaybackError} onPause={(event) => { const currentTime = event.currentTarget.currentTime; if (!app.isEditingMode || !app.editingResumePlaybackRef.current) app.setState((current) => ({ ...current, isPlaying: false })); if (!app.isEditingMode) app.persistPlaybackProgress(currentTime, true) }} onEnded={() => { app.playbackEndedRef.current = true; app.editingResumePlaybackRef.current = false; app.setState((current) => ({ ...current, isPlaying: false })); if (!app.isEditingMode) app.persistPlaybackProgress(0, true) }} onLoadedMetadata={onLoadedMetadata} onTimeUpdate={(event) => { const currentTime = event.currentTarget.currentTime; app.setState((current) => ({ ...current, currentTime, error: null })); if (!app.isEditingMode) app.persistPlaybackProgress(currentTime) }} onVolumeChange={(event) => { const { volume, muted } = event.currentTarget; app.setState((current) => ({ ...current, volume, muted })) }} onError={app.handleMediaError} controls={false} />
}
