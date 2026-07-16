import type { ClipExportLengthSeconds, ClipExportMode } from './clip-export'

export type MediaFile = { id: string; name: string; path: string; url: string; extension: string }
export type MediaProbeDetailScalar = string | number | boolean | null
export interface MediaProbeDetailObject { [key: string]: MediaProbeDetailValue }
export type MediaProbeDetailValue = MediaProbeDetailScalar | MediaProbeDetailObject | MediaProbeDetailValue[]
export type MediaProbeDetails = { format: MediaProbeDetailObject | null; streams: MediaProbeDetailObject[] }
export type MediaVideoMetadata = { codec: string | null; profile: string | null; width: number | null; height: number | null; frameRate: number | null; displayAspectRatio: string | null; bitRateKbps: number | null }
export type MediaAudioMetadata = { codec: string | null; profile: string | null; channelLayout: string | null; sampleRateHz: number | null; bitRateKbps: number | null }
export type MediaProbeMetadata = { fileSizeBytes: number; durationSeconds: number | null; overallBitrateKbps: number | null; video: MediaVideoMetadata | null; audio: MediaAudioMetadata | null; probeSource: 'ffprobe' | 'ffmpeg' | null; details: MediaProbeDetails | null }
export type PlaybackState = { isPlaying: boolean; currentTime: number; duration: number; volume: number; muted: boolean; playbackRate: number }
export type MediaClipExportRequest = { mediaPath: string; startSeconds: number; durationSeconds: ClipExportLengthSeconds; mode: ClipExportMode; subtitlePath?: string; subtitleSrtPath?: string }
export type MediaClipExportResult = { success: boolean; message: string; videoPath?: string; videoUrl?: string; subtitleSrtPath?: string; subtitleSrtUrl?: string; canceled?: boolean }
export type ClipboardWriteTextRequest = { text: string }
export type ClipboardWriteTextResult = { success: boolean; message: string }
export type NativePlayerStatus = { available: boolean; backend: 'mpv'; binaryPath: string | null; version: string | null; message: string }
export type NativePlaybackResult = { success: boolean; message: string; pid?: number }
export type TranscriptSegment = { startSeconds: number; endSeconds: number; text: string }
