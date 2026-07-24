import type { BrowserWindow } from 'electron'
import { createDefaultAppSettings, type AppSettings } from '../shared/app-settings'
import type { MediaFile } from '../shared/media-types'
import { BatchSubtitleManager } from '../core/ai/batch-subtitle-manager'
import { createWhisperCppRuntime } from '../core/ai/whisper-cpp-runtime'
import { VisionLibrary } from '../core/ai/vision-library'
import { VisionIndexQueue } from '../core/ai/vision-index-queue'
import { DramaStore } from '../core/drama/drama-store'

export const desktopState: {
  mainWindow: BrowserWindow | null
  asrRuntime: ReturnType<typeof createWhisperCppRuntime> | null
  initialMediaFiles: MediaFile[] | null
  pendingMediaPaths: string[]
  currentAppSettings: AppSettings
  asrAbortControllers: Map<number, AbortController>
  translationAbortControllers: Map<number, AbortController>
  summaryAbortControllers: Map<number, AbortController>
  visionLibrary: VisionLibrary | null
  visionIndexQueue: VisionIndexQueue | null
  visionScanAbortControllers: Map<number, AbortController>
  visionAbortControllers: Map<number, AbortController>
  batchSubtitleManager: BatchSubtitleManager | null
  dramaStore: DramaStore | null
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
  visionIndexQueue: null,
  visionScanAbortControllers: new Map(),
  visionAbortControllers: new Map(),
  batchSubtitleManager: null,
  dramaStore: null
}
