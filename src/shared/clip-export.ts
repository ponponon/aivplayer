import type { EditingSubtitleExportFormat, EditingSubtitleExportKind } from './editing-subtitle-export'

export const CLIP_EXPORT_LENGTH_SECONDS = [15, 30, 60] as const
export const MIN_CLIP_DURATION_SECONDS = 0.1

export type ClipExportLengthSeconds = (typeof CLIP_EXPORT_LENGTH_SECONDS)[number]
export type ClipExportMode = 'video' | 'external-subtitle' | 'burn-subtitle'
/** Timeline-only subtitle track modes; basic clip export keeps the legacy modes. */
export type TimelineExportMode = ClipExportMode | 'translation-subtitle' | 'subtitle-file' | 'translation-file' | 'subtitle-vtt' | 'translation-vtt' | 'subtitle-ass' | 'translation-ass'

export function isClipExportLengthSeconds(value: unknown): value is ClipExportLengthSeconds {
  return value === 15 || value === 30 || value === 60
}

export function isClipExportMode(value: unknown): value is ClipExportMode {
  return value === 'video' || value === 'external-subtitle' || value === 'burn-subtitle'
}

export function isTimelineExportMode(value: unknown): value is TimelineExportMode {
  return isClipExportMode(value) || value === 'translation-subtitle' || value === 'subtitle-file' || value === 'translation-file'
}

export type TimelineSubtitleFileMode = 'subtitle-file' | 'translation-file' | 'subtitle-vtt' | 'translation-vtt' | 'subtitle-ass' | 'translation-ass'

export function isTimelineSubtitleFileMode(value: TimelineExportMode): value is TimelineSubtitleFileMode {
  return value === 'subtitle-file' || value === 'translation-file' || value === 'subtitle-vtt' || value === 'translation-vtt' || value === 'subtitle-ass' || value === 'translation-ass'
}

export function getTimelineSubtitleFileKind(mode: TimelineSubtitleFileMode): EditingSubtitleExportKind {
  return mode.startsWith('translation-') ? 'translation' : 'source'
}

export function getTimelineSubtitleFileFormat(mode: TimelineSubtitleFileMode): EditingSubtitleExportFormat {
  return mode.endsWith('-vtt') ? 'vtt' : mode.endsWith('-ass') ? 'ass' : 'srt'
}
