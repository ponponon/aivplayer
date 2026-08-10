import { isTimelineSubtitleFileMode, type TimelineExportMode } from './clip-export'

function lastPathSeparator(filePath: string): number {
  return Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
}

export function getTimelineExportPathDirectory(filePath: string): string {
  const separatorIndex = lastPathSeparator(filePath)
  return separatorIndex >= 0 ? filePath.slice(0, separatorIndex) : ''
}

export function getTimelineExportPathBaseName(filePath: string): string {
  const separatorIndex = lastPathSeparator(filePath)
  return separatorIndex >= 0 ? filePath.slice(separatorIndex + 1) : filePath
}

export function sanitizeTimelineExportStem(filePath: string): string {
  const baseName = getTimelineExportPathBaseName(filePath)
  const extensionIndex = baseName.lastIndexOf('.')
  const stem = (extensionIndex > 0 ? baseName.slice(0, extensionIndex) : baseName)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return stem || 'media'
}

export function timelineExportModeSuffix(mode: TimelineExportMode): string {
  return mode === 'external-subtitle' ? 'subs' : mode === 'translation-subtitle' || mode === 'translation-file' ? 'translation' : mode === 'subtitle-file' ? 'source' : mode === 'burn-subtitle' ? 'burn' : 'video'
}

export function buildTimelineExportDefaultFileName(mediaPath: string, clipCount: number, durationSeconds: number, mode: TimelineExportMode): string {
  const safeDuration = Math.max(0, Math.floor(durationSeconds))
  const extension = isTimelineSubtitleFileMode(mode) ? '.srt' : '.mp4'
  return `${sanitizeTimelineExportStem(mediaPath)}-timeline-${Math.max(0, clipCount)}clips-${safeDuration}s-${timelineExportModeSuffix(mode)}${extension}`
}

export function joinTimelineExportPath(directoryPath: string, fileName: string): string {
  if (!directoryPath) return fileName
  const separator = directoryPath.includes('\\') ? '\\' : '/'
  return `${directoryPath.replace(/[\\/]+$/, '')}${separator}${fileName}`
}

export function normalizeTimelineExportFileName(fileName: string, fallback: string, mode: TimelineExportMode = 'video'): string {
  const baseName = getTimelineExportPathBaseName(fileName.trim())
  const withoutExtension = baseName.replace(/\.[^.]+$/, '')
  const normalized = withoutExtension.replace(/[<>:"|?*\u0000-\u001F]+/g, '-').replace(/^-+|-+$/g, '').trim()
  const extension = isTimelineSubtitleFileMode(mode) ? '.srt' : '.mp4'
  const fallbackStem = fallback.replace(/\.[^.]+$/i, '')
  return `${normalized || fallbackStem || 'timeline'}${extension}`
}
