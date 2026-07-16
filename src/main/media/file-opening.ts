import { existsSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import type { MediaFile } from '../../shared/media-types'

export const VIDEO_EXTENSIONS = [
  'mp4',
  'm4v',
  'mov',
  'webm',
  'mkv',
  'avi',
  'flv',
  'wmv',
  'ts',
  'm2ts',
  'mpg',
  'mpeg'
] as const

const VIDEO_EXTENSION_SET = new Set<string>(VIDEO_EXTENSIONS)

export function isVideoFilePath(filePath: string): boolean {
  return VIDEO_EXTENSION_SET.has(extname(filePath).replace('.', '').toLowerCase())
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
