import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { EditingSubtitleFileExportRequest, EditingSubtitleFileExportResult } from '../shared/editing-subtitle-export'
import type { AppSettings } from '../shared/app-settings'
import type { AppUpdateState } from '../shared/app-update-types'
import type {
  DramaCreateProjectInput,
  DramaAssetInput,
  DramaAssetPatch,
  DramaGenerationTaskInput,
  DramaGenerationTaskPatch,
  DramaGraphTemplateInput,
  DramaImportChapterInput,
  DramaProgress,
  DramaProject,
  DramaProjectData,
  DramaProviderSettings,
  DramaProviderSettingsInput,
  DramaProviderTestResult,
  DramaStageResult
} from '../shared/drama-types'

// 在 DOM 加载后添加平台类名，供 CSS 使用
if (typeof document !== 'undefined') {
  const platform = process.platform
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add(`platform-${platform}`)
  })
}
import type {
  AsrJobProgress,
  AsrCacheClearResult,
  AsrCacheStatsResult,
  AsrModelDownloadProgress,
  AsrModelDownloadResult,
  AsrModelSourceId,
  AsrRuntimeSetupResult,
  AsrRuntimeStatus,
  MediaClipExportRequest,
  MediaClipExportResult,
  MediaTimelineExportPathRequest,
  MediaTimelineExportPathResult,
  MediaTimelineExportRequest,
  AsrSubtitleExportRequest,
  AsrSubtitleExportResult,
  AsrSubtitleCheckpointRequest,
  AsrSubtitleCheckpointResult,
  AsrSubtitleTranslationRequest,
  AsrSubtitleTranslationResult,
  AsrSubtitleSummaryRequest,
  AsrSubtitleSummaryExportRequest,
  AsrSubtitleSummaryExportResult,
  AsrSubtitleSummaryResult,
  AsrTranslationServiceTestRequest,
  AsrTranslationServiceTestResult,
  AsrDiagnosticLogResult,
  ClipboardWriteTextRequest,
  ClipboardWriteTextResult,
  AsrSubtitleRequest,
  AsrSubtitleSidecarRequest,
  AsrSubtitleResult,
  BatchSubtitleJob,
  BatchSubtitleScanRequest,
  BatchSubtitleStartRequest,
  MediaFile,
  MediaFfmpegCapabilities,
  MediaFilmstripRequest,
  MediaFilmstripResult,
  MediaWaveformRequest,
  MediaWaveformResult,
  MediaSceneDetectionRequest,
  MediaSceneDetectionResult,
  MediaSilenceDetectionRequest,
  MediaSilenceDetectionResult,
  MediaStructureAnalysisRequest,
  MediaStructureAnalysisResult,
  MediaProbeMetadata,
  ImageSaveRequest,
  ImageSaveResult,
  NativePlaybackResult,
  NativePlayerStatus,
  VisionIndexProgress,
  VisionIndexFailureRecord,
  VisionIndexFailureRetryBatchRequest,
  VisionIndexFailureRetryRequest,
  VisionIndexRequest,
  VisionDirectoryScanProgress,
  VisionDirectoryScanRequest,
  VisionDirectoryScanResult,
  VisionClipCollection,
  VisionClipCollectionBatchDuplicateRequest,
  VisionClipCollectionBatchDuplicateResult,
  VisionClipCollectionBatchDeleteRequest,
  VisionClipCollectionBatchDeleteResult,
  VisionClipCollectionBatchExportRequest,
  VisionClipCollectionBatchExportResult,
  VisionClipCollectionBatchRenameRequest,
  VisionClipCollectionBatchRenameResult,
  VisionClipCollectionBatchTagsRequest,
  VisionClipCollectionBatchTagsResult,
  VisionClipCollectionFlagUpdateRequest,
  VisionClipCollectionFlagUpdateResult,
  VisionClipCollectionTagCleanupRequest,
  VisionClipCollectionTagCleanupResult,
  VisionClipCollectionTagMetadata,
  VisionClipCollectionTagMetadataImportApplyRequest,
  VisionClipCollectionTagMetadataImportPreviewResult,
  VisionClipCollectionTagMetadataTransferResult,
  VisionClipCollectionTagMetadataUpdateRequest,
  VisionClipCollectionTagMetadataUpdateResult,
  VisionClipCollectionTagOperationHistory,
  VisionClipCollectionTagRedoResult,
  VisionClipCollectionTagUndoResult,
  VisionClipCollectionOperationHistory,
  VisionClipCollectionOperationRedoResult,
  VisionClipCollectionOperationUndoResult,
  VisionClipCollectionTagRenameRequest,
  VisionClipCollectionTagRenameResult,
  VisionClipCollectionInput,
  VisionClipCollectionExportRequest,
  VisionClipCollectionExportResult,
  VisionClipCollectionImportResult,
  VisionRuntimeStatus,
  VisionPackDownloadResult,
  VisionModelDownloadProgress,
  VisionModelDownloadResult,
  VisionSearchFullExportRequest,
  VisionSearchPageRequest,
  VisionSearchResultPage,
  VisionSearchRequest,
  VisionSearchResult,
  VisionSearchResultsExportRequest,
  VisionSearchResultsExportResult,
  VisionSimilarSearchRequest,
  VisionLibrarySource,
  VisionLibrarySourceRequest,
  PersonMatteModelDownloadProgress,
  PersonMatteModelDownloadResult,
  PersonMatteModelStatus,
  PersonMatteTrackProgress,
  PersonMatteTrackRequest,
  PersonMatteTrackResult,
  SpeakerDiarizationModelStatus,
  SpeakerDiarizationEvidenceBatchClearRequest,
  SpeakerDiarizationEvidenceBatchClearResult,
  SpeakerDiarizationEvidenceClearResult,
  SpeakerDiarizationEvidenceSource,
  SpeakerDiarizationEvidenceSourceRequest,
  SpeakerDiarizationRunRequest,
  SpeakerDiarizationRunResult
} from '../shared/media-types'
import type { LivePhotoExportRequest, LivePhotoExportResult, LivePhotoProbeResult } from '../shared/live-photo-types'
import type { EditingProjectFileOpenResult, EditingProjectFileSaveRequest, EditingProjectFileSaveResult } from '../shared/editing-types'
import type { EditingCaptionFilesChangedEvent, EditingCaptionWatchRequest, EditingCaptionWatchStartResult } from '../shared/editing-caption-watcher'
import type { WebDesktopStateUpdate, WebRemoteCommandForDesktop, WebShareStartRequest, WebShareStatus } from '../shared/web-types'
import type { MediaEvidenceCapabilities, MediaEvidenceDraft, MediaEvidenceDraftImportRequest, MediaEvidenceDraftImportResult, MediaEvidenceDraftSaveRequest, MediaEvidenceTask, MediaEvidenceTaskRequest } from '../shared/evidence-task-types'
import type { VisionEntityCatalog, VisionEntityCatalogBatchPatch, VisionEntityCatalogCreateInput, VisionEntityCatalogPatch } from '../shared/vision-entity-types'
import type { SpeakerDiarizationCatalog, SpeakerDiarizationCatalogPatch } from '../shared/speaker-diarization-catalog-types'
import type { VisionObjectDetectionModelStatus, VisionObjectDetectionRequest, VisionObjectDetectionResponse } from '../shared/vision-object-detection-types'
import type { VisionEvidenceAuditPage, VisionEvidenceAuditRequest, VisionEvidenceBatchClearRequest, VisionEvidenceBatchClearResult, VisionEvidenceSource, VisionEvidenceSourceRequest, VisionSavedSearch, VisionSavedSearchFileResult, VisionSavedSearchInput } from '../shared/vision-types'
import type { EditingAgentProposalDecision, EditingAgentProposalRequest } from '../shared/editing-agent'
import type { MediaImportInboxDirectoriesChangedEvent, MediaImportInboxItem, MediaImportInboxMetadataUpdateRequest, MediaImportInboxPipelineProgress, MediaImportInboxScanRequest, MediaImportInboxScanResponse, MediaImportInboxScanProgress, MediaImportInboxTransitionRequest, MediaImportInboxWatchRequest, MediaImportInboxWatchStartResult } from '../shared/media-import-inbox'
import type { TaskCenterEvent } from '../shared/task-center-types'
import type { VisionSearchExportBatchRecreateRequest, VisionSearchExportBatchRecreateResult, VisionSearchExportCancelRequest, VisionSearchExportRetryRequest } from '../shared/vision-search-export-types'

const editingAgentProposalListeners = new Set<(request: EditingAgentProposalRequest) => void>()
const queuedEditingAgentProposals: EditingAgentProposalRequest[] = []
ipcRenderer.on(IPC_CHANNELS.EDITING_AGENT_PROPOSAL, (_event, request: EditingAgentProposalRequest) => {
  if (editingAgentProposalListeners.size === 0) {
    queuedEditingAgentProposals.push(request)
    return
  }
  for (const listener of editingAgentProposalListeners) listener(request)
})

const api = {
  platform: process.platform,
  openMediaFiles: (): Promise<MediaFile[]> => ipcRenderer.invoke(IPC_CHANNELS.OPEN_MEDIA_FILES),
  openMediaDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.OPEN_MEDIA_DIRECTORY),
  openFolderPicker: (request: { title: string; defaultPath?: string | null }): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_FOLDER_PICKER, request),
  openEditingProject: (): Promise<EditingProjectFileOpenResult> => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EDITING_PROJECT),
  saveEditingProject: (request: EditingProjectFileSaveRequest): Promise<EditingProjectFileSaveResult> => ipcRenderer.invoke(IPC_CHANNELS.SAVE_EDITING_PROJECT, request),
  createMediaFile: (filePath: string): Promise<MediaFile> => ipcRenderer.invoke(IPC_CHANNELS.CREATE_MEDIA_FILE, filePath),
  isMediaFileAvailable: (filePath: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.CHECK_MEDIA_FILE, filePath),
  readFileContent: (filePath: string): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.READ_FILE_CONTENT, filePath),
  getFileRevision: (filePath: string): Promise<number | null> => ipcRenderer.invoke(IPC_CHANNELS.GET_FILE_REVISION, filePath),
  startEditingCaptionWatcher: (request: EditingCaptionWatchRequest): Promise<EditingCaptionWatchStartResult> => ipcRenderer.invoke(IPC_CHANNELS.EDITING_CAPTION_WATCH_START, request),
  stopEditingCaptionWatcher: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.EDITING_CAPTION_WATCH_STOP),
  onEditingAgentProposal: (callback: (request: EditingAgentProposalRequest) => void): (() => void) => {
    editingAgentProposalListeners.add(callback)
    for (const request of queuedEditingAgentProposals.splice(0)) callback(request)
    return () => editingAgentProposalListeners.delete(callback)
  },
  respondEditingAgentProposal: (requestId: string, decision: EditingAgentProposalDecision): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.EDITING_AGENT_PROPOSAL_RESPONSE, { requestId, decision }),
  listMediaFilesInDirectory: (directoryPath: string): Promise<MediaFile[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_MEDIA_FILES_IN_DIRECTORY, directoryPath),
  scanBatchSubtitleDirectory: (request: BatchSubtitleScanRequest): Promise<MediaFile[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.BATCH_SUBTITLE_SCAN_DIRECTORY, request),
  startBatchSubtitle: (request: BatchSubtitleStartRequest): Promise<BatchSubtitleJob> =>
    ipcRenderer.invoke(IPC_CHANNELS.BATCH_SUBTITLE_START, request),
  pauseBatchSubtitle: (): Promise<BatchSubtitleJob | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.BATCH_SUBTITLE_PAUSE),
  resumeBatchSubtitle: (): Promise<BatchSubtitleJob | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.BATCH_SUBTITLE_RESUME),
  cancelBatchSubtitle: (): Promise<BatchSubtitleJob | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.BATCH_SUBTITLE_CANCEL),
  retryFailedBatchSubtitle: (retryableOnly = false): Promise<BatchSubtitleJob | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.BATCH_SUBTITLE_RETRY_FAILED, retryableOnly),
  getCurrentBatchSubtitle: (): Promise<BatchSubtitleJob | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.BATCH_SUBTITLE_GET_CURRENT),
  getBatchSubtitleHistory: (): Promise<BatchSubtitleJob[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.BATCH_SUBTITLE_GET_HISTORY),
  retryHistoryBatchSubtitle: (jobId: string, retryableOnly = false): Promise<BatchSubtitleJob | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.BATCH_SUBTITLE_RETRY_HISTORY, jobId, retryableOnly),
  openBatchSubtitleLogDirectory: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.BATCH_SUBTITLE_OPEN_LOG_DIRECTORY),
  getMediaMetadata: (filePath: string): Promise<MediaProbeMetadata | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_MEDIA_METADATA, filePath),
  getFfmpegCapabilities: (): Promise<MediaFfmpegCapabilities> => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_GET_FFMPEG_CAPABILITIES),
  extractMediaFilmstrip: (request: MediaFilmstripRequest): Promise<MediaFilmstripResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXTRACT_MEDIA_FILMSTRIP, request),
  extractMediaWaveform: (request: MediaWaveformRequest): Promise<MediaWaveformResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXTRACT_MEDIA_WAVEFORM, request),
  detectMediaScenes: (request: MediaSceneDetectionRequest): Promise<MediaSceneDetectionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.DETECT_MEDIA_SCENES, request),
  detectMediaSilence: (request: MediaSilenceDetectionRequest): Promise<MediaSilenceDetectionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.DETECT_MEDIA_SILENCE, request),
  analyzeMediaStructure: (request: MediaStructureAnalysisRequest): Promise<MediaStructureAnalysisResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYZE_MEDIA_STRUCTURE, request),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),
  getAppUpdateState: (): Promise<AppUpdateState> => ipcRenderer.invoke(IPC_CHANNELS.APP_UPDATE_GET_STATE),
  checkForAppUpdate: (): Promise<AppUpdateState> => ipcRenderer.invoke(IPC_CHANNELS.APP_UPDATE_CHECK),
  installAppUpdate: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.APP_UPDATE_INSTALL),
  getAppSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_SETTINGS),
  setAppSettings: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.APP_SET_SETTINGS, settings),
  restartApp: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.APP_RELAUNCH),
  startWebShare: (request: WebShareStartRequest): Promise<WebShareStatus> => ipcRenderer.invoke(IPC_CHANNELS.WEB_SHARE_START, request),
  stopWebShare: (): Promise<WebShareStatus> => ipcRenderer.invoke(IPC_CHANNELS.WEB_SHARE_STOP),
  getWebShareStatus: (): Promise<WebShareStatus> => ipcRenderer.invoke(IPC_CHANNELS.WEB_SHARE_STATUS),
  refreshWebShare: (request: WebShareStartRequest): Promise<WebShareStatus> => ipcRenderer.invoke(IPC_CHANNELS.WEB_SHARE_REFRESH, request),
  updateWebDesktopState: (state: WebDesktopStateUpdate): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WEB_DESKTOP_STATE_UPDATE, state),
  onWebRemoteCommand: (callback: (command: WebRemoteCommandForDesktop) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: WebRemoteCommandForDesktop): void => callback(command)
    ipcRenderer.on(IPC_CHANNELS.WEB_REMOTE_COMMAND, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WEB_REMOTE_COMMAND, listener)
  },
  checkAsrRuntime: (): Promise<AsrRuntimeStatus> => ipcRenderer.invoke(IPC_CHANNELS.ASR_HEALTH_CHECK),
  getAsrCacheStats: (): Promise<AsrCacheStatsResult> => ipcRenderer.invoke(IPC_CHANNELS.ASR_CACHE_STATS),
  clearStaleAsrCache: (): Promise<AsrCacheClearResult> => ipcRenderer.invoke(IPC_CHANNELS.ASR_CACHE_CLEAR_STALE),
  autoDetectWhisperBinary: (): Promise<AsrRuntimeSetupResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR_AUTO_DETECT_WHISPER_BINARY),
  selectWhisperBinary: (): Promise<AsrRuntimeSetupResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR_SELECT_WHISPER_BINARY),
  downloadAsrModel: (modelId?: string, sourceId?: AsrModelSourceId): Promise<AsrModelDownloadResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR_DOWNLOAD_MODEL, modelId, sourceId),
  generateAsrSubtitle: (request: AsrSubtitleRequest): Promise<AsrSubtitleResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR_GENERATE_SUBTITLE, request),
  cancelAsrSubtitle: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.ASR_CANCEL_SUBTITLE),
  resolveAsrSubtitleCache: (request: AsrSubtitleRequest): Promise<AsrSubtitleResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR_RESOLVE_SUBTITLE_CACHE, request),
  resolveMediaSubtitleSidecar: (request: AsrSubtitleSidecarRequest): Promise<AsrSubtitleResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR_RESOLVE_MEDIA_SUBTITLE_SIDECAR, request),
  resolveAsrSubtitleCheckpoint: (request: AsrSubtitleCheckpointRequest): Promise<AsrSubtitleCheckpointResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR_RESOLVE_SUBTITLE_CHECKPOINT, request),
  resolveTranslatedAsrSubtitleCache: (request: AsrSubtitleTranslationRequest): Promise<AsrSubtitleTranslationResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR_RESOLVE_TRANSLATED_SUBTITLE_CACHE, request),
  exportAsrSubtitleSrt: (request: AsrSubtitleExportRequest): Promise<AsrSubtitleExportResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR_EXPORT_SUBTITLE_SRT, request),
  translateAsrSubtitle: (request: AsrSubtitleTranslationRequest): Promise<AsrSubtitleTranslationResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR_TRANSLATE_SUBTITLE, request),
  cancelAsrTranslation: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.ASR_CANCEL_TRANSLATION),
  summarizeAsrSubtitle: (request: AsrSubtitleSummaryRequest): Promise<AsrSubtitleSummaryResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR_SUMMARIZE_SUBTITLE, request),
  cancelAsrSummary: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.ASR_CANCEL_SUMMARY),
  resolveAsrSubtitleSummaryCache: (request: AsrSubtitleSummaryRequest): Promise<AsrSubtitleSummaryResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR_RESOLVE_SUBTITLE_SUMMARY_CACHE, request),
  exportAsrSummary: (request: AsrSubtitleSummaryExportRequest): Promise<AsrSubtitleSummaryExportResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR_EXPORT_SUMMARY, request),
  testAsrTranslationService: (
    request: AsrTranslationServiceTestRequest
  ): Promise<AsrTranslationServiceTestResult> => ipcRenderer.invoke(IPC_CHANNELS.ASR_TEST_TRANSLATION_SERVICE, request),
  openAsrLogDirectory: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.ASR_OPEN_LOG_DIRECTORY),
  getRecentAsrLogs: (): Promise<AsrDiagnosticLogResult> => ipcRenderer.invoke(IPC_CHANNELS.ASR_GET_RECENT_LOGS),
  exportMediaClip: (request: MediaClipExportRequest): Promise<MediaClipExportResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MEDIA_EXPORT_CLIP, request),
  chooseTimelineExportPath: (request: MediaTimelineExportPathRequest): Promise<MediaTimelineExportPathResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MEDIA_CHOOSE_TIMELINE_EXPORT_PATH, request),
  exportMediaTimeline: (request: MediaTimelineExportRequest): Promise<MediaClipExportResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MEDIA_EXPORT_TIMELINE, request),
  exportEditingSubtitleFile: (request: EditingSubtitleFileExportRequest): Promise<EditingSubtitleFileExportResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MEDIA_EXPORT_EDITING_SUBTITLE, request),
  saveImage: (request: ImageSaveRequest): Promise<ImageSaveResult> => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_SAVE, request),
  convertHeicToJpeg: (filePath: string): Promise<{ success: boolean; dataUrl?: string; error?: string }> => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_CONVERT_HEIC, filePath),
  probeLivePhoto: (filePath: string): Promise<LivePhotoProbeResult | null> => ipcRenderer.invoke(IPC_CHANNELS.LIVE_PHOTO_PROBE, filePath),
  exportLivePhoto: (request: LivePhotoExportRequest): Promise<LivePhotoExportResult> => ipcRenderer.invoke(IPC_CHANNELS.LIVE_PHOTO_EXPORT, request),
  copyTextToClipboard: (request: ClipboardWriteTextRequest): Promise<ClipboardWriteTextResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_WRITE_TEXT, request),
  openExternalUrl: (url: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL_URL, url),
  openPath: (filePath: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.OPEN_PATH, filePath),
  showItemInFolder: (filePath: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.SHOW_ITEM_IN_FOLDER, filePath),
  getNativePlayerStatus: (): Promise<NativePlayerStatus> => ipcRenderer.invoke(IPC_CHANNELS.NATIVE_PLAYER_STATUS),
  getInitialMediaFiles: (): Promise<MediaFile[]> => ipcRenderer.invoke(IPC_CHANNELS.GET_INITIAL_MEDIA_FILES),
  getVisionStatus: (): Promise<VisionRuntimeStatus> => ipcRenderer.invoke(IPC_CHANNELS.VISION_STATUS),
  downloadVisionPack: (): Promise<VisionPackDownloadResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_PACK_DOWNLOAD),
  downloadVisionModel: (): Promise<VisionModelDownloadResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_MODEL_DOWNLOAD),
  getPersonMatteModelStatus: (): Promise<PersonMatteModelStatus> => ipcRenderer.invoke(IPC_CHANNELS.PERSON_MATTE_STATUS),
  downloadPersonMatteModel: (): Promise<PersonMatteModelDownloadResult> => ipcRenderer.invoke(IPC_CHANNELS.PERSON_MATTE_DOWNLOAD),
  buildPersonMatteTrack: (request: PersonMatteTrackRequest): Promise<PersonMatteTrackResult> => ipcRenderer.invoke(IPC_CHANNELS.PERSON_MATTE_TRACK, request),
  getSpeakerDiarizationStatus: (): Promise<SpeakerDiarizationModelStatus> => ipcRenderer.invoke(IPC_CHANNELS.SPEAKER_DIARIZATION_STATUS),
  getVisionObjectDetectionStatus: (): Promise<VisionObjectDetectionModelStatus> => ipcRenderer.invoke(IPC_CHANNELS.VISION_OBJECT_DETECTION_STATUS),
  runVisionObjectDetection: (request: VisionObjectDetectionRequest): Promise<VisionObjectDetectionResponse> => ipcRenderer.invoke(IPC_CHANNELS.VISION_OBJECT_DETECTION_RUN, request),
  runSpeakerDiarization: (request: SpeakerDiarizationRunRequest): Promise<SpeakerDiarizationRunResult> => ipcRenderer.invoke(IPC_CHANNELS.SPEAKER_DIARIZATION_RUN, request),
  clearSpeakerDiarizationEvidence: (mediaPath: string): Promise<SpeakerDiarizationEvidenceClearResult> => ipcRenderer.invoke(IPC_CHANNELS.SPEAKER_DIARIZATION_CLEAR_EVIDENCE, mediaPath),
  listSpeakerDiarizationEvidenceSources: (request: SpeakerDiarizationEvidenceSourceRequest = {}): Promise<SpeakerDiarizationEvidenceSource[]> => ipcRenderer.invoke(IPC_CHANNELS.SPEAKER_DIARIZATION_EVIDENCE_SOURCES, request),
  clearSpeakerDiarizationEvidenceBatch: (request: SpeakerDiarizationEvidenceBatchClearRequest): Promise<SpeakerDiarizationEvidenceBatchClearResult> => ipcRenderer.invoke(IPC_CHANNELS.SPEAKER_DIARIZATION_BATCH_CLEAR_EVIDENCE, request),
  getSpeakerDiarizationCatalog: (): Promise<SpeakerDiarizationCatalog> => ipcRenderer.invoke(IPC_CHANNELS.SPEAKER_DIARIZATION_CATALOG_GET),
  updateSpeakerDiarizationCatalog: (patch: SpeakerDiarizationCatalogPatch): Promise<SpeakerDiarizationCatalog> => ipcRenderer.invoke(IPC_CHANNELS.SPEAKER_DIARIZATION_CATALOG_UPDATE, patch),
  startVisionIndex: (request: VisionIndexRequest): Promise<VisionIndexProgress> => ipcRenderer.invoke(IPC_CHANNELS.VISION_INDEX_START, request),
  enqueueVisionIndex: (request: VisionIndexRequest): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.VISION_INDEX_AUTO_START, request),
  scanVisionDirectory: (request: VisionDirectoryScanRequest): Promise<VisionDirectoryScanResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SCAN_DIRECTORY_START, request),
  cancelVisionDirectoryScan: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SCAN_DIRECTORY_CANCEL),
  cancelVisionIndex: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.VISION_INDEX_CANCEL),
  listVisionIndexFailures: (): Promise<VisionIndexFailureRecord[]> => ipcRenderer.invoke(IPC_CHANNELS.VISION_INDEX_FAILURE_LIST),
  retryVisionIndexFailure: (request: VisionIndexFailureRetryRequest): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.VISION_INDEX_FAILURE_RETRY, request),
  retryVisionIndexFailures: (request: VisionIndexFailureRetryBatchRequest): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.VISION_INDEX_FAILURE_BATCH_RETRY, request),
  searchVisionText: (request: VisionSearchRequest): Promise<VisionSearchResult[]> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SEARCH_TEXT, request),
  searchVisionImage: (request: VisionSearchRequest): Promise<VisionSearchResult[]> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SEARCH_IMAGE, request),
  searchVisionSimilar: (request: VisionSimilarSearchRequest): Promise<VisionSearchResult[]> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SEARCH_SIMILAR, request),
  searchVisionPage: (request: VisionSearchPageRequest): Promise<VisionSearchResultPage> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SEARCH_PAGE, request),
  exportVisionSearchResultsFull: (request: VisionSearchFullExportRequest): Promise<VisionSearchResultsExportResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SEARCH_FULL_EXPORT, request),
  cancelVisionSearchResultsFullExport: (request: VisionSearchExportCancelRequest): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SEARCH_FULL_EXPORT_CANCEL, request),
  retryVisionSearchResultsFullExport: (request: VisionSearchExportRetryRequest): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SEARCH_FULL_EXPORT_RETRY, request),
  recreateVisionSearchResultsFullExport: (request: VisionSearchExportRetryRequest): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SEARCH_FULL_EXPORT_RECREATE, request),
  recreateVisionSearchResultsFullExports: (request: VisionSearchExportBatchRecreateRequest): Promise<VisionSearchExportBatchRecreateResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SEARCH_FULL_EXPORT_BATCH_RECREATE, request),
  exportVisionSearchResults: (request: VisionSearchResultsExportRequest): Promise<VisionSearchResultsExportResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SEARCH_RESULTS_EXPORT, request),
  listVisionEvidenceSources: (request: VisionEvidenceSourceRequest = {}): Promise<VisionEvidenceSource[]> => ipcRenderer.invoke(IPC_CHANNELS.VISION_EVIDENCE_SOURCES, request),
  auditVisionEvidenceSources: (request: VisionEvidenceAuditRequest = {}): Promise<VisionEvidenceAuditPage> => ipcRenderer.invoke(IPC_CHANNELS.VISION_EVIDENCE_AUDIT, request),
  clearVisionEvidenceBatch: (request: VisionEvidenceBatchClearRequest): Promise<VisionEvidenceBatchClearResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_EVIDENCE_BATCH_CLEAR, request),
  listVisionSavedSearches: (): Promise<VisionSavedSearch[]> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SAVED_SEARCH_LIST),
  saveVisionSavedSearch: (input: VisionSavedSearchInput): Promise<VisionSavedSearch> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SAVED_SEARCH_SAVE, input),
  deleteVisionSavedSearch: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SAVED_SEARCH_DELETE, id),
  exportVisionSavedSearches: (): Promise<VisionSavedSearchFileResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SAVED_SEARCH_EXPORT),
  importVisionSavedSearches: (): Promise<VisionSavedSearchFileResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_SAVED_SEARCH_IMPORT),
  getVisionEntityCatalog: (): Promise<VisionEntityCatalog> => ipcRenderer.invoke(IPC_CHANNELS.VISION_ENTITY_CATALOG_GET),
  createVisionEntityCatalog: (input: VisionEntityCatalogCreateInput): Promise<VisionEntityCatalog> => ipcRenderer.invoke(IPC_CHANNELS.VISION_ENTITY_CATALOG_CREATE, input),
  updateVisionEntityCatalog: (patch: VisionEntityCatalogPatch): Promise<VisionEntityCatalog> => ipcRenderer.invoke(IPC_CHANNELS.VISION_ENTITY_CATALOG_UPDATE, patch),
  updateVisionEntityCatalogBatch: (patch: VisionEntityCatalogBatchPatch): Promise<VisionEntityCatalog> => ipcRenderer.invoke(IPC_CHANNELS.VISION_ENTITY_CATALOG_BATCH_UPDATE, patch),
  listVisionSources: (request: VisionLibrarySourceRequest = {}): Promise<VisionLibrarySource[]> => ipcRenderer.invoke(IPC_CHANNELS.VISION_LIST_SOURCES, request),
  readVisionThumbnail: (thumbnailPath: string): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.VISION_READ_THUMBNAIL, thumbnailPath),
  listVisionClipCollections: (): Promise<VisionClipCollection[]> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_LIST),
  saveVisionClipCollection: (input: VisionClipCollectionInput): Promise<VisionClipCollection> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_SAVE, input),
  deleteVisionClipCollection: (collectionId: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_DELETE, collectionId),
  deleteVisionClipCollections: (request: VisionClipCollectionBatchDeleteRequest): Promise<VisionClipCollectionBatchDeleteResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_DELETE, request),
  renameVisionClipCollections: (request: VisionClipCollectionBatchRenameRequest): Promise<VisionClipCollectionBatchRenameResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_RENAME, request),
  updateVisionClipCollectionsTags: (request: VisionClipCollectionBatchTagsRequest): Promise<VisionClipCollectionBatchTagsResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_TAGS, request),
  updateVisionClipCollectionFlags: (request: VisionClipCollectionFlagUpdateRequest): Promise<VisionClipCollectionFlagUpdateResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_FLAGS_UPDATE, request),
  cleanupVisionClipCollectionTag: (request: VisionClipCollectionTagCleanupRequest): Promise<VisionClipCollectionTagCleanupResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_CLEANUP, request),
  renameVisionClipCollectionTag: (request: VisionClipCollectionTagRenameRequest): Promise<VisionClipCollectionTagRenameResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_RENAME, request),
  listVisionClipCollectionTagMetadata: (): Promise<VisionClipCollectionTagMetadata[]> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_METADATA_LIST),
  updateVisionClipCollectionTagMetadata: (request: VisionClipCollectionTagMetadataUpdateRequest): Promise<VisionClipCollectionTagMetadataUpdateResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_METADATA_UPDATE, request),
  exportVisionClipCollectionTagMetadata: (): Promise<VisionClipCollectionTagMetadataTransferResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_METADATA_EXPORT),
  importVisionClipCollectionTagMetadata: (): Promise<VisionClipCollectionTagMetadataImportPreviewResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_METADATA_IMPORT),
  applyVisionClipCollectionTagMetadata: (request: VisionClipCollectionTagMetadataImportApplyRequest): Promise<VisionClipCollectionTagMetadataTransferResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_METADATA_IMPORT_APPLY, request),
  getVisionClipCollectionTagOperationHistory: (): Promise<VisionClipCollectionTagOperationHistory | null> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY),
  getVisionClipCollectionTagOperationRedoHistory: (): Promise<VisionClipCollectionTagOperationHistory | null> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_OPERATION_REDO_HISTORY),
  undoVisionClipCollectionTagOperation: (): Promise<VisionClipCollectionTagUndoResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_OPERATION_UNDO),
  redoVisionClipCollectionTagOperation: (): Promise<VisionClipCollectionTagRedoResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_OPERATION_REDO),
  getVisionClipCollectionOperationHistory: (): Promise<VisionClipCollectionOperationHistory | null> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_OPERATION_HISTORY),
  getVisionClipCollectionOperationRedoHistory: (): Promise<VisionClipCollectionOperationHistory | null> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_OPERATION_REDO_HISTORY),
  undoVisionClipCollectionOperation: (): Promise<VisionClipCollectionOperationUndoResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_OPERATION_UNDO),
  redoVisionClipCollectionOperation: (): Promise<VisionClipCollectionOperationRedoResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_OPERATION_REDO),
  duplicateVisionClipCollection: (collectionId: string): Promise<VisionClipCollection | null> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_DUPLICATE, collectionId),
  duplicateVisionClipCollections: (request: VisionClipCollectionBatchDuplicateRequest): Promise<VisionClipCollectionBatchDuplicateResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_DUPLICATE, request),
  exportVisionClipCollection: (request: VisionClipCollectionExportRequest): Promise<VisionClipCollectionExportResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_EXPORT, request),
  exportVisionClipCollections: (request: VisionClipCollectionBatchExportRequest): Promise<VisionClipCollectionBatchExportResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_EXPORT, request),
  importVisionClipCollection: (): Promise<VisionClipCollectionImportResult> => ipcRenderer.invoke(IPC_CHANNELS.VISION_CLIP_COLLECTION_IMPORT),
  getMediaEvidenceCapabilities: (): Promise<MediaEvidenceCapabilities> => ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_TASK_CAPABILITIES),
  startMediaEvidenceTask: (request: MediaEvidenceTaskRequest): Promise<MediaEvidenceTask> => ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_TASK_START, request),
  cancelMediaEvidenceTask: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_TASK_CANCEL),
  saveMediaEvidenceDraft: (request: MediaEvidenceDraftSaveRequest): Promise<MediaEvidenceDraft> => ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_DRAFT_SAVE, request),
  listMediaEvidenceDrafts: (): Promise<MediaEvidenceDraft[]> => ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_DRAFT_LIST),
  deleteMediaEvidenceDraft: (draftId: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_DRAFT_DELETE, draftId),
  importMediaEvidenceDraft: (request: MediaEvidenceDraftImportRequest): Promise<MediaEvidenceDraftImportResult> => ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_DRAFT_IMPORT, request),
  listMediaImportInbox: (): Promise<MediaImportInboxItem[]> => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_IMPORT_INBOX_LIST),
  scanMediaImportInbox: (request: MediaImportInboxScanRequest): Promise<MediaImportInboxScanResponse> => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_IMPORT_INBOX_SCAN_START, request),
  cancelMediaImportInboxScan: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_IMPORT_INBOX_SCAN_CANCEL),
  transitionMediaImportInbox: (request: MediaImportInboxTransitionRequest): Promise<MediaImportInboxItem | null> => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_IMPORT_INBOX_TRANSITION, request),
  transitionMediaImportInboxBatch: (request: { itemIds: string[]; action: 'queue' | 'ignore' | 'retry' | 'clear' }): Promise<MediaImportInboxItem[] | null> => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_IMPORT_INBOX_BATCH_TRANSITION, request),
  updateMediaImportInboxMetadata: (request: MediaImportInboxMetadataUpdateRequest): Promise<MediaImportInboxItem | null> => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_IMPORT_INBOX_METADATA_UPDATE, request),
  startMediaImportInboxWatch: (request: MediaImportInboxWatchRequest): Promise<MediaImportInboxWatchStartResult> => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_IMPORT_INBOX_WATCH_START, request),
  stopMediaImportInboxWatch: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_IMPORT_INBOX_WATCH_STOP),
  onMediaImportInboxProgress: (callback: (progress: MediaImportInboxScanProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: MediaImportInboxScanProgress): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.MEDIA_IMPORT_INBOX_SCAN_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MEDIA_IMPORT_INBOX_SCAN_PROGRESS, listener)
  },
  onMediaImportInboxDirectoriesChanged: (callback: (event: MediaImportInboxDirectoriesChangedEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: MediaImportInboxDirectoriesChangedEvent): void => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.MEDIA_IMPORT_INBOX_DIRECTORIES_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MEDIA_IMPORT_INBOX_DIRECTORIES_CHANGED, listener)
  },
  onMediaImportInboxItemChanged: (callback: (item: MediaImportInboxItem) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, item: MediaImportInboxItem): void => callback(item)
    ipcRenderer.on(IPC_CHANNELS.MEDIA_IMPORT_INBOX_ITEM_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MEDIA_IMPORT_INBOX_ITEM_CHANGED, listener)
  },
  onMediaImportInboxPipelineProgress: (callback: (progress: MediaImportInboxPipelineProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: MediaImportInboxPipelineProgress): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.MEDIA_IMPORT_INBOX_PIPELINE_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MEDIA_IMPORT_INBOX_PIPELINE_PROGRESS, listener)
  },
  onTaskCenterEvent: (callback: (event: TaskCenterEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: TaskCenterEvent): void => callback(event)
    ipcRenderer.on(IPC_CHANNELS.TASK_CENTER_EVENT, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_CENTER_EVENT, listener)
  },
  getTaskCenterEvents: (): Promise<TaskCenterEvent[]> => ipcRenderer.invoke(IPC_CHANNELS.TASK_CENTER_LIST),
  clearTaskCenterFinished: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.TASK_CENTER_CLEAR_FINISHED),
  stopNativePlayer: (): Promise<NativePlaybackResult> => ipcRenderer.invoke(IPC_CHANNELS.STOP_NATIVE_PLAYER),
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  toggleMaximizeWindow: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
  closeWindow: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  getWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_STATE),
  onWindowMaximizedChanged: (callback: (isMaximized: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, isMaximized: boolean): void => callback(isMaximized)
    ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_STATE_CHANGED, listener)
  },
  onMediaFilesOpened: (callback: (files: MediaFile[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, files: MediaFile[]): void => callback(files)
    ipcRenderer.on(IPC_CHANNELS.MEDIA_FILES_OPENED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MEDIA_FILES_OPENED, listener)
  },
  onEditingCaptionFilesChanged: (callback: (event: EditingCaptionFilesChangedEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: EditingCaptionFilesChangedEvent): void => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.EDITING_CAPTION_FILES_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EDITING_CAPTION_FILES_CHANGED, listener)
  },
  onAppMenuOpenSettings: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(IPC_CHANNELS.APP_MENU_OPEN_SETTINGS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_MENU_OPEN_SETTINGS, listener)
  },
  onAppUpdateStateChanged: (callback: (state: AppUpdateState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, nextState: AppUpdateState): void => callback(nextState)
    ipcRenderer.on(IPC_CHANNELS.APP_UPDATE_STATE_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_UPDATE_STATE_CHANGED, listener)
  },
  onAsrModelDownloadProgress: (callback: (progress: AsrModelDownloadProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: AsrModelDownloadProgress): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.ASR_MODEL_DOWNLOAD_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ASR_MODEL_DOWNLOAD_PROGRESS, listener)
  },
  onAsrJobProgress: (callback: (progress: AsrJobProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: AsrJobProgress): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.ASR_JOB_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ASR_JOB_PROGRESS, listener)
  },
  onBatchSubtitleProgress: (callback: (job: BatchSubtitleJob) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, job: BatchSubtitleJob): void => callback(job)
    ipcRenderer.on(IPC_CHANNELS.BATCH_SUBTITLE_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BATCH_SUBTITLE_PROGRESS, listener)
  },
  onVisionIndexProgress: (callback: (progress: VisionIndexProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: VisionIndexProgress): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.VISION_INDEX_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.VISION_INDEX_PROGRESS, listener)
  },
  onVisionModelDownloadProgress: (callback: (progress: VisionModelDownloadProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: VisionModelDownloadProgress): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.VISION_MODEL_DOWNLOAD_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.VISION_MODEL_DOWNLOAD_PROGRESS, listener)
  },
  onVisionDirectoryScanProgress: (callback: (progress: VisionDirectoryScanProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: VisionDirectoryScanProgress): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.VISION_SCAN_DIRECTORY_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.VISION_SCAN_DIRECTORY_PROGRESS, listener)
  },
  onMediaEvidenceTaskProgress: (callback: (task: MediaEvidenceTask) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, task: MediaEvidenceTask): void => callback(task)
    ipcRenderer.on(IPC_CHANNELS.EVIDENCE_TASK_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVIDENCE_TASK_PROGRESS, listener)
  },
  onPersonMatteModelDownloadProgress: (callback: (progress: PersonMatteModelDownloadProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: PersonMatteModelDownloadProgress): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.PERSON_MATTE_DOWNLOAD_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PERSON_MATTE_DOWNLOAD_PROGRESS, listener)
  },
  onPersonMatteTrackProgress: (callback: (progress: PersonMatteTrackProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: PersonMatteTrackProgress): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.PERSON_MATTE_TRACK_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PERSON_MATTE_TRACK_PROGRESS, listener)
  },
  listDramaProjects: (): Promise<DramaProject[]> => ipcRenderer.invoke(IPC_CHANNELS.DRAMA_LIST_PROJECTS),
  createDramaProject: (input: DramaCreateProjectInput): Promise<DramaProject> => ipcRenderer.invoke(IPC_CHANNELS.DRAMA_CREATE_PROJECT, input),
  importDramaChapters: (projectId: string, chapters: DramaImportChapterInput[]): Promise<DramaProjectData['chapters']> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_IMPORT_CHAPTERS, projectId, chapters),
  importDramaText: (projectId: string, text: string): Promise<DramaProjectData['chapters']> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_IMPORT_TEXT, projectId, text),
  getDramaProjectData: (projectId: string): Promise<DramaProjectData> => ipcRenderer.invoke(IPC_CHANNELS.DRAMA_GET_PROJECT_DATA, projectId),
  generateDramaEvents: (projectId: string, force = false): Promise<DramaStageResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_GENERATE_EVENTS, projectId, force),
  generateDramaSkeleton: (projectId: string, force = false): Promise<{ result: DramaStageResult; skeleton: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_GENERATE_SKELETON, projectId, force),
  generateDramaAdaptation: (projectId: string, force = false): Promise<{ result: DramaStageResult; adaptationStrategy: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_GENERATE_ADAPTATION, projectId, force),
  generateDramaScript: (projectId: string, episodeIndex: number, force = false): Promise<{ result: DramaStageResult; script: DramaProjectData['scripts'][number] }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_GENERATE_SCRIPT, projectId, episodeIndex, force),
  generateDramaAssets: (projectId: string, force = false): Promise<DramaStageResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_GENERATE_ASSETS, projectId, force),
  createDramaAsset: (projectId: string, input: DramaAssetInput): Promise<DramaProjectData['assets'][number]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_CREATE_ASSET, projectId, input),
  updateDramaAsset: (projectId: string, assetId: string, patch: DramaAssetPatch): Promise<DramaProjectData['assets'][number]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_UPDATE_ASSET, projectId, assetId, patch),
  deleteDramaAsset: (projectId: string, assetId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_DELETE_ASSET, projectId, assetId),
  createDramaGenerationTask: (projectId: string, input: DramaGenerationTaskInput): Promise<DramaProjectData['generationTasks'][number]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_CREATE_GENERATION_TASK, projectId, input),
  claimDramaGenerationTask: (projectId: string, mediaType: DramaGenerationTaskInput['mediaType']): Promise<DramaProjectData['generationTasks'][number] | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_CLAIM_GENERATION_TASK, projectId, mediaType),
  updateDramaGenerationTask: (projectId: string, taskId: string, patch: DramaGenerationTaskPatch): Promise<DramaProjectData['generationTasks'][number]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_UPDATE_GENERATION_TASK, projectId, taskId, patch),
  cancelDramaGenerationTask: (projectId: string, taskId: string): Promise<DramaProjectData['generationTasks'][number]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_CANCEL_GENERATION_TASK, projectId, taskId),
  runDramaGenerationQueue: (projectId: string): Promise<DramaProjectData['generationTasks']> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_RUN_GENERATION_QUEUE, projectId),
  stopDramaGenerationQueue: (projectId: string): Promise<DramaProjectData['generationTasks']> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_STOP_GENERATION_QUEUE, projectId),
  saveDramaGraphTemplate: (templateId: string | null, input: DramaGraphTemplateInput): Promise<DramaProjectData['graphTemplates'][number]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_SAVE_GRAPH_TEMPLATE, templateId, input),
  deleteDramaGraphTemplate: (templateId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_DELETE_GRAPH_TEMPLATE, templateId),
  generateDramaStoryboard: (projectId: string, episodeIndex: number, force = false): Promise<{ result: DramaStageResult; storyboard: DramaProjectData['storyboards'] }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRAMA_GENERATE_STORYBOARD, projectId, episodeIndex, force),
  getDramaProviderSettings: (): Promise<DramaProviderSettings> => ipcRenderer.invoke(IPC_CHANNELS.DRAMA_GET_PROVIDER_SETTINGS),
  setDramaProviderSettings: (input: DramaProviderSettingsInput): Promise<DramaProviderSettings> => ipcRenderer.invoke(IPC_CHANNELS.DRAMA_SET_PROVIDER_SETTINGS, input),
  testDramaProvider: (): Promise<DramaProviderTestResult> => ipcRenderer.invoke(IPC_CHANNELS.DRAMA_TEST_PROVIDER),
  onDramaProgress: (callback: (progress: DramaProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: DramaProgress): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.DRAMA_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DRAMA_PROGRESS, listener)
  },
  onDramaGenerationProgress: (callback: (task: DramaProjectData['generationTasks'][number]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, task: DramaProjectData['generationTasks'][number]): void => callback(task)
    ipcRenderer.on(IPC_CHANNELS.DRAMA_GENERATION_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DRAMA_GENERATION_PROGRESS, listener)
  },
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('aiv', api)

export type AivApi = typeof api
