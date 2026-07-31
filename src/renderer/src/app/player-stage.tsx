import type { CSSProperties } from 'react'
import { SubtitleOverlay } from '../subtitle-overlay'
import { SubtitleDisplayControls } from './subtitle-display-controls'
import { PlaybackControls } from './playback-controls'
import { VideoSurface } from './video-surface'
import { useAppContext } from './app-context'
import { EditingTimeline } from './editing-timeline'
import { EditingGraphicOverlay } from './editing-graphic-overlay'
import { EditingVideoBlockOverlay } from './editing-video-block-overlay'
import { getEditingFrame, getEditingFrameStyle } from '../../../core/editing/frames'
import { getEditingCanvasDimensions } from '../../../core/editing/canvases'
import { getEditingCaptionLayout } from '../../../core/editing/caption-layout'
import { getEditingOverlayTrackOrder } from '../../../core/editing/overlay-track-operations'
import { EditingSafeAreaOverlay } from './editing-safe-area-overlay'
import { EditingCaptionCanvasOverlay } from './editing-caption-canvas-overlay'
import { EditingGraphicCanvasOverlay } from './editing-graphic-canvas-overlay'

export function PlayerStage(): React.ReactElement {
  const app = useAppContext()
  const frame = app.isEditingMode ? getEditingFrame(app.editingProject?.frameId) : null
  const canvasPreset = app.isEditingMode ? app.editingProject?.canvasPreset ?? 'source' : 'source'
  const canvas = app.isEditingMode ? getEditingCanvasDimensions(canvasPreset, app.editingProject?.sources[0]?.width, app.editingProject?.sources[0]?.height) : null
  const editingCaptionLayout = app.isEditingMode ? getEditingCaptionLayout(app.editingProject?.captionLayout) : null
  const frameStyle = frame ? getEditingFrameStyle(frame.id) as CSSProperties : undefined
  const overlayTrackOrder = getEditingOverlayTrackOrder(app.editingProject?.overlayTrackOrder)
  const editingLayerZIndex = (kind: 'videoBlocks' | 'graphics' | 'captions'): number => 10 + Math.max(0, overlayTrackOrder.indexOf(kind)) * 10
  const subtitleOverlay = <SubtitleOverlay subtitlePath={app.isEditingMode ? null : app.activeSubtitle?.subtitlePath ?? null} subtitleRevision={app.isEditingMode ? 0 : app.activeSubtitle?.subtitleRevision ?? 0} translationPath={app.isEditingMode ? null : app.translatedSubtitleResult?.subtitlePath ?? null} translationRevision={app.isEditingMode ? 0 : app.translatedSubtitleResult?.subtitleRevision ?? 0} editingCaptions={app.isEditingMode ? app.editingProject?.captions ?? null : null} editingCaptionEffect={app.isEditingMode ? app.editingProject?.captionEffect ?? 'none' : 'none'} editingCaptionLayout={editingCaptionLayout} editingCanvas={canvas} editingLayerZIndex={app.isEditingMode ? editingLayerZIndex('captions') : undefined} showControls={!app.isEditingMode} currentTime={app.isEditingMode ? app.editingCurrentTime : app.state.currentTime} locale={app.appSettings.ui.locale} settings={app.appSettings.subtitles} copy={app.copy} controlsRef={app.subtitleDisplayControlsRef} onSettingsChange={app.patchSubtitleDisplaySettings} onResetSettings={app.resetSubtitleDisplaySettings} />
  const editingSubtitleControls = app.isEditingMode ? <div className="editing-subtitle-controls"><SubtitleDisplayControls copy={app.copy} locale={app.appSettings.ui.locale} settings={app.appSettings.subtitles} hasTranslation={Boolean(app.editingProject?.captions.some((caption) => caption.kind === 'translation'))} controlsRef={app.subtitleDisplayControlsRef} onChange={app.patchSubtitleDisplaySettings} onReset={app.resetSubtitleDisplaySettings} /></div> : null
  const hasEditingCaption = app.isEditingMode && (app.editingProject?.captions.some((caption) => app.editingCurrentTime >= caption.startSeconds && app.editingCurrentTime < caption.startSeconds + caption.durationSeconds) ?? false)
  const selectedEditingGraphic = app.isEditingMode ? app.editingProject?.graphics?.find((graphic) => graphic.id === app.editingSelectedGraphicId && app.editingCurrentTime >= graphic.startSeconds && app.editingCurrentTime < graphic.startSeconds + graphic.durationSeconds) ?? null : null
  return <section className={`stage ${app.isControlDeckHidden && !app.isEditingMode ? 'control-deck-hidden' : ''} ${app.isEditingMode ? 'is-editing' : ''} ${frame ? `editing-frame-${frame.id}` : ''}`} style={{ ...frameStyle, ...(canvas ? { '--editing-canvas-ratio': `${canvas.width} / ${canvas.height}` } : {}) }} data-editing-canvas={app.isEditingMode ? canvasPreset : undefined} aria-label={app.copy.emptyState.title} onMouseEnter={app.revealControlDeck} onMouseMove={app.revealControlDeck}><div className="video-frame"><VideoSurface /><EditingVideoBlockOverlay blocks={app.isEditingMode ? app.editingProject?.videoBlocks ?? [] : []} sourceFiles={app.editingSourceFiles} currentTime={app.isEditingMode ? app.editingCurrentTime : 0} isPlaying={app.isEditingMode && app.state.isPlaying} zIndex={app.isEditingMode ? editingLayerZIndex('videoBlocks') : undefined} /><EditingGraphicOverlay graphics={app.isEditingMode ? app.editingProject?.graphics ?? [] : []} currentTime={app.isEditingMode ? app.editingCurrentTime : 0} frameId={frame?.id} zIndex={app.isEditingMode ? editingLayerZIndex('graphics') : undefined} />{selectedEditingGraphic ? <EditingGraphicCanvasOverlay graphic={selectedEditingGraphic} hint={app.copy.editing.graphicEditTitle} onChange={(patch) => app.updateEditingGraphic(selectedEditingGraphic.id, patch)} /> : null}<EditingSafeAreaOverlay canvasPreset={canvasPreset} />{app.isEditingMode ? subtitleOverlay : null}{hasEditingCaption ? <EditingCaptionCanvasOverlay layout={editingCaptionLayout ?? getEditingCaptionLayout(null)} hint={app.copy.editing.captionLayoutTitle} onChange={app.setEditingCaptionLayout} /> : null}</div>{app.isEditingMode ? editingSubtitleControls : subtitleOverlay}{app.state.error ? <div className="status-banner"><span>{app.state.error}</span></div> : null}{app.isEditingMode ? <EditingTimeline /> : <PlaybackControls />}</section>
}
