import { ArrowRight, ChevronLeft, ChevronRight, Copy, Download, FilePlus2, FolderOpen, Grid3X3, Pause, Play, Plus, Redo2, RefreshCw, RotateCcw, Save, ScanSearch, Scissors, Trash2, Undo2, Volume2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { TimelineExportMode } from '../../../shared/clip-export'; import type { EditingThemeSettings } from '../../../core/editing/themes'
import { getEditingCanvasDimensions } from '../../../core/editing/canvases'
import { getEditingCaptionsForSubtitleExport } from '../../../core/editing/caption-serialization'
import { getEditingFramingOrientation } from '../../../core/editing/framing-orientation'
import { isEditingOrphanTranslationCaption } from '../../../core/editing/subtitle-reload'
import { getEditingOverlayTrackOrder } from '../../../core/editing/overlay-track-operations'; import type { EditingOverlayTrackKind } from '../../../shared/editing-types'
import { auditEditingExport } from '../../../core/editing/export-audit'; import { editedDurationSeconds, editedTimeToSource, getVideoClipSpans, sourceRangeToEditedRanges } from '../../../core/editing/timeline-math'; import { getEditingFilmstripTiles } from '../../../core/editing/filmstrip-operations'; import { getEditingFramingKeyframes } from '../../../core/editing/framing-operations'; import { formatTime } from '../lib/time'
import { getEditingWaveformSegments } from '../../../core/editing/waveform-operations'
import { useAppContext } from './app-context'; import { EditingCaptionTrack } from './editing-caption-track'; import { EditingWaveformTrack } from './editing-waveform-track'; import { EditingAudioControl } from './editing-audio-control'; import { EditingClipBoundaryHandles } from './editing-clip-boundary-handles'
import { EditingExportSummary } from './editing-export-summary'; import { EditingExportConfirmDialog } from './editing-export-confirm-dialog'; import { EditingRangeTrack } from './editing-range-track'; import { EditingScriptPanel } from './editing-script-panel'
import { EditingTreatmentControl } from './editing-treatment-control'; import { EditingFramingPresetControl } from './editing-framing-preset-control'; import { EditingFilterControl } from './editing-filter-control'; import { EditingPersonMatteControl } from './editing-person-matte-control'; import { EditingTransitionControl } from './editing-transition-control'; import { EditingClipMotionControl } from './editing-clip-motion-control'; import { EditingGraphicControl } from './editing-graphic-control'
import { EditingGraphicEditor } from './editing-graphic-editor'; import { EditingGraphicTrack } from './editing-graphic-track'; import { EditingThemeControl } from './editing-theme-control'; import { EditingCaptionEffectControl } from './editing-caption-effect-control'
import { EditingCanvasControl } from './editing-canvas-control'; import { EditingCaptionLayoutControl } from './editing-caption-layout-control'; import { getEditingCaptionLayout } from '../../../core/editing/caption-layout'
import { EditingVideoBlockControl } from './editing-video-block-control'; import { EditingVideoBlockTrack } from './editing-video-block-track'; import { EditingVideoBlockEditor } from './editing-video-block-editor'; import { EditingAssetsPanel } from './editing-assets-panel'; import { EDITING_SOURCE_DRAG_TYPE, readEditingSourceDrag } from './editing-asset-dnd'
import { useEditingFilmstrips } from './use-editing-filmstrip'; import { useEditingWaveforms } from './use-editing-waveform'; import { useEditingElementAssets } from './use-editing-element-assets'; import { useEditingThemes } from './use-editing-themes'
import { getEditingSceneCopy } from '../../../shared/editing-scene-copy'; import { getEditingSilenceCopy } from '../../../shared/editing-silence-copy'; import { getEditingScriptCopy } from '../../../shared/editing-script-copy'
import { getEditingStructureCopy } from '../../../shared/editing-structure-copy'; import type { MediaStructureAnalysisResult, MediaStructureSegment } from '../../../shared/media-types'
import { analyzeSubtitleQa } from '../../../shared/subtitle-qa'
import { getPlaybackMediaKey } from '../../../shared/playback-memory'
import { useEditingClipReorder } from './use-editing-clip-reorder'; import { useEditingTimelineSelection } from './use-editing-timeline-selection'; import { EditingStructureAnalysis } from './editing-structure-analysis'; import { EditingSubtitleQa } from './editing-subtitle-qa'; import { EditingCaptionSyncControl } from './editing-caption-sync-control'
import { EditingCaptionReloadConflict } from './editing-caption-reload-conflict'
import { getEditingSubtitleReloadCopy } from '../../../shared/editing-subtitle-reload-copy'
import { getEditingSubtitleReloadChangePreview, getEditingSubtitleReloadChangeScriptSegmentId, shareEditingSubtitleReloadScriptSegmentIds, type EditingSubtitleReloadChange, type EditingSubtitleReloadChangePreview, type EditingSubtitleReloadIncomingPreviewTrack } from '../../../core/editing/subtitle-reload'
const MAX_RULER_TICKS = 121; function formatClipLabel(startSeconds: number, endSeconds: number): string { return `${formatTime(startSeconds)} – ${formatTime(endSeconds)}` }
function formatIncomingPreviewRange(track: EditingSubtitleReloadIncomingPreviewTrack): string { return `${formatTime(track.startSeconds)}–${formatTime(track.endSeconds)}` }
export function EditingTimeline(): React.ReactElement | null {
  const app = useAppContext()
  const project = app.editingProject
  const sceneCopy = getEditingSceneCopy(app.appSettings.ui.locale); const silenceCopy = getEditingSilenceCopy(app.appSettings.ui.locale); const scriptCopy = getEditingScriptCopy(app.appSettings.ui.locale)
  const subtitleReloadCopy = getEditingSubtitleReloadCopy(app.appSettings.ui.locale)
  const filmstrips = useEditingFilmstrips(project, app.editingSourceFiles)
  const waveforms = useEditingWaveforms(project, app.editingSourceFiles)
  const { assets: elementAssets, saveAsset: saveElementAsset, deleteAsset: deleteElementAsset } = useEditingElementAssets()
  const { themes, saveTheme, deleteTheme } = useEditingThemes()
  const [graphicDefaults, setGraphicDefaults] = useState<Pick<EditingThemeSettings, 'graphicStyle' | 'graphicPosition'>>({ graphicStyle: 'title', graphicPosition: 'center' })
  const [structureAnalysis, setStructureAnalysis] = useState<MediaStructureAnalysisResult | null>(null)
  const [structureAnalysisSourceId, setStructureAnalysisSourceId] = useState<string | null>(null)
  const [isAnalyzingStructure, setIsAnalyzingStructure] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [isExportConfirmOpen, setIsExportConfirmOpen] = useState(false)
  const [selectedScriptSegmentId, setSelectedScriptSegmentId] = useState<string | null>(null)
  const [incomingCaptionPreview, setIncomingCaptionPreview] = useState<EditingSubtitleReloadChangePreview | null>(null)
  const timelineContentRef = useRef<HTMLDivElement | null>(null)
  const spans = getVideoClipSpans(project?.videoClips ?? [])
  const durationSeconds = editedDurationSeconds(project?.videoClips ?? [])
  const waveformSegments = getEditingWaveformSegments(spans, waveforms)
  const framingKeyframes = getEditingFramingKeyframes(spans.map((span) => ({ editedStartSeconds: span.editedStartSeconds, editedEndSeconds: span.editedEndSeconds, clip: span.clip })))
  const { clipDrag, suppressClipClickRef, startClipDrag, moveClipDrag, finishClipDrag } = useEditingClipReorder(app, spans, durationSeconds)
  const { selection, selectionCount, selectionPayload, marquee, selectTimelineItem, removeTimelineItemFromSelection, clearTimelineSelection, deleteTimelineSelection, duplicateTimelineSelection, beginTimelineMarquee, moveTimelineMarquee, finishTimelineMarquee, handleTimelineKeyDown } = useEditingTimelineSelection(app, project, timelineContentRef)
  const structureCopy = getEditingStructureCopy(app.appSettings.ui.locale)
  const subtitleQaIssues = analyzeSubtitleQa(project?.captions ?? [])
  const selectedCaption = project?.captions.find((caption) => caption.id === app.editingSelectedCaptionId) ?? null
  const structureSource = project?.sources.find((source) => source.id === structureAnalysisSourceId) ?? null
  const structureSourceKey = structureSource ? getPlaybackMediaKey(structureSource) : null
  const ignoredStructureSegmentIds = new Set((structureSourceKey ? app.appSettings.playback.structureCorrectionsByFingerprint[structureSourceKey] ?? [] : []).filter((correction) => correction.action === 'ignore').map((correction) => correction.segmentId))
  useEffect(() => {
    setStructureAnalysis(null)
    setStructureAnalysisSourceId(null)
  }, [project?.id])
  useEffect(() => {
    if (!app.editingCaptionReloadConflict) setIncomingCaptionPreview(null)
  }, [app.editingCaptionReloadConflict])
  const analyzeStructure = async (): Promise<void> => {
    if (!project || isAnalyzingStructure) return
    const targetClip = project.videoClips.find((clip) => clip.id === app.editingSelectedClipId) ?? editedTimeToSource(project.videoClips, app.editingCurrentTime)?.clip ?? project.videoClips[0]
    const source = targetClip ? project.sources.find((candidate) => candidate.id === targetClip.sourceId) : project.sources[0]
    if (!source) return
    setIsAnalyzingStructure(true)
    try {
      const result = await window.aiv.analyzeMediaStructure({ mediaPath: source.path, durationSeconds: source.durationSeconds })
      if (app.editingProject?.id !== project.id) return
      setStructureAnalysisSourceId(source.id)
      setStructureAnalysis(result)
      if (!result.success) app.setEditingProjectStatus({ success: false, message: `${structureCopy.failed}：${result.message}` })
    } catch (error) {
      if (app.editingProject?.id === project.id) app.setEditingProjectStatus({ success: false, message: `${structureCopy.failed}：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      setIsAnalyzingStructure(false)
    }
  }
  const seekStructureSegment = (segment: MediaStructureSegment): void => {
    if (!project || !structureAnalysisSourceId) return
    const editedRange = sourceRangeToEditedRanges(project.videoClips, structureAnalysisSourceId, segment.startSeconds, segment.endSeconds)[0]
    if (editedRange) app.seekEditingTime(editedRange.startSeconds)
  }
  const ignoreStructureSegment = (segment: MediaStructureSegment): void => app.ignorePlaybackStructureSegment(segment, structureSourceKey ?? undefined)
  const restoreStructureSegment = (segment: MediaStructureSegment): void => app.restorePlaybackStructureSegment(segment.id, structureSourceKey ?? undefined)
  if (!project) return null
  const selectedClip = project.videoClips.find((clip) => clip.id === app.editingSelectedClipId) ?? null
  const selectedFramingClipIds = selection.clipIds.size > 0 ? [...selection.clipIds] : selectedClip ? [selectedClip.id] : []
  const selectedFramingClips = project.videoClips.filter((clip) => selectedFramingClipIds.includes(clip.id))
  const selectedGraphic = project.graphics?.find((graphic) => graphic.id === app.editingSelectedGraphicId) ?? null
  const selectedVideoBlock = project.videoBlocks?.find((block) => block.id === app.editingSelectedVideoBlockId) ?? null; const selectedVideoBlockSource = selectedVideoBlock ? project.sources.find((source) => source.id === selectedVideoBlock.sourceId) ?? null : null
  const previewIncomingCaption = (change: EditingSubtitleReloadChange): void => {
    const next = getEditingSubtitleReloadChangePreview(change, app.editingCaptionReloadConflict?.preview.changes ?? [])
    if (!next) {
      setIncomingCaptionPreview(null)
      return
    }
    setSelectedScriptSegmentId(null)
    clearTimelineSelection()
    setIncomingCaptionPreview(next)
  }
  const selectScriptSegment = (segmentId: string): void => {
    const resolvedSegmentId = project.scriptSegments?.find((segment) => shareEditingSubtitleReloadScriptSegmentIds(segment.id, segmentId))?.id
    if (!resolvedSegmentId) return
    setSelectedScriptSegmentId(resolvedSegmentId)
    selectTimelineItem('caption', resolvedSegmentId)
    app.selectEditingScriptSegment(resolvedSegmentId)
  }
  const canvasPreset = project.canvasPreset ?? 'source'
  const canvasDimensions = getEditingCanvasDimensions(canvasPreset, project.sources[0]?.width, project.sources[0]?.height)
  const framingOrientation = getEditingFramingOrientation(canvasDimensions.width, canvasDimensions.height)
  const captionLayout = getEditingCaptionLayout(project.captionLayout)
  const selectedClipIndex = selectedClip ? project.videoClips.findIndex((clip) => clip.id === selectedClip.id) : -1
  const currentTime = Math.min(Math.max(0, app.editingCurrentTime), durationSeconds)
  const currentPoint = editedTimeToSource(project.videoClips, currentTime)
  const canSplit = Boolean(currentPoint && currentPoint.sourceSeconds > currentPoint.clip.sourceStartSeconds + 0.01 && currentPoint.sourceSeconds < currentPoint.clip.sourceEndSeconds - 0.01)
  const canExport = spans.length > 0
  const hasExportSubtitle = getEditingCaptionsForSubtitleExport(project, 'source').some((caption) => caption.text.trim().length > 0) || app.hasClipExportSubtitle
  const hasTranslationSubtitle = getEditingCaptionsForSubtitleExport(project, 'translation').some((caption) => caption.text.trim().length > 0)
  const currentTheme: EditingThemeSettings = { frameId: project.frameId ?? 'clean', captionEffect: project.captionEffect ?? 'none', subtitlePresetId: app.appSettings.subtitles.presetId, emphasisMode: app.appSettings.subtitles.emphasisMode, graphicStyle: selectedGraphic?.style ?? graphicDefaults.graphicStyle, graphicPosition: selectedGraphic?.position ?? graphicDefaults.graphicPosition }
  const applyEditingTheme = (theme: EditingThemeSettings): void => {
    app.patchSubtitleDisplaySettings({ presetId: theme.subtitlePresetId, emphasisMode: theme.emphasisMode })
    app.applyEditingFrameTheme(theme.frameId, theme.graphicStyle, theme.graphicPosition, theme.captionEffect)
    setGraphicDefaults({ graphicStyle: theme.graphicStyle, graphicPosition: theme.graphicPosition })
  }
  const exportAudit = auditEditingExport(project, Object.keys(app.editingSourceFiles))
  const rulerTickCount = Math.min(MAX_RULER_TICKS, Math.max(2, Math.ceil(durationSeconds) + 1))
  const playheadPercent = durationSeconds > 0 ? (currentTime / durationSeconds) * 100 : 0
  const framingMarkers = framingKeyframes.slice(1).filter((keyframe) => keyframe.at > 0 && keyframe.at < durationSeconds).map((keyframe) => ({ keyframe, clip: spans.find((span) => Math.abs(span.editedStartSeconds - keyframe.at) < 0.001)?.clip ?? null }))
  const snapPoints = [...new Set([currentTime, ...spans.flatMap((span) => [span.editedStartSeconds, span.editedEndSeconds])])]
  const overlaySnapPoints = [...new Set([
    ...snapPoints,
    ...(project.captions ?? []).flatMap((caption) => [caption.startSeconds, caption.startSeconds + caption.durationSeconds]),
    ...(project.graphics ?? []).flatMap((graphic) => [graphic.startSeconds, graphic.startSeconds + graphic.durationSeconds]),
    ...(project.videoBlocks ?? []).flatMap((block) => [block.startSeconds, block.startSeconds + block.durationSeconds]),
  ])]
  const overlayTrackOrder = getEditingOverlayTrackOrder(project.overlayTrackOrder)
  const orphanTranslationCaptionIds = new Set(project.captions.filter((caption) => isEditingOrphanTranslationCaption(project, caption)).map((caption) => caption.id))
  const orphanTranslationSegmentIds = new Set((project.scriptSegments ?? []).filter((segment) => segment.deleted && project.captions.some((caption) => isEditingOrphanTranslationCaption(project, caption) && shareEditingSubtitleReloadScriptSegmentIds(segment.id, getEditingSubtitleReloadChangeScriptSegmentId(caption)))).map((segment) => segment.id))
  const reorderOverlayTracks = (source: EditingOverlayTrackKind, target: EditingOverlayTrackKind): void => app.reorderEditingOverlayTracks(source, target)
  const renderOverlayTrack = (kind: EditingOverlayTrackKind): React.ReactElement => {
    if (kind === 'captions') return <EditingCaptionTrack key={kind} captions={project.captions} durationSeconds={durationSeconds} selectedCaptionId={app.editingSelectedCaptionId} selectedCaptionIds={selection.captionIds} trackLabel={app.copy.editing.captionTrack} trackKind="captions" onReorderTrack={reorderOverlayTracks} emptyLabel={app.copy.editing.captionEmpty} snapPoints={overlaySnapPoints} onSelectCaption={(captionId, additive) => selectTimelineItem('caption', captionId, additive)} onMoveCaption={app.moveEditingCaption} onResizeCaption={app.resizeEditingCaption} incomingPreview={incomingCaptionPreview} incomingPreviewLabel={subtitleReloadCopy.previewIncoming} incomingPreviewTrackLabels={{ source: subtitleReloadCopy.source, translation: subtitleReloadCopy.translation }} orphanTranslationCaptionIds={orphanTranslationCaptionIds} orphanTranslationNotice={orphanTranslationCaptionIds.size > 0 ? app.copy.editing.orphanTranslationNotice(orphanTranslationCaptionIds.size) : undefined} />
    if (kind === 'graphics') return <EditingGraphicTrack key={kind} graphics={project.graphics ?? []} durationSeconds={durationSeconds} selectedGraphicId={app.editingSelectedGraphicId} selectedGraphicIds={selection.graphicIds} trackLabel={app.copy.editing.graphicTrack} trackKind="graphics" onReorderTrack={reorderOverlayTracks} emptyLabel={app.copy.editing.graphicEmpty} deleteLabel={app.copy.editing.graphicDelete} snapPoints={overlaySnapPoints} onSelect={(graphicId, additive) => selectTimelineItem('graphic', graphicId, additive)} onDelete={(graphicId) => { app.deleteEditingGraphic(graphicId); removeTimelineItemFromSelection('graphic', graphicId) }} onMove={(graphicId, startSeconds) => app.updateEditingGraphic(graphicId, { startSeconds })} onResize={(graphicId, startSeconds, endSeconds) => app.updateEditingGraphic(graphicId, { startSeconds, durationSeconds: endSeconds - startSeconds })} />
    return <EditingVideoBlockTrack key={kind} blocks={project.videoBlocks ?? []} durationSeconds={durationSeconds} selectedBlockId={selectedVideoBlock?.id ?? null} selectedBlockIds={selection.videoBlockIds} trackLabel={app.copy.editing.videoBlockTrack} trackKind="videoBlocks" onReorderTrack={reorderOverlayTracks} emptyLabel={app.copy.editing.videoBlockEmpty} deleteLabel={app.copy.editing.videoBlockDelete} snapPoints={overlaySnapPoints} onSelect={(blockId, additive) => selectTimelineItem('videoBlock', blockId, additive)} onDelete={(blockId) => { app.deleteEditingVideoBlock(blockId); removeTimelineItemFromSelection('videoBlock', blockId) }} onMove={(blockId, startSeconds) => app.updateEditingVideoBlock(blockId, { startSeconds })} onResize={(blockId, startSeconds, endSeconds) => { const block = project.videoBlocks?.find((candidate) => candidate.id === blockId); const sourceStartSeconds = block && Math.abs(startSeconds - block.startSeconds) > 0.001 ? block.sourceStartSeconds + (startSeconds - block.startSeconds) : block?.sourceStartSeconds; app.updateEditingVideoBlock(blockId, { startSeconds, durationSeconds: endSeconds - startSeconds, ...(sourceStartSeconds === undefined ? {} : { sourceStartSeconds }) }) }} onDropSource={(sourceId, startSeconds) => app.addEditingVideoBlock(sourceId, { position: 'bottom-right', startSeconds })} />
  }
  const movableSelectionCount = selection.captionIds.size + selection.graphicIds.size + selection.videoBlockIds.size
  const confirmEditingExport = (mode: TimelineExportMode, outputVideoPath: string): void => {
    setIsExportConfirmOpen(false)
    if (mode !== 'translation-subtitle') app.syncClipExportPreferences(app.appSettings.capture.clipExportLengthSeconds, mode)
    void app.exportEditingTimeline(mode, outputVideoPath)
  }
  return (
    <section className="editing-timeline" data-testid="editing-timeline" aria-label={app.copy.editing.timelineLabel}>
      <div className="editing-toolbar">
        <div className="editing-toolbar-heading">
          <span className="editing-toolbar-kicker">{app.copy.editing.kicker}</span>
          <strong>{project.title}</strong>
          {app.editingProjectStatus ? <span className={`editing-project-status ${app.editingProjectStatus.success ? 'is-success' : 'is-error'}`} role="status">{app.editingProjectStatus.message}</span> : null}
        </div>
        <div className="editing-toolbar-actions">
          <button className="editing-icon-button" type="button" onClick={() => void app.addEditingSources()} disabled={app.isAddingEditingMedia} title={app.isAddingEditingMedia ? app.copy.editing.addingMedia : app.copy.editing.addMedia} aria-label={app.copy.editing.addMedia} data-testid="editing-add-media"><Plus size={15} /></button>
          <button className="editing-icon-button" type="button" onClick={app.newEditingProject} title={app.copy.editing.newProject} aria-label={app.copy.editing.newProject} data-testid="editing-new-project"><FilePlus2 size={15} /></button>
          <button className="editing-icon-button" type="button" onClick={app.resetEditingProject} title={app.copy.editing.resetProject} aria-label={app.copy.editing.resetProject} data-testid="editing-reset-project"><RotateCcw size={15} /></button>
          <button className="editing-icon-button" type="button" onClick={() => void app.openEditingProjectFile()} title={app.copy.editing.openProject} aria-label={app.copy.editing.openProject} data-testid="editing-open-project"><FolderOpen size={15} /></button>
          <button className="editing-icon-button" type="button" onClick={() => void app.saveEditingProjectFile()} title={app.copy.editing.saveProject} aria-label={app.copy.editing.saveProject} data-testid="editing-save-project"><Save size={15} /></button>
          <button className="editing-icon-button" type="button" onClick={() => void app.rebuildEditingCaptionManifest()} disabled={app.isRebuildingEditingCaptionManifest} title={app.isRebuildingEditingCaptionManifest ? app.copy.editing.rebuildingCaptionManifest : app.copy.editing.rebuildCaptionManifest} aria-label={app.copy.editing.rebuildCaptionManifest} data-testid="editing-rebuild-caption-manifest"><RefreshCw size={15} /></button>
          <span className="editing-toolbar-divider" aria-hidden="true" />
          <button className="editing-icon-button" type="button" onClick={app.undoEditing} disabled={app.editingPast.length === 0} title={app.copy.editing.undo} aria-label={app.copy.editing.undo} data-testid="editing-undo"><Undo2 size={15} /></button>
          <button className="editing-icon-button" type="button" onClick={app.redoEditing} disabled={app.editingFuture.length === 0} title={app.copy.editing.redo} aria-label={app.copy.editing.redo} data-testid="editing-redo"><Redo2 size={15} /></button>
          <span className="editing-toolbar-divider" aria-hidden="true" />
          <button className="editing-icon-button" type="button" onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))} disabled={zoom <= 0.75} title={app.copy.editing.zoomOut} aria-label={app.copy.editing.zoomOut}><ZoomOut size={15} /></button>
          <span className="editing-zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="editing-icon-button" type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.25))} disabled={zoom >= 3} title={app.copy.editing.zoomIn} aria-label={app.copy.editing.zoomIn}><ZoomIn size={15} /></button>
          <button className="editing-icon-button" type="button" onClick={app.closeEditingMode} title={app.copy.editing.close} aria-label={app.copy.editing.close} data-testid="editing-close"><X size={15} /></button>
        </div>
      </div>
      <div className="editing-action-row">
        <div className="editing-transport">
          <button className="editing-primary-button" type="button" onClick={() => void app.toggleEditingPlay()} title={app.state.isPlaying ? app.copy.controls.pause : app.copy.controls.play} aria-label={app.state.isPlaying ? app.copy.controls.pause : app.copy.controls.play} data-testid="editing-play">{app.state.isPlaying ? <Pause size={16} /> : <Play size={16} />}</button>
          <span className="editing-time-readout" data-testid="editing-time-readout">{formatTime(currentTime)} <span>/ {formatTime(durationSeconds)}</span></span>
        </div>
        <div className="editing-edit-actions" role="toolbar" aria-label={app.copy.editing.editTools}>
          <button className="editing-tool-button" type="button" onClick={app.trimEditingClipLeft} disabled={!canSplit} title={app.copy.editing.trimLeft} aria-label={app.copy.editing.trimLeft}><ChevronLeft size={15} /><span>{app.copy.editing.trimLeftShort}</span></button>
          <button className="editing-tool-button" type="button" onClick={app.trimEditingClipRight} disabled={!canSplit} title={app.copy.editing.trimRight} aria-label={app.copy.editing.trimRight}><ChevronRight size={15} /><span>{app.copy.editing.trimRightShort}</span></button>
          <button className="editing-tool-button editing-tool-button-accent" type="button" onClick={app.splitEditingClip} disabled={!canSplit} title={app.copy.editing.split} aria-label={app.copy.editing.split} data-testid="editing-split"><Scissors size={15} /><span>{app.copy.editing.splitShort}</span></button>
          <button className="editing-tool-button" type="button" onClick={() => void app.detectEditingScenes()} disabled={app.isDetectingEditingScenes || !currentPoint} title={app.isDetectingEditingScenes ? sceneCopy.detecting : sceneCopy.title} aria-label={sceneCopy.title} data-testid="editing-scene-split"><ScanSearch size={15} /><span>{app.isDetectingEditingScenes ? sceneCopy.detectingShort : sceneCopy.split}</span></button>
          <button className="editing-tool-button" type="button" onClick={() => void app.removeEditingSilence()} disabled={app.isDetectingEditingSilence || spans.length === 0} title={app.isDetectingEditingSilence ? silenceCopy.detecting : silenceCopy.title} aria-label={silenceCopy.title} data-testid="editing-remove-silence"><Volume2 size={15} /><span>{app.isDetectingEditingSilence ? silenceCopy.detectingShort : silenceCopy.label}</span></button>
          <EditingStructureAnalysis analysis={structureAnalysis} isAnalyzing={isAnalyzingStructure} copy={structureCopy} ignoredSegmentIds={ignoredStructureSegmentIds} onAnalyze={() => void analyzeStructure()} onSeek={seekStructureSegment} onIgnore={ignoreStructureSegment} onRestore={restoreStructureSegment} />
          <EditingSubtitleQa issues={subtitleQaIssues} copy={app.copy.editing} onSeek={app.seekEditingTime} />
          <EditingCaptionSyncControl caption={selectedCaption} currentTime={currentTime} durationSeconds={durationSeconds} copy={app.copy.editing} onMove={app.moveEditingCaption} onResize={app.resizeEditingCaption} />
          <button className="editing-tool-button editing-tool-button-danger" type="button" onClick={app.deleteEditingClip} disabled={spans.length <= 1} title={app.copy.editing.deleteClip} aria-label={app.copy.editing.deleteClip}><Trash2 size={15} /><span>{app.copy.editing.deleteShort}</span></button>
        </div>
        {selectionCount > 1 || movableSelectionCount > 0 ? <div className="editing-selection-toolbar" data-testid="editing-selection-toolbar" role="status" aria-live="polite">{selectionCount > 1 ? <span data-testid="editing-selection-count">{app.copy.editing.selectionCount(selectionCount)}</span> : null}{movableSelectionCount > 0 ? <><button className="editing-tool-button" type="button" onClick={duplicateTimelineSelection} title={app.copy.editing.duplicateSelection} aria-label={app.copy.editing.duplicateSelection} data-testid="editing-duplicate-selection"><Copy size={15} /><span>{app.copy.editing.duplicateSelection}</span></button>{selectionCount > 1 ? <><button className="editing-tool-button" type="button" onClick={() => app.moveEditingSelection(selectionPayload(), -0.1)} title={app.copy.editing.moveSelectionLeft} aria-label={app.copy.editing.moveSelectionLeft} data-testid="editing-selection-move-left"><ChevronLeft size={15} /><span>{app.copy.editing.moveSelectionLeft}</span></button><button className="editing-tool-button" type="button" onClick={() => app.moveEditingSelection(selectionPayload(), 0.1)} title={app.copy.editing.moveSelectionRight} aria-label={app.copy.editing.moveSelectionRight} data-testid="editing-selection-move-right"><ChevronRight size={15} /><span>{app.copy.editing.moveSelectionRight}</span></button></> : null}</> : null}{selectionCount > 1 ? <button className="editing-tool-button editing-tool-button-danger" type="button" onClick={deleteTimelineSelection} title={app.copy.editing.deleteSelection} aria-label={app.copy.editing.deleteSelection} data-testid="editing-delete-selection"><Trash2 size={15} /><span>{app.copy.editing.deleteSelection}</span></button> : null}</div> : null}
        <EditingAudioControl clip={selectedClip} volumeLabel={app.copy.controls.volume} muteLabel={app.copy.controls.mute} onVolumeChange={(volume) => selectedClip && app.setEditingClipVolume(selectedClip.id, volume)} onToggleMute={() => selectedClip && app.toggleEditingClipMute(selectedClip.id)} />
        <EditingTreatmentControl clip={selectedClip} title={app.copy.editing.treatmentLabel} fullLabel={app.copy.editing.fullFrame} punchInLabel={app.copy.editing.punchIn} cornerBottomRightLabel={app.copy.editing.cornerBottomRight} cornerTopLeftLabel={app.copy.editing.cornerTopLeft} splitLeftLabel={app.copy.editing.splitLeft} splitRightLabel={app.copy.editing.splitRight} sizeLabel={app.copy.editing.treatmentSize} scaleLabel={app.copy.editing.punchInScale} focusLabel={app.copy.editing.punchInFocus} focusLeft={app.copy.editing.focusLeft} focusCenter={app.copy.editing.focusCenter} focusRight={app.copy.editing.focusRight} orientation={framingOrientation} orientationHint={app.copy.editing.framingOrientationHint} recommendedLabel={app.copy.editing.recommended} onPreview={(treatment, scale, anchor, size) => selectedClip && app.previewEditingClipTreatment(selectedClip.id, treatment, scale, anchor, size)} onChange={(treatment, scale, anchor, size) => selectedClip && app.setEditingClipTreatment(selectedClip.id, treatment, scale, anchor, size)} />
        <EditingFramingPresetControl title={app.copy.editing.framingPresetTitle} targetLabel={app.copy.editing.framingPresetTarget} names={app.copy.editing.framingPresetNames} orientation={framingOrientation} orientationHint={app.copy.editing.framingOrientationHint} selectedClip={selectedClip} selectedClips={selectedFramingClips} onApply={app.applyEditingFramingPreset} />
        <EditingFilterControl clip={selectedClip} title={app.copy.editing.filterTitle} brightnessLabel={app.copy.editing.brightness} contrastLabel={app.copy.editing.contrast} saturationLabel={app.copy.editing.saturation} resetLabel={app.copy.editing.filterReset} onPreview={(filter) => selectedClip && app.previewEditingClipFilter(selectedClip.id, filter)} onChange={(filter) => selectedClip && app.setEditingClipFilter(selectedClip.id, filter)} />
        <EditingPersonMatteControl clip={selectedClip} title={app.copy.editing.personMatteTitle} readyLabel={app.copy.editing.personMatteReady} missingLabel={app.copy.editing.personMatteMissing} downloadLabel={app.copy.editing.personMatteDownload} downloadingLabel={app.copy.editing.personMatteDownloading} modelFileLabel={app.copy.editing.personMatteModelFile} failureLabel={app.copy.editing.personMatteFailure} enableLabel={app.copy.editing.personMatteEnable} enabledLabel={app.copy.editing.personMatteEnabled} featherLabel={app.copy.editing.personMatteFeather} outlineLabel={app.copy.editing.personMatteOutline} outlineColorLabel={app.copy.editing.personMatteOutlineColor} onChange={(personMatte) => selectedClip && app.setEditingClipPersonMatte(selectedClip.id, personMatte)} />
        <EditingTransitionControl clip={selectedClip} isFirstClip={selectedClipIndex <= 0} title={app.copy.editing.transitionTitle} noneLabel={app.copy.editing.transitionNone} transitionLabels={app.copy.editing.transitionLabels} durationLabel={app.copy.editing.transitionDuration} onChange={(transition) => selectedClip && app.setEditingClipTransition(selectedClip.id, transition)} />
        <EditingClipMotionControl clip={selectedClip} enterLabel={app.copy.editing.graphicEnter} exitLabel={app.copy.editing.graphicExit} durationLabel={app.copy.editing.graphicMotionDuration} motionLabels={app.copy.editing.graphicMotionLabels} onChange={(patch) => selectedClip && app.setEditingClipMotion(selectedClip.id, patch)} />
        <EditingCaptionEffectControl title={app.copy.editing.captionEffectTitle} names={app.copy.editing.captionEffectNames} value={project.captionEffect ?? 'none'} onChange={app.setEditingCaptionEffect} />
        <EditingCanvasControl title={app.copy.editing.canvasTitle} names={app.copy.editing.canvasNames} value={canvasPreset} onChange={app.setEditingCanvasPreset} />
        <EditingCaptionLayoutControl title={app.copy.editing.captionLayoutTitle} xLabel={app.copy.editing.captionLayoutX} yLabel={app.copy.editing.captionLayoutY} widthLabel={app.copy.editing.captionLayoutWidth} sizeLabel={app.copy.editing.captionLayoutSize} resetLabel={app.copy.editing.captionLayoutReset} sourceLabel={app.copy.editing.captionLayoutSource} translationLabel={app.copy.editing.captionLayoutTranslation} hasTranslation={project.captions.some((caption) => caption.kind === 'translation')} value={captionLayout} onChange={(line, patch) => app.setEditingCaptionLayout(line === 'source' ? patch : { translation: patch })} />
        <EditingThemeControl title={app.copy.editing.themeTitle} presetLabel={app.copy.editing.themePresetLabel} presetNames={app.copy.editing.themePresetNames} savedLabel={app.copy.editing.themeSavedLabel} searchPlaceholder={app.copy.editing.themeSearchPlaceholder} namePlaceholder={app.copy.editing.themeNamePlaceholder} saveLabel={app.copy.editing.themeSave} emptyLabel={app.copy.editing.themeEmpty} deleteLabel={app.copy.editing.themeDelete} current={currentTheme} savedThemes={themes} onApply={applyEditingTheme} onSave={saveTheme} onDelete={deleteTheme} />
        <EditingGraphicControl title={app.copy.editing.graphicTitle} textLabel={app.copy.editing.graphicText} textPlaceholder={app.copy.editing.graphicPlaceholder} addLabel={app.copy.editing.graphicAdd} positionLabel={app.copy.editing.graphicPosition} styleLabel={app.copy.editing.graphicStyle} titleStyleLabel={app.copy.editing.graphicStyleTitle} labelStyleLabel={app.copy.editing.graphicStyleLabel} durationLabel={app.copy.editing.graphicDuration} presetLabel={app.copy.editing.graphicPresetLabel} presetLabels={app.copy.editing.graphicPresetLabels} presetTexts={app.copy.editing.graphicPresetTexts} assetLibraryLabel={app.copy.editing.assetLibraryLabel} assetSearchPlaceholder={app.copy.editing.assetSearchPlaceholder} assetEmptyLabel={app.copy.editing.assetEmptyLabel} assetDeleteLabel={app.copy.editing.assetDeleteLabel} assets={elementAssets} onDeleteAsset={deleteElementAsset} defaultPosition={graphicDefaults.graphicPosition} defaultStyle={graphicDefaults.graphicStyle} positionLabels={app.copy.editing.graphicPositionLabels} currentTime={currentTime} timelineDuration={durationSeconds} onAdd={app.addEditingGraphic} />
        <EditingGraphicEditor graphic={selectedGraphic} title={app.copy.editing.graphicEditTitle} textLabel={app.copy.editing.graphicText} textPlaceholder={app.copy.editing.graphicPlaceholder} saveLabel={app.copy.editing.graphicSave} positionLabel={app.copy.editing.graphicPosition} styleLabel={app.copy.editing.graphicStyle} titleStyleLabel={app.copy.editing.graphicStyleTitle} labelStyleLabel={app.copy.editing.graphicStyleLabel} durationLabel={app.copy.editing.graphicDuration} enterLabel={app.copy.editing.graphicEnter} exitLabel={app.copy.editing.graphicExit} motionDurationLabel={app.copy.editing.graphicMotionDuration} motionLabels={app.copy.editing.graphicMotionLabels} assetSaveLabel={app.copy.editing.assetSaveLabel} positionLabels={app.copy.editing.graphicPositionLabels} timelineDuration={durationSeconds} onSaveAsset={saveElementAsset} onUpdate={app.updateEditingGraphic} />
        <EditingVideoBlockControl sources={project.sources} title={app.copy.editing.videoBlockTitle} addLabel={app.copy.editing.videoBlockAdd} sourceLabel={app.copy.editing.videoBlockSource} positionLabel={app.copy.editing.videoBlockPosition} positionLabels={app.copy.editing.videoBlockPositionLabels} onAdd={app.addEditingVideoBlock} />
        <EditingVideoBlockEditor block={selectedVideoBlock} source={selectedVideoBlockSource} title={app.copy.editing.videoBlockEditTitle} positionLabel={app.copy.editing.videoBlockPosition} positionLabels={app.copy.editing.videoBlockPositionLabels} sourceStartLabel={app.copy.editing.videoBlockSourceStart} durationLabel={app.copy.editing.graphicDuration} sizeLabel={app.copy.editing.videoBlockSize} radiusLabel={app.copy.editing.videoBlockRadius} borderLabel={app.copy.editing.videoBlockBorder} enterLabel={app.copy.editing.videoBlockEnter} exitLabel={app.copy.editing.videoBlockExit} motionDurationLabel={app.copy.editing.videoBlockMotionDuration} motionLabels={app.copy.editing.videoBlockMotionLabels} onUpdate={app.updateEditingVideoBlock} />
        <EditingExportSummary clips={project.videoClips} durationSeconds={durationSeconds} canvasWidth={canvasDimensions.width} canvasHeight={canvasDimensions.height} summaryLabel={app.copy.editing.export} durationLabel={app.copy.panels.duration} clipsLabel={app.copy.editing.videoTrack} resolutionLabel={app.copy.panels.resolution} audioLabel={app.copy.panels.audioStream} muteLabel={app.copy.controls.mute} volumeLabel={app.copy.controls.volume} />
        <button className="editing-export-button" type="button" onClick={() => setIsExportConfirmOpen(true)} disabled={!canExport || app.isExportingClip} title={app.isExportingClip ? app.copy.editing.exporting : app.copy.editing.export} aria-label={app.copy.editing.export} data-testid="editing-export"><Download size={15} />{app.isExportingClip ? app.copy.editing.exporting : app.copy.editing.export}</button>
      </div>
      <EditingAssetsPanel sources={project.sources} sourceFiles={app.editingSourceFiles} filmstrips={filmstrips} usedSourceIds={project.videoClips.map((clip) => clip.sourceId)} copy={app.copy.editing} onInsertMain={app.insertEditingSourceClip} onAppendMain={app.appendEditingSourceClips} onInsertOverlay={(sourceId) => app.addEditingVideoBlock(sourceId, { position: 'bottom-right' })} />
      {app.editingCaptionReloadConflict ? <EditingCaptionReloadConflict conflict={app.editingCaptionReloadConflict} copy={subtitleReloadCopy} onSeek={app.seekEditingTime} onPreviewIncoming={previewIncomingCaption} onAcceptIncoming={(change) => { setIncomingCaptionPreview(null); app.acceptEditingSubtitleReloadChange(change) }} onAddIncoming={(change) => { setIncomingCaptionPreview(null); app.acceptEditingSubtitleReloadAddition(change) }} onRemoveCurrent={(change) => { setIncomingCaptionPreview(null); app.removeEditingSubtitleReloadChange(change) }} onKeepCurrentChange={(change) => { setIncomingCaptionPreview(null); app.keepEditingSubtitleReloadRemoval(change) }} onSelectSidecarCandidate={(sourceId, kind, path) => { setIncomingCaptionPreview(null); void app.selectEditingCaptionCandidate(sourceId, kind, path) }} isSelectingSidecarCandidate={app.isSelectingEditingCaptionCandidate} onSelectScriptSegment={selectScriptSegment} onKeepCurrent={() => { setIncomingCaptionPreview(null); app.keepCurrentEditingCaptions() }} onForceReload={() => { setIncomingCaptionPreview(null); app.forceReloadEditingCaptions() }} /> : null}
      <EditingScriptPanel segments={project.scriptSegments ?? []} selectedSegmentId={selectedScriptSegmentId} title={app.copy.editing.scriptTitle} hint={app.copy.editing.scriptHint} emptyLabel={app.copy.editing.scriptEmpty} deleteLabel={app.copy.editing.scriptDelete} restoreLabel={app.copy.editing.scriptRestore} restoreWithTranslationLabel={app.copy.editing.scriptRestoreWithTranslation} orphanTranslationHint={app.copy.editing.scriptOrphanTranslationHint} orphanTranslationSegmentIds={orphanTranslationSegmentIds} deletedLabel={app.copy.editing.scriptDeleted} editLabel={app.copy.editing.scriptEdit} saveLabel={app.copy.editing.scriptSave} cancelLabel={app.copy.editing.scriptCancel} editPlaceholder={app.copy.editing.scriptPlaceholder} countLabel={app.copy.editing.scriptCount} wordDeleteLabel={scriptCopy.wordDelete} wordReplaceLabel={scriptCopy.wordReplace} wordReplacePlaceholder={scriptCopy.wordReplacePlaceholder} selectedLabel={scriptCopy.selectedCount} fillerDeleteLabel={scriptCopy.fillerDelete} onSelect={selectScriptSegment} onUpdate={(segmentId, text) => { setSelectedScriptSegmentId(segmentId); app.updateEditingScriptText(segmentId, text) }} onDelete={(segmentId) => { setSelectedScriptSegmentId(segmentId); app.deleteEditingScriptSegment(segmentId) }} onRestore={(segmentId) => { setSelectedScriptSegmentId(segmentId); app.restoreEditingScriptSegment(segmentId) }} onDeleteWord={(segmentId, word) => { setSelectedScriptSegmentId(segmentId); app.deleteEditingScriptWord(segmentId, word) }} onReplaceWord={(segmentId, word, text) => { setSelectedScriptSegmentId(segmentId); app.replaceEditingScriptWord(segmentId, word, text) }} onDeleteWords={(targets) => { const first = targets[0]; if (first) setSelectedScriptSegmentId(first.segmentId); app.deleteEditingScriptWords(targets) }} />
      {incomingCaptionPreview ? (() => {
        const currentTracks = (['source', 'translation'] as const).map((kind) => incomingCaptionPreview.current?.[kind]).filter((track): track is EditingSubtitleReloadIncomingPreviewTrack => Boolean(track))
        const incomingTracks = (['source', 'translation'] as const).map((kind) => incomingCaptionPreview.incoming[kind]).filter((track): track is EditingSubtitleReloadIncomingPreviewTrack => Boolean(track))
        const previewStatus = incomingCaptionPreview.current === null ? 'added' : 'changed'
        const renderPreviewTrack = (track: EditingSubtitleReloadIncomingPreviewTrack, side: 'current' | 'incoming'): React.ReactElement => <div className="editing-caption-reload-incoming-track" key={`${side}-${track.kind}`} data-testid={`editing-caption-reload-${side}-track-${track.kind}`}>
          <span>{track.kind === 'source' ? subtitleReloadCopy.source : subtitleReloadCopy.translation}</span>
          <strong title={track.text}>{track.text}</strong>
          <small>{subtitleReloadCopy.incomingPreviewTime} {formatIncomingPreviewRange(track)}</small>
        </div>
        return <div className={`editing-caption-reload-incoming-preview is-${previewStatus}`} data-testid="editing-caption-reload-incoming-preview" data-preview-status={previewStatus} role="status" aria-live="polite">
          <span className="editing-caption-reload-incoming-preview-notice">{previewStatus === 'added' ? subtitleReloadCopy.incomingPreviewNotice : subtitleReloadCopy.changedPreviewNotice}</span>
          <div className="editing-caption-reload-incoming-comparison" data-testid="editing-caption-reload-incoming-comparison">
            <div className="editing-caption-reload-incoming-side is-current" data-testid="editing-caption-reload-incoming-current">
              <span>{subtitleReloadCopy.current}</span>
              {currentTracks.length > 0 ? <div className="editing-caption-reload-incoming-tracks">{currentTracks.map((track) => renderPreviewTrack(track, 'current'))}</div> : <div className="editing-caption-reload-incoming-empty"><strong>{subtitleReloadCopy.empty}</strong><small>—</small></div>}
            </div>
            <ArrowRight size={13} aria-hidden="true" />
            <div className="editing-caption-reload-incoming-side is-incoming" data-testid="editing-caption-reload-incoming-incoming">
              <span>{subtitleReloadCopy.incoming}</span>
              <div className="editing-caption-reload-incoming-tracks">
                {incomingTracks.map((track) => renderPreviewTrack(track, 'incoming'))}
              </div>
            </div>
          </div>
          <button type="button" onClick={() => setIncomingCaptionPreview(null)} aria-label={subtitleReloadCopy.clearPreview} title={subtitleReloadCopy.clearPreview} data-testid="editing-caption-reload-clear-preview"><X size={12} aria-hidden="true" />{subtitleReloadCopy.clearPreview}</button>
        </div>
      })() : null}
      <div className="editing-timeline-scroll">
        <div ref={timelineContentRef} className="editing-timeline-content" style={{ width: `${Math.max(100, zoom * 100)}%` }} onPointerDown={beginTimelineMarquee} onPointerMove={moveTimelineMarquee} onPointerUp={finishTimelineMarquee} onPointerCancel={finishTimelineMarquee} onKeyDown={handleTimelineKeyDown}>
          <div className="editing-ruler-row">
            <span className="editing-track-label" aria-hidden="true"><Grid3X3 size={13} /></span>
            <div className="editing-ruler" aria-hidden="true">
              {Array.from({ length: rulerTickCount }, (_, index) => <span key={index} className="editing-ruler-tick" style={{ left: `${durationSeconds > 0 ? (index / (rulerTickCount - 1)) * 100 : 0}%` }}>{formatTime(index)}</span>)}
            </div>
          </div>
          <div className="editing-track-row">
            <span className="editing-track-label">{app.copy.editing.videoTrack}</span>
            <EditingRangeTrack durationSeconds={durationSeconds} currentTime={currentTime} snapPoints={snapPoints} trackLabel={app.copy.editing.playhead} deleteRangeLabel={app.copy.editing.deleteRange} onSeek={app.seekEditingTime} onDeleteRange={app.deleteEditingRange} onDropSource={app.insertEditingSourceClip}>
              {spans.map((span) => <EditingClipBoundaryHandles key={`boundary-${span.clip.id}`} span={span} durationSeconds={durationSeconds} snapPoints={snapPoints} startLabel={app.copy.editing.trimLeft} endLabel={app.copy.editing.trimRight} onCommit={app.updateEditingClipBoundary} />)}
              <div className="editing-clip-row">
                {spans.map((span, index) => {
                  const selected = selection.clipIds.has(span.clip.id)
                  const dragged = clipDrag?.from === index
                  const sourceDurationSeconds = project.sources.find((source) => source.id === span.clip.sourceId)?.durationSeconds ?? span.clip.sourceEndSeconds
                  const clipTiles = getEditingFilmstripTiles(filmstrips[span.clip.sourceId] ?? [], span.clip.sourceStartSeconds, span.clip.sourceEndSeconds, sourceDurationSeconds)
                  return <button
                    className={`editing-clip ${currentPoint?.index === span.index ? 'is-active' : ''} ${selected ? 'is-selected' : ''} ${dragged && clipDrag?.moved ? 'is-dragging' : ''}`}
                    key={span.clip.id}
                    type="button"
                    style={{ width: `${durationSeconds > 0 ? ((span.editedEndSeconds - span.editedStartSeconds) / durationSeconds) * 100 : 0}%`, ...(dragged && clipDrag?.moved ? { transform: `translateX(${clipDrag.dx}px)`, zIndex: 4 } : {}) }}
                    title={formatClipLabel(span.clip.sourceStartSeconds, span.clip.sourceEndSeconds)}
                    aria-label={`${index + 1}: ${formatClipLabel(span.clip.sourceStartSeconds, span.clip.sourceEndSeconds)}`}
                    data-editing-selection-kind="clip"
                    data-editing-selection-id={span.clip.id}
                    onPointerDown={(event) => startClipDrag(event, index)}
                    onPointerMove={(event) => moveClipDrag(event, index)}
                    onPointerUp={finishClipDrag}
                    onPointerCancel={finishClipDrag}
                    onClick={(event) => { event.stopPropagation(); if (suppressClipClickRef.current) return; selectTimelineItem('clip', span.clip.id, event.metaKey || event.ctrlKey) }}
                    onDragOver={(event) => { if (event.dataTransfer.types.includes(EDITING_SOURCE_DRAG_TYPE)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy' } }}
                    onDrop={(event) => { const sourceId = readEditingSourceDrag(event); if (!sourceId) return; event.preventDefault(); event.stopPropagation(); app.replaceEditingClipSource(sourceId, span.clip.id) }}
                    onKeyDown={(event) => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); event.stopPropagation(); app.reorderEditingClips(index, index + (event.key === 'ArrowLeft' ? -1 : 1)) }}
                  >{clipTiles.length > 0 ? <span className="editing-clip-filmstrip" aria-hidden="true">{clipTiles.map((tile) => <img key={`${tile.frame.sourceSeconds}-${tile.frame.url.slice(-12)}`} src={tile.frame.url} alt="" style={{ left: `${tile.leftPercent}%`, width: `${tile.widthPercent}%` }} />)}</span> : null}<span>{index + 1}</span><small>{formatClipLabel(span.clip.sourceStartSeconds, span.clip.sourceEndSeconds)}</small></button>
                })}
                {clipDrag?.moved && clipDrag.to !== clipDrag.from ? <span className="editing-clip-drop-marker" style={{ left: `${durationSeconds > 0 ? (((clipDrag.to < clipDrag.from ? spans[clipDrag.to]!.editedStartSeconds : spans[clipDrag.to]!.editedEndSeconds) / durationSeconds) * 100) : 0}%` }} aria-hidden="true" /> : null}
              </div>
              <div className="editing-playhead" style={{ left: `${playheadPercent}%` }} aria-hidden="true"><span /></div>
              {framingMarkers.map(({ keyframe, clip }) => {
                const label = keyframe.state.treatment === 'punch-in' ? `${app.copy.editing.punchIn} ${Math.round(keyframe.state.scale * 100)}%` : keyframe.state.treatment === 'corner-br' ? `${app.copy.editing.cornerBottomRight} ${Math.round(keyframe.state.size)}%` : keyframe.state.treatment === 'corner-tl' ? `${app.copy.editing.cornerTopLeft} ${Math.round(keyframe.state.size)}%` : keyframe.state.treatment === 'split-left' ? `${app.copy.editing.splitLeft} ${Math.round(keyframe.state.size)}%` : keyframe.state.treatment === 'split-right' ? `${app.copy.editing.splitRight} ${Math.round(keyframe.state.size)}%` : app.copy.editing.fullFrame
                const markerLabel = `${formatTime(keyframe.at)} · ${app.copy.editing.treatmentLabel}: ${label}`
                const isSelected = clip?.id === app.editingSelectedClipId
                return <button className={`editing-framing-marker ${isSelected ? 'is-selected' : ''}`} key={`framing-marker-${keyframe.at}`} type="button" style={{ left: `${(keyframe.at / durationSeconds) * 100}%` }} title={markerLabel} aria-label={markerLabel} data-label={label} data-clip-id={clip?.id} data-selected={isSelected ? 'true' : undefined} data-testid={`editing-framing-marker-${Math.round(keyframe.at * 1000)}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (clip) app.selectEditingClip(clip.id); else app.seekEditingTime(keyframe.at) }}><span aria-hidden="true" /></button>
              })}
            </EditingRangeTrack>
          </div>
          <EditingWaveformTrack segments={waveformSegments} durationSeconds={durationSeconds} currentTime={currentTime} trackLabel={app.copy.editing.waveformTrack} emptyLabel={app.copy.editing.waveformUnavailable} onSeek={app.seekEditingTime} />
          {overlayTrackOrder.map(renderOverlayTrack)}
          {marquee ? <div className="editing-selection-marquee" aria-hidden="true" style={{ left: `${Math.min(marquee.startX, marquee.currentX) - (timelineContentRef.current?.getBoundingClientRect().left ?? 0)}px`, top: `${Math.min(marquee.startY, marquee.currentY) - (timelineContentRef.current?.getBoundingClientRect().top ?? 0)}px`, width: `${Math.abs(marquee.currentX - marquee.startX)}px`, height: `${Math.abs(marquee.currentY - marquee.startY)}px` }} /> : null}
        </div>
      </div>
      {isExportConfirmOpen ? <EditingExportConfirmDialog copy={app.copy} mediaPath={project.sources[0]?.path ?? ''} clips={project.videoClips} durationSeconds={durationSeconds} canvasWidth={canvasDimensions.width} canvasHeight={canvasDimensions.height} hasSubtitle={hasExportSubtitle} hasTranslationSubtitle={hasTranslationSubtitle} audit={exportAudit} initialMode={hasExportSubtitle ? app.appSettings.capture.clipExportMode : hasTranslationSubtitle ? 'translation-subtitle' : 'video'} onClose={() => setIsExportConfirmOpen(false)} onConfirm={confirmEditingExport} /> : null}</section>
  )}
