import type { ClipExportMode } from './clip-export'
import type { EditingClipFilter, EditingClipTransition, EditingClipTreatment, EditingFrameId, EditingGraphic, EditingGraphicMotion, EditingOverlayTrackKind, EditingPersonMatte, EditingProjectFileOpenResult, EditingProjectFileSaveRequest, EditingProjectFileSaveResult, EditingTreatmentAnchor, EditingVideoBlockMotion, EditingVideoBlockPosition } from './editing-types'
import type { SubtitleRenderSettings } from './subtitle-presets'
import type { SubtitleWord } from './subtitle-timing'

export type { EditingProjectFileOpenResult, EditingProjectFileSaveRequest, EditingProjectFileSaveResult }

export type MediaFile = { id: string; name: string; path: string; url: string; extension: string; fingerprint?: string }
export type MediaProbeDetailScalar = string | number | boolean | null
export interface MediaProbeDetailObject { [key: string]: MediaProbeDetailValue }
export type MediaProbeDetailValue = MediaProbeDetailScalar | MediaProbeDetailObject | MediaProbeDetailValue[]
export type MediaChapter = { id: string; startSeconds: number; endSeconds: number; title: string }
export type MediaProbeDetails = { format: MediaProbeDetailObject | null; streams: MediaProbeDetailObject[]; chapters: MediaProbeDetailObject[] }
export type MediaVideoMetadata = { codec: string | null; profile: string | null; width: number | null; height: number | null; frameRate: number | null; displayAspectRatio: string | null; bitRateKbps: number | null }
export type MediaAudioMetadata = { codec: string | null; profile: string | null; channelLayout: string | null; sampleRateHz: number | null; bitRateKbps: number | null }
export type MediaProbeMetadata = { fileSizeBytes: number; durationSeconds: number | null; overallBitrateKbps: number | null; video: MediaVideoMetadata | null; audio: MediaAudioMetadata | null; chapters: MediaChapter[]; probeSource: 'ffprobe' | 'ffmpeg' | null; details: MediaProbeDetails | null }
export type MediaFfmpegCapabilities = { available: boolean; subtitleBurnIn: boolean; subtitleFilter: 'subtitles' | 'ass' | null }
export type MediaFilmstripRequest = { mediaPath: string; timestampsSeconds: number[]; width?: number; quality?: number; useCache?: boolean }
export type MediaFilmstripFrame = { sourceSeconds: number; dataUrl: string }
export type MediaFilmstripResult = { frames: MediaFilmstripFrame[]; cacheHit: boolean; generatedFrameCount: number; cacheKey: string | null }
export type MediaSceneDetectionRequest = { mediaPath: string; threshold?: number; minSceneDurationSeconds?: number }
export type MediaSceneCut = { timestampSeconds: number }
export type MediaSceneDetectionResult = { success: boolean; message: string; cuts: MediaSceneCut[] }
export type MediaSilenceDetectionRequest = { mediaPath: string; durationSeconds?: number; noiseDb?: number; minSilenceDurationSeconds?: number; paddingSeconds?: number }
export type MediaSilenceInterval = { startSeconds: number; endSeconds: number }
export type MediaSilenceDetectionResult = { success: boolean; message: string; intervals: MediaSilenceInterval[] }
export type MediaStructureSegmentKind = 'intro' | 'outro' | 'black'
export type MediaStructureSegment = { id: string; kind: MediaStructureSegmentKind; startSeconds: number; endSeconds: number; confidence: number }
export type MediaStructureAnalysisRequest = { mediaPath: string; durationSeconds?: number; minBlackDurationSeconds?: number; pixelThreshold?: number }
export type MediaStructureAnalysisResult = { success: boolean; message: string; cacheHit: boolean; cacheKey: string | null; segments: MediaStructureSegment[] }
export type PlaybackState = { isPlaying: boolean; currentTime: number; duration: number; volume: number; muted: boolean; playbackRate: number }
export type MediaClipExportRequest = { mediaPath: string; startSeconds: number; durationSeconds: number; mode: ClipExportMode; subtitlePath?: string; subtitleSrtPath?: string; subtitleRender?: SubtitleRenderSettings }
export type MediaClipExportResult = { success: boolean; message: string; videoPath?: string; videoUrl?: string; subtitleSrtPath?: string; subtitleSrtUrl?: string; canceled?: boolean }
export type MediaTimelineExportClip = { mediaPath: string; startSeconds: number; endSeconds: number; volume?: number; muted?: boolean; treatment?: EditingClipTreatment; treatmentScale?: number; treatmentAnchor?: EditingTreatmentAnchor; treatmentSize?: number; filter?: EditingClipFilter; personMatte?: EditingPersonMatte; personMatteSourceFingerprint?: string; transitionIn?: EditingClipTransition; enterMotion?: EditingGraphicMotion; exitMotion?: EditingGraphicMotion; motionDurationSeconds?: number }
export type MediaTimelineExportVideoBlock = { mediaPath: string; sourceStartSeconds: number; sourceEndSeconds: number; startSeconds: number; durationSeconds: number; position: EditingVideoBlockPosition; sizePercent?: number; borderRadius?: number; borderWidth?: number; enterMotion?: EditingVideoBlockMotion; exitMotion?: EditingVideoBlockMotion; motionDurationSeconds?: number }
export type MediaTimelineExportPathRequest = { mediaPath: string; clipCount: number; durationSeconds: number; mode: ClipExportMode; suggestedPath?: string }
export type MediaTimelineExportPathResult = { success: boolean; message: string; filePath?: string; canceled?: boolean }
export type MediaTimelineExportRequest = { mediaPath: string; clips: MediaTimelineExportClip[]; graphics?: EditingGraphic[]; videoBlocks?: MediaTimelineExportVideoBlock[]; frameId?: EditingFrameId; overlayTrackOrder?: EditingOverlayTrackKind[]; mode: ClipExportMode; subtitlePath?: string; subtitleSrtPath?: string; subtitleText?: string; subtitleAssText?: string; subtitleRender?: SubtitleRenderSettings; targetWidth?: number; targetHeight?: number; fitMode?: 'contain' | 'cover'; outputVideoPath?: string }
export type ClipboardWriteTextRequest = { text: string }
export type ClipboardWriteTextResult = { success: boolean; message: string }
export type ImageSaveRequest = { dataUrl: string; fileName: string; extension: string; outputDirectoryPath?: string; overwriteOriginal?: boolean; originalPath?: string }
export type ImageSaveResult = { success: boolean; filePath?: string; canceled?: boolean; message: string }
export type NativePlayerStatus = { available: boolean; backend: 'mpv'; binaryPath: string | null; version: string | null; message: string }
export type NativePlaybackResult = { success: boolean; message: string; pid?: number }
export type TranscriptSegment = { startSeconds: number; endSeconds: number; text: string; words?: SubtitleWord[] }
