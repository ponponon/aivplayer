export const CLIP_EXPORT_LENGTH_SECONDS = [15, 30, 60] as const
export const MIN_CLIP_DURATION_SECONDS = 0.1

export type ClipExportLengthSeconds = (typeof CLIP_EXPORT_LENGTH_SECONDS)[number]
export type ClipExportMode = 'video' | 'external-subtitle' | 'burn-subtitle'
/** Timeline-only subtitle track modes; basic clip export keeps the legacy modes. */
export type TimelineExportMode = ClipExportMode | 'translation-subtitle' | 'subtitle-file' | 'translation-file'

export function isClipExportLengthSeconds(value: unknown): value is ClipExportLengthSeconds {
  return value === 15 || value === 30 || value === 60
}

export function isClipExportMode(value: unknown): value is ClipExportMode {
  return value === 'video' || value === 'external-subtitle' || value === 'burn-subtitle'
}

export function isTimelineExportMode(value: unknown): value is TimelineExportMode {
  return isClipExportMode(value) || value === 'translation-subtitle' || value === 'subtitle-file' || value === 'translation-file'
}

export function isTimelineSubtitleFileMode(value: TimelineExportMode): value is 'subtitle-file' | 'translation-file' {
  return value === 'subtitle-file' || value === 'translation-file'
}
