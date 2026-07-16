import type { SubtitleTargetLanguageId } from './app-settings'
import type { AsrErrorDetails } from './asr-types'
import type { MediaFile } from './media-base-types'

export type BatchSubtitleItemStatus = 'queued' | 'asr' | 'translating' | 'retrying' | 'completed' | 'failed' | 'cancelled'
export type BatchSubtitleJobStatus = 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
export type BatchSubtitleItem = { id: string; file: MediaFile; status: BatchSubtitleItemStatus; percent: number | null; message: string; error?: string; errorDetails?: AsrErrorDetails; attempts: number; cacheHit?: boolean; asrElapsedMs?: number; translationElapsedMs?: number; subtitlePath?: string; translatedSubtitlePath?: string; elapsedMs?: number; startedAt?: number; completedAt?: number }
export type BatchSubtitleSummary = { total: number; queued: number; processing: number; completed: number; failed: number; cancelled: number }
export type BatchSubtitleJob = { id: string; rootPath: string; targetLanguage: SubtitleTargetLanguageId; onlyMissing: boolean; maxConcurrent: number; maxRetries: number; modelId?: string; sourceLanguage?: string; status: BatchSubtitleJobStatus; pauseRequested: boolean; currentItemId: string | null; message: string; items: BatchSubtitleItem[]; summary: BatchSubtitleSummary; startedAt: number; completedAt?: number; elapsedMs?: number }
export type BatchSubtitleScanRequest = { directoryPath: string; recursive?: boolean }
export type BatchSubtitleStartRequest = { rootPath: string; files: MediaFile[]; targetLanguage: SubtitleTargetLanguageId; onlyMissing?: boolean; maxConcurrent?: number; maxRetries?: number; modelId?: string; sourceLanguage?: string }
