import { spawn } from 'node:child_process'
import { basename, dirname, extname, join } from 'node:path'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { convertVttToSrt } from '../ai/subtitle-writer.ts'
import { getAppCopy } from '../../shared/i18n'
import type { AppLocale } from '../../shared/localization'
import { MIN_CLIP_DURATION_SECONDS, type ClipExportMode } from '../../shared/clip-export'
import { buildClipExportSubtitlePath, remapSrtToTimeline } from './clip-export'
import type { MediaTimelineExportClip } from '../../shared/media-types'
import { getEditingClipVolume, isEditingClipMuted } from '../editing/audio-operations'

export type RunTimelineExportOptions = {
  ffmpegPath: string
  mediaPath: string
  clips: readonly TimelineExportClip[]
  outputVideoPath: string
  mode: ClipExportMode
  subtitlePath?: string
  subtitleSrtPath?: string
  /** Already-remapped SRT text in edited timeline time. */
  subtitleText?: string
  outputFormat?: TimelineExportFormat
  getLocale?: () => AppLocale
}

export type RunTimelineExportResult = {
  videoPath: string
  subtitleSrtPath?: string
}

type ProcessResult = { code: number | null; output: string }
type TimelineExportClip = MediaTimelineExportClip & { hasAudio?: boolean }
type NormalizedClip = TimelineExportClip & { durationSeconds: number }

export type TimelineExportFormat = {
  width?: number
  height?: number
  frameRate?: number
  audioSampleRate?: number
  audioChannels?: number
}

function sanitizeFileStem(filePath: string): string {
  const stem = basename(filePath, extname(filePath)).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return stem || 'media'
}

function modeSuffix(mode: ClipExportMode): string {
  return mode === 'external-subtitle' ? 'subs' : mode === 'burn-subtitle' ? 'burn' : 'video'
}

function tailOutput(output: string): string {
  const normalized = output.trim()
  return normalized.length > 2000 ? normalized.slice(-2000) : normalized
}

function escapeConcatPath(filePath: string): string {
  return filePath.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")
}

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/([\\':,])/g, '\\$1')
}

async function runProcess(command: string, args: string[]): Promise<ProcessResult> {
  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, output }))
  })
}

function normalizeClips(clips: readonly TimelineExportClip[]): NormalizedClip[] {
  return clips.flatMap((clip) => {
    const startSeconds = Math.max(0, Number.isFinite(clip.startSeconds) ? clip.startSeconds : 0)
    const endSeconds = Math.max(startSeconds, Number.isFinite(clip.endSeconds) ? clip.endSeconds : startSeconds)
    const durationSeconds = endSeconds - startSeconds
    return durationSeconds >= MIN_CLIP_DURATION_SECONDS && clip.mediaPath.trim() ? [{ ...clip, startSeconds, endSeconds, durationSeconds }] : []
  })
}

export function buildTimelineExportDefaultVideoPath(mediaPath: string, clipCount: number, durationSeconds: number, mode: ClipExportMode): string {
  const safeDuration = Math.max(0, Math.floor(durationSeconds))
  return join(dirname(mediaPath), `${sanitizeFileStem(mediaPath)}-timeline-${Math.max(0, clipCount)}clips-${safeDuration}s-${modeSuffix(mode)}.mp4`)
}

function evenDimension(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value < 2) return null
  return Math.max(2, Math.floor(value / 2) * 2)
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

function buildVideoFilter(format: TimelineExportFormat | undefined): string {
  const width = evenDimension(format?.width)
  const height = evenDimension(format?.height)
  if (!width || !height) return 'setsar=1'
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`
}

function buildSilenceInput(sampleRate: number, channels: number): string {
  return channels === 1 ? `anullsrc=channel_layout=mono:sample_rate=${sampleRate}` : `anullsrc=channel_layout=stereo:sample_rate=${sampleRate}`
}

function clipVolume(clip: TimelineExportClip): number {
  return isEditingClipMuted(clip) ? 0 : getEditingClipVolume(clip)
}

export function buildTimelineSegmentArgs(clip: NormalizedClip, outputPath: string, format?: TimelineExportFormat): string[] {
  const frameRate = positiveNumber(format?.frameRate, 30)
  const audioSampleRate = Math.round(positiveNumber(format?.audioSampleRate, 48000))
  const audioChannels = Math.max(1, Math.round(positiveNumber(format?.audioChannels, 2)))
  const volume = clipVolume(clip)
  const args = ['-y', '-ss', String(clip.startSeconds), '-i', clip.mediaPath]
  if (clip.hasAudio === false) args.push('-f', 'lavfi', '-i', buildSilenceInput(audioSampleRate, audioChannels))
  args.push('-t', String(clip.durationSeconds), '-map', '0:v:0', '-map', clip.hasAudio === false ? '1:a:0' : '0:a?', '-vf', buildVideoFilter(format), '-af', `volume=${volume}`, '-r', String(frameRate), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', String(audioSampleRate), '-ac', String(audioChannels), '-b:a', '192k', '-avoid_negative_ts', 'make_zero', outputPath)
  return args
}

export function buildTimelineConcatArgs(listPath: string, outputPath: string): string[] {
  return ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-map', '0:v:0', '-map', '0:a?', '-c', 'copy', '-movflags', '+faststart', outputPath]
}

async function resolveSubtitleText(options: Pick<RunTimelineExportOptions, 'subtitlePath' | 'subtitleSrtPath' | 'subtitleText'>): Promise<string | null> {
  if (options.subtitleText?.trim()) return options.subtitleText
  if (options.subtitleSrtPath) return await readFile(options.subtitleSrtPath, 'utf8')
  if (options.subtitlePath) return convertVttToSrt(await readFile(options.subtitlePath, 'utf8'))
  return null
}

export function buildTimelineSubtitleText(options: { editedSubtitleText?: string | null; sourceSubtitleText?: string | null; clips: readonly MediaTimelineExportClip[] }): string | null {
  if (options.editedSubtitleText?.trim()) return options.editedSubtitleText
  return options.sourceSubtitleText ? remapSrtToTimeline(options.sourceSubtitleText, options.clips) : null
}

async function burnSubtitles(ffmpegPath: string, inputPath: string, subtitlePath: string, outputPath: string): Promise<ProcessResult> {
  return await runProcess(ffmpegPath, ['-y', '-i', inputPath, '-vf', `subtitles=filename='${escapeFilterPath(subtitlePath)}'`, '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath])
}

export async function runTimelineExport(options: RunTimelineExportOptions): Promise<RunTimelineExportResult> {
  const copy = getAppCopy(options.getLocale?.())
  const clips = normalizeClips(options.clips)
  if (clips.length === 0) throw new Error('时间线没有可导出的片段')
  const subtitleText = options.mode === 'video' ? null : await resolveSubtitleText(options)
  if (options.mode !== 'video' && !subtitleText) throw new Error(copy.runtime.clipExportSubtitleMissing)
  const tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-timeline-'))

  try {
    await mkdir(dirname(options.outputVideoPath), { recursive: true })
    const segmentPaths: string[] = []
    for (const [index, clip] of clips.entries()) {
      const segmentPath = join(tempDirectory, `segment-${String(index).padStart(4, '0')}.mp4`)
      const result = await runProcess(options.ffmpegPath, buildTimelineSegmentArgs(clip, segmentPath, options.outputFormat))
      if (result.code !== 0) throw new Error(`${copy.runtime.clipExportFailed}：${tailOutput(result.output)}`)
      segmentPaths.push(segmentPath)
    }

    const listPath = join(tempDirectory, 'segments.txt')
    await writeFile(listPath, `${segmentPaths.map((path) => `file '${escapeConcatPath(path)}'`).join('\n')}\n`, 'utf8')
    const remappedSubtitleText = buildTimelineSubtitleText({ editedSubtitleText: options.subtitleText, sourceSubtitleText: subtitleText, clips })
    const subtitlePath = remappedSubtitleText != null ? join(tempDirectory, 'timeline.srt') : null
    if (subtitlePath && remappedSubtitleText != null) await writeFile(subtitlePath, remappedSubtitleText, 'utf8')

    const combinedPath = options.mode === 'burn-subtitle' ? join(tempDirectory, 'combined.mp4') : options.outputVideoPath
    const concatResult = await runProcess(options.ffmpegPath, buildTimelineConcatArgs(listPath, combinedPath))
    if (concatResult.code !== 0) throw new Error(`${copy.runtime.clipExportFailed}：${tailOutput(concatResult.output)}`)

    if (options.mode === 'burn-subtitle' && subtitlePath) {
      const burnResult = await burnSubtitles(options.ffmpegPath, combinedPath, subtitlePath, options.outputVideoPath)
      if (burnResult.code !== 0) throw new Error(`${copy.runtime.clipExportFailed}：${tailOutput(burnResult.output)}`)
    }

    if (options.mode === 'external-subtitle' && remappedSubtitleText != null) {
      const subtitleSrtPath = buildClipExportSubtitlePath(options.outputVideoPath)
      await writeFile(subtitleSrtPath, remappedSubtitleText, 'utf8')
      return { videoPath: options.outputVideoPath, subtitleSrtPath }
    }
    return { videoPath: options.outputVideoPath }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true })
  }
}
