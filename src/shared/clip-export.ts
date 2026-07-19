export const CLIP_EXPORT_LENGTH_SECONDS = [15, 30, 60] as const
export const MIN_CLIP_DURATION_SECONDS = 0.1

export type ClipExportLengthSeconds = (typeof CLIP_EXPORT_LENGTH_SECONDS)[number]
export type ClipExportMode = 'video' | 'external-subtitle' | 'burn-subtitle'

export function isClipExportLengthSeconds(value: unknown): value is ClipExportLengthSeconds {
  return value === 15 || value === 30 || value === 60
}

export function isClipExportMode(value: unknown): value is ClipExportMode {
  return value === 'video' || value === 'external-subtitle' || value === 'burn-subtitle'
}
