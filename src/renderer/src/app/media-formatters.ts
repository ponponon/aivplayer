import { formatTime } from '../lib/time'

const MEDIA_CODEC_LABELS: Record<string, string> = {
  aac: 'AAC', av1: 'AV1', avc1: 'H.264', flac: 'FLAC', h264: 'H.264', h265: 'HEVC', hevc: 'HEVC',
  mp3: 'MP3', mpeg4: 'MPEG-4', opus: 'Opus', prores: 'ProRes', vorbis: 'Vorbis', vp9: 'VP9'
}

function getGreatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b !== 0) [a, b] = [b, a % b]
  return a || 1
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '--'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const sizeInMb = bytes / (1024 * 1024)
  return sizeInMb >= 10 ? `${sizeInMb.toFixed(1)} MB` : `${sizeInMb.toFixed(2)} MB`
}

export function formatBitrate(kbps: number | null | undefined): string {
  return kbps == null || !Number.isFinite(kbps) || kbps < 0 ? '--' : `${Math.round(kbps)} kb/s`
}

export function formatFrameRate(frameRate: number | null | undefined): string {
  if (frameRate == null || !Number.isFinite(frameRate) || frameRate <= 0) return '--'
  const rounded = Math.round(frameRate * 100) / 100
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)} FPS`
}

export function formatResolution(width: number | null | undefined, height: number | null | undefined): string {
  return width == null || height == null || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
    ? '--'
    : `${Math.round(width)} × ${Math.round(height)}`
}

export function formatAspectRatio(width: number | null | undefined, height: number | null | undefined, displayAspectRatio: string | null | undefined): string {
  if (displayAspectRatio) return displayAspectRatio
  if (width == null || height == null || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '--'
  const divisor = getGreatestCommonDivisor(Math.round(width), Math.round(height))
  return `${Math.round(width) / divisor}:${Math.round(height) / divisor}`
}

export function formatCodecLabel(codec: string | null | undefined, profile: string | null | undefined): string {
  if (!codec) return '--'
  const label = MEDIA_CODEC_LABELS[codec.toLowerCase()] ?? codec.replace(/_/g, ' ').toUpperCase()
  return profile ? `${label} / ${profile}` : label
}

export function formatChannelLayout(channelLayout: string | null | undefined): string {
  return channelLayout ? channelLayout.replace(/^([a-z])/, (_, firstLetter: string) => firstLetter.toUpperCase()) : '--'
}

export function formatSampleRate(sampleRateHz: number | null | undefined): string {
  if (sampleRateHz == null || !Number.isFinite(sampleRateHz) || sampleRateHz <= 0) return '--'
  if (sampleRateHz >= 1000) {
    const kilohertz = sampleRateHz / 1000
    return `${Number.isInteger(kilohertz) ? kilohertz.toFixed(0) : kilohertz.toFixed(1)} kHz`
  }
  return `${Math.round(sampleRateHz)} Hz`
}

export function formatMediaDuration(seconds: number | null | undefined): string {
  return seconds == null || !Number.isFinite(seconds) || seconds <= 0 ? '--' : formatTime(seconds)
}
