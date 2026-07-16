import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { AppSettings } from '../shared/app-settings'
import type {
  AsrJobProgress,
  AsrModelDownloadProgress,
  AsrModelDownloadResult,
  AsrModelSourceId,
  AsrRuntimeSetupResult,
  AsrRuntimeStatus,
  MediaClipExportRequest,
  MediaClipExportResult,
  AsrSubtitleExportRequest,
  AsrSubtitleExportResult,
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
  AsrSubtitleResult,
  BatchSubtitleJob,
  BatchSubtitleScanRequest,
  BatchSubtitleStartRequest,
  MediaFile,
  MediaProbeMetadata,
  NativePlaybackResult,
  NativePlayerStatus
} from '../shared/media-types'

const api = {
  openMediaFiles: (): Promise<MediaFile[]> => ipcRenderer.invoke(IPC_CHANNELS.OPEN_MEDIA_FILES),
  openMediaDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.OPEN_MEDIA_DIRECTORY),
  openFolderPicker: (request: { title: string; defaultPath?: string | null }): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_FOLDER_PICKER, request),
  createMediaFile: (filePath: string): Promise<MediaFile> => ipcRenderer.invoke(IPC_CHANNELS.CREATE_MEDIA_FILE, filePath),
  readFileContent: (filePath: string): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.READ_FILE_CONTENT, filePath),
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
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),
  getAppSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_SETTINGS),
  setAppSettings: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.APP_SET_SETTINGS, settings),
  checkAsrRuntime: (): Promise<AsrRuntimeStatus> => ipcRenderer.invoke(IPC_CHANNELS.ASR_HEALTH_CHECK),
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
  copyTextToClipboard: (request: ClipboardWriteTextRequest): Promise<ClipboardWriteTextResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_WRITE_TEXT, request),
  openPath: (filePath: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.OPEN_PATH, filePath),
  showItemInFolder: (filePath: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.SHOW_ITEM_IN_FOLDER, filePath),
  getNativePlayerStatus: (): Promise<NativePlayerStatus> => ipcRenderer.invoke(IPC_CHANNELS.NATIVE_PLAYER_STATUS),
  getInitialMediaFiles: (): Promise<MediaFile[]> => ipcRenderer.invoke(IPC_CHANNELS.GET_INITIAL_MEDIA_FILES),
  stopNativePlayer: (): Promise<NativePlaybackResult> => ipcRenderer.invoke(IPC_CHANNELS.STOP_NATIVE_PLAYER),
  onMediaFilesOpened: (callback: (files: MediaFile[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, files: MediaFile[]): void => callback(files)
    ipcRenderer.on(IPC_CHANNELS.MEDIA_FILES_OPENED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MEDIA_FILES_OPENED, listener)
  },
  onAppMenuOpenSettings: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(IPC_CHANNELS.APP_MENU_OPEN_SETTINGS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_MENU_OPEN_SETTINGS, listener)
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
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('aiv', api)

export type AivApi = typeof api
