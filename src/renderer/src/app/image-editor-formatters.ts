import type { LivePhotoProbeResult } from '../../../shared/live-photo-types'
import type { ImageFormat, ImageSettings } from './image-editor-types'

export function formatImageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`
}

export function getOutputMime(format: ImageFormat, sourceMime: string): string {
  if (format === 'original' && ['image/jpeg', 'image/png', 'image/webp'].includes(sourceMime)) return sourceMime
  if (format === 'jpeg') return 'image/jpeg'
  if (format === 'webp') return 'image/webp'
  return 'image/png'
}

export function getOutputExtension(format: ImageFormat, sourceName: string): string {
  if (format === 'original') {
    const extension = sourceName.split('.').pop()?.toLowerCase()
    if (extension && ['jpg', 'jpeg', 'png', 'webp'].includes(extension)) return extension === 'jpeg' ? 'jpg' : extension
  }
  return format === 'jpeg' || format === 'original' ? 'jpg' : format
}

export function createInitialImageSettings(width: number, height: number, sourceName: string, sourceMime: string, livePhoto: LivePhotoProbeResult | null = null): ImageSettings {
  const sourceExtension = sourceName.split('.').pop()?.toLowerCase()
  const format = sourceMime === 'image/png' || sourceExtension === 'png' ? 'png' : sourceMime === 'image/webp' || sourceExtension === 'webp' ? 'webp' : 'jpeg'
  return {
    width,
    height,
    lockAspectRatio: true,
    format,
    quality: 0.86,
    useTargetSize: false,
    targetSizeBytes: Math.max(50 * 1024, Math.round(width * height * 0.08)),
    rotation: 0,
    flipX: false,
    flipY: false,
    livePhoto: livePhoto ? {
      startSeconds: 0,
      durationSeconds: Math.max(0.1, livePhoto.durationSeconds),
      cropScale: 1,
      mute: false,
      mosaic: { enabled: false, x: 0.325, y: 0.35, width: 0.35, height: 0.3 },
      coverTimestampSeconds: null
    } : null
  }
}

export function getReductionPercent(originalBytes: number, outputBytes: number): number {
  if (originalBytes <= 0 || outputBytes >= originalBytes) return 0
  return Math.max(0, Math.round((1 - outputBytes / originalBytes) * 100))
}
