import { spawn } from 'node:child_process'
import { basename, dirname, extname, join, parse } from 'node:path'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { convertVttToSrt, writeSrt } from '../ai/subtitle-writer.ts'
import { getAppCopy } from '../../shared/i18n'
import type { AppLocale } from '../../shared/localization'
import type { ClipExportMode } from '../../shared/clip-export'
import type { TranscriptSegment } from '../../shared/media-types.ts'

const SRT_TIMESTAMP_PATTERN = /^(?:(\d+):)?(\d{2}):(\d{2}),(\d{3})$/
const SRT_TIMECODE_PATTERN =
  /^(?<start>(?:(?:\d+):)?\d{2}:\d{2},\d{3})\s*-->\s*(?<end>(?:(?:\d+):)?\d{2}:\d{2},\d{3})(?:\s+.*)?$/

type RunProcessResult = {
  code: number | null
  output: string
}

export type RunClipExportOptions = {
  ffmpegPath: string
  mediaPath: string
  outputVideoPath: string
  startSeconds: number
  durationSeconds: number
  mode: ClipExportMode
  subtitlePath?: string
  subtitleSrtPath?: string
  getLocale?: () => AppLocale
}

export type RunClipExportResult = {
  videoPath: string
  subtitleSrtPath?: string
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function sanitizeFileStem(filePath: string): string {
  const stem = basename(filePath, extname(filePath))
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return stem || 'media'
}

function formatClipExportTimeToken(seconds: number): string {
  const rounded = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const remainingSeconds = rounded % 60

  if (hours > 0) {
    return `${hours}h${pad(minutes)}m${pad(remainingSeconds)}s`
  }

  if (minutes > 0) {
    return `${minutes}m${pad(remainingSeconds)}s`
  }

  return `${remainingSeconds}s`
}

function getModeSuffix(mode: ClipExportMode): string {
  if (mode === 'external-subtitle') {
    return 'subs'
  }

  if (mode === 'burn-subtitle') {
    return 'burn'
  }

  return 'video'
}

function parseSrtTimestamp(timestamp: string): number {
  const match = timestamp.trim().match(SRT_TIMESTAMP_PATTERN)

  if (!match) {
    throw new Error(`无法解析 SRT 时间戳：${timestamp}`)
  }

  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const milliseconds = Number(match[4])

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

function parseSrt(text: string): TranscriptSegment[] {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const segments: TranscriptSegment[] = []
  let index = 0

  while (index < lines.length) {
    while (index < lines.length && (lines[index] ?? '').trim() === '') {
      index += 1
    }

    if (index >= lines.length) {
      break
    }

    if (/^\d+$/.test((lines[index] ?? '').trim()) && /-->/.test(lines[index + 1] ?? '')) {
      index += 1
    }

    const timeLine = (lines[index] ?? '').trim()
    const match = timeLine.match(SRT_TIMECODE_PATTERN)

    if (!match?.groups) {
      index += 1
      continue
    }

    index += 1
    const cueLines: string[] = []

    while (index < lines.length) {
      const cueLine = lines[index] ?? ''

      if (cueLine.trim() === '') {
        break
      }

      cueLines.push(cueLine)
      index += 1
    }

    segments.push({
      startSeconds: parseSrtTimestamp(match.groups.start ?? ''),
      endSeconds: parseSrtTimestamp(match.groups.end ?? ''),
      text: cueLines.join('\n')
    })
  }

  return segments
}

function trimSegmentsToClip(segments: TranscriptSegment[], startSeconds: number, durationSeconds: number): TranscriptSegment[] {
  const clipStart = Math.max(0, startSeconds)
  const clipEnd = Math.max(clipStart, clipStart + Math.max(0, durationSeconds))

  return segments.flatMap((segment) => {
    const overlapStart = Math.max(segment.startSeconds, clipStart)
    const overlapEnd = Math.min(segment.endSeconds, clipEnd)

    if (overlapEnd <= overlapStart) {
      return []
    }

    return [
      {
        startSeconds: overlapStart - clipStart,
        endSeconds: overlapEnd - clipStart,
        text: segment.text
      }
    ]
  })
}

function escapeFfmpegFilterPath(filePath: string): string {
  return filePath.replace(/([\\':,])/g, '\\$1')
}

function tailOutput(output: string): string {
  const normalized = output.trim()
  return normalized.length > 2000 ? normalized.slice(-2000) : normalized
}

async function runProcess(command: string, args: string[]): Promise<RunProcessResult> {
  return await new Promise<RunProcessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      resolve({
        code,
        output
      })
    })
  })
}

function buildClipExportFfmpegArgs(options: {
  mediaPath: string
  outputVideoPath: string
  startSeconds: number
  durationSeconds: number
  subtitleFilterPath?: string
}): string[] {
  const args = ['-y', '-i', options.mediaPath, '-ss', String(Math.max(0, options.startSeconds)), '-t', String(Math.max(0, options.durationSeconds))]

  if (options.subtitleFilterPath) {
    args.push('-vf', `subtitles='${escapeFfmpegFilterPath(options.subtitleFilterPath)}'`)
  }

  args.push(
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    options.outputVideoPath
  )

  return args
}

function resolveSubtitleSourceText(options: { subtitlePath?: string; subtitleSrtPath?: string }): Promise<string> | null {
  if (options.subtitleSrtPath) {
    return readFile(options.subtitleSrtPath, 'utf8')
  }

  if (options.subtitlePath) {
    return readFile(options.subtitlePath, 'utf8').then((text) => convertVttToSrt(text))
  }

  return null
}

export function buildClipExportDefaultVideoPath(
  mediaPath: string,
  startSeconds: number,
  durationSeconds: number,
  mode: ClipExportMode
): string {
  return join(
    dirname(mediaPath),
    `${sanitizeFileStem(mediaPath)}-${formatClipExportTimeToken(startSeconds)}-${Math.max(0, Math.floor(durationSeconds))}s-${getModeSuffix(mode)}.mp4`
  )
}

export function buildClipExportSubtitlePath(videoPath: string): string {
  const { dir, name } = parse(videoPath)
  return join(dir, `${name}.srt`)
}

export function trimSrtToClip(text: string, startSeconds: number, durationSeconds: number): string {
  return writeSrt(trimSegmentsToClip(parseSrt(text), startSeconds, durationSeconds))
}

export async function runClipExport(options: RunClipExportOptions): Promise<RunClipExportResult> {
  const copy = getAppCopy(options.getLocale?.())
  const safeStartSeconds = Math.max(0, options.startSeconds)
  const safeDurationSeconds = Math.max(1, options.durationSeconds)
  const shouldExportSubtitle = options.mode === 'external-subtitle' || options.mode === 'burn-subtitle'
  const subtitleSourceText = shouldExportSubtitle ? await resolveSubtitleSourceText(options) : null

  if (shouldExportSubtitle && !subtitleSourceText) {
    throw new Error(copy.runtime.clipExportSubtitleMissing)
  }

  const trimmedSubtitleText = subtitleSourceText ? trimSrtToClip(subtitleSourceText, safeStartSeconds, safeDurationSeconds) : null
  const tempDirectory = options.mode === 'burn-subtitle' ? await mkdtemp(join(tmpdir(), 'aivplayer-clip-')) : null
  const subtitleFilterPath = tempDirectory ? join(tempDirectory, 'clip.srt') : null

  try {
    await mkdir(dirname(options.outputVideoPath), { recursive: true })

    if (subtitleFilterPath && trimmedSubtitleText != null) {
      await writeFile(subtitleFilterPath, trimmedSubtitleText, 'utf8')
    }

    const result = await runProcess(
      options.ffmpegPath,
      buildClipExportFfmpegArgs({
        mediaPath: options.mediaPath,
        outputVideoPath: options.outputVideoPath,
        startSeconds: safeStartSeconds,
        durationSeconds: safeDurationSeconds,
        subtitleFilterPath: options.mode === 'burn-subtitle' ? subtitleFilterPath ?? undefined : undefined
      })
    )

    if (result.code !== 0) {
      throw new Error(`${copy.runtime.clipExportFailed}：${tailOutput(result.output)}`)
    }

    if (options.mode === 'external-subtitle' && trimmedSubtitleText != null) {
      const subtitleSrtPath = buildClipExportSubtitlePath(options.outputVideoPath)
      await writeFile(subtitleSrtPath, trimmedSubtitleText, 'utf8')

      return {
        videoPath: options.outputVideoPath,
        subtitleSrtPath
      }
    }

    return {
      videoPath: options.outputVideoPath
    }
  } finally {
    if (tempDirectory) {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  }
}
