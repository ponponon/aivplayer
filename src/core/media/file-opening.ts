import { existsSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import type { MediaFile } from '../../shared/media-types'

export const VIDEO_EXTENSIONS = [
  'mp4',
  'm4v',
  'mov',
  'webm',
  'ogv',
  'mkv',
  'avi',
  'flv',
  'wmv',
  'ts',
  'm2ts',
  'mts',
  'mpg',
  'mpeg',
  'mpe',
  'm1v',
  'm2v',
  'm2p',
  'm2t',
  'mpegts',
  'mpv',
  '3gp',
  '3g2',
  '3gpp',
  '3gpp2',
  'vob',
  'asf',
  'mxf',
  'divx',
  'rm',
  'rmvb',
  'f4v',
  'ogm',
  'ismv',
  'nut',
  'dv',
  'dif',
  'mjpeg',
  'mjpg',
  'bik',
  'svi',
  'tod',
  'mod',
  'y4m',
  'h264',
  '264',
  'h265',
  '265',
  'hevc',
  'avc',
  'vc1',
  'ivf',
  'amv'
] as const

const VIDEO_EXTENSION_SET = new Set<string>(VIDEO_EXTENSIONS)

export function isVideoFilePath(filePath: string): boolean {
  return VIDEO_EXTENSION_SET.has(extname(filePath).replace('.', '').toLowerCase())
}

export function isMediaFileAvailable(filePath: string): boolean {
  if (!isVideoFilePath(filePath)) return false

  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

export function extractVideoFilePaths(
  values: readonly string[],
  options: {
    resolvePath?: (value: string) => string
    fileExists?: (filePath: string) => boolean
  } = {}
): string[] {
  const resolvePath = options.resolvePath ?? resolve
  const fileExists = options.fileExists ?? existsSync
  const paths = values
    .filter((value) => !value.startsWith('-'))
    .map((value) => resolvePath(value))
    .filter((filePath) => fileExists(filePath))
    .filter(isVideoFilePath)

  return Array.from(new Set(paths))
}

export function mergeMediaFiles(current: readonly MediaFile[], incoming: readonly MediaFile[]): MediaFile[] {
  const seen = new Set(current.map((file) => file.path))
  return [...current, ...incoming.filter((file) => {
    if (seen.has(file.path)) return false
    seen.add(file.path)
    return true
  })]
}
