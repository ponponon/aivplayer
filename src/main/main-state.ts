import type { BrowserWindow } from 'electron'
import { createDefaultAppSettings, type AppSettings } from '../shared/app-settings'
import type { MediaFile } from '../shared/media-types'
import { BatchSubtitleManager } from './ai/batch-subtitle-manager'
import { createWhisperCppRuntime } from './ai/whisper-cpp-runtime'
import { VisionLibrary } from './ai/vision-library'

export const mainState: {
  mainWindow: BrowserWindow | null
  asrRuntime: ReturnType<typeof createWhisperCppRuntime> | null
  initialMediaFiles: MediaFile[] | null
  pendingMediaPaths: string[]
  currentAppSettings: AppSettings
  asrAbortControllers: Map<number, AbortController>
  translationAbortControllers: Map<number, AbortController>
  summaryAbortControllers: Map<number, AbortController>
  visionLibrary: VisionLibrary | null
  visionAbortControllers: Map<number, AbortController>
  batchSubtitleManager: BatchSubtitleManager | null
} = {
  mainWindow: null,
  asrRuntime: null,
  initialMediaFiles: null,
  pendingMediaPaths: [],
  currentAppSettings: createDefaultAppSettings(),
  asrAbortControllers: new Map(),
  translationAbortControllers: new Map(),
  summaryAbortControllers: new Map(),
  visionLibrary: null,
  visionAbortControllers: new Map(),
  batchSubtitleManager: null
}
