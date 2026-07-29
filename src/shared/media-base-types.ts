import type { ClipExportMode } from './clip-export'
import type { EditingProjectFileOpenResult, EditingProjectFileSaveRequest, EditingProjectFileSaveResult } from './editing-types'

export type { EditingProjectFileOpenResult, EditingProjectFileSaveRequest, EditingProjectFileSaveResult }

export type MediaFile = { id: string; name: string; path: string; url: string; extension: string }
export type MediaProbeDetailScalar = string | number | boolean | null
export interface MediaProbeDetailObject { [key: string]: MediaProbeDetailValue }
export type MediaProbeDetailValue = MediaProbeDetailScalar | MediaProbeDetailObject | MediaProbeDetailValue[]
export type MediaProbeDetails = { format: MediaProbeDetailObject | null; streams: MediaProbeDetailObject[] }
export type MediaVideoMetadata = { codec: string | null; profile: string | null; width: number | null; height: number | null; frameRate: number | null; displayAspectRatio: string | null; bitRateKbps: number | null }
export type MediaAudioMetadata = { codec: string | null; profile: string | null; channelLayout: string | null; sampleRateHz: number | null; bitRateKbps: number | null }
export type MediaProbeMetadata = { fileSizeBytes: number; durationSeconds: number | null; overallBitrateKbps: number | null; video: MediaVideoMetadata | null; audio: MediaAudioMetadata | null; probeSource: 'ffprobe' | 'ffmpeg' | null; details: MediaProbeDetails | null }
export type PlaybackState = { isPlaying: boolean; currentTime: number; duration: number; volume: number; muted: boolean; playbackRate: number }
export type MediaClipExportRequest = { mediaPath: string; startSeconds: number; durationSeconds: number; mode: ClipExportMode; subtitlePath?: string; subtitleSrtPath?: string }
export type MediaClipExportResult = { success: boolean; message: string; videoPath?: string; videoUrl?: string; subtitleSrtPath?: string; subtitleSrtUrl?: string; canceled?: boolean }
export type MediaTimelineExportClip = { mediaPath: string; startSeconds: number; endSeconds: number; volume?: number; muted?: boolean }
export type MediaTimelineExportPathRequest = { mediaPath: string; clipCount: number; durationSeconds: number; mode: ClipExportMode; suggestedPath?: string }
export type MediaTimelineExportPathResult = { success: boolean; message: string; filePath?: string; canceled?: boolean }
export type MediaTimelineExportRequest = { mediaPath: string; clips: MediaTimelineExportClip[]; mode: ClipExportMode; subtitlePath?: string; subtitleSrtPath?: string; subtitleText?: string; targetWidth?: number; targetHeight?: number; outputVideoPath?: string }
export type ClipboardWriteTextRequest = { text: string }
export type ClipboardWriteTextResult = { success: boolean; message: string }
export type ImageSaveRequest = { dataUrl: string; fileName: string; extension: string; outputDirectoryPath?: string; overwriteOriginal?: boolean; originalPath?: string }
export type ImageSaveResult = { success: boolean; filePath?: string; canceled?: boolean; message: string }
export type NativePlayerStatus = { available: boolean; backend: 'mpv'; binaryPath: string | null; version: string | null; message: string }
export type NativePlaybackResult = { success: boolean; message: string; pid?: number }
export type TranscriptSegment = { startSeconds: number; endSeconds: number; text: string }
