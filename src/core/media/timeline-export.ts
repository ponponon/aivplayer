import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { convertVttToSrt } from '../ai/subtitle-writer.ts'
import { getAppCopy } from '../../shared/i18n'
import type { EditingClipTransitionType, EditingFrameId, EditingGraphic, EditingGraphicMotion, EditingOverlayTrackKind, EditingVideoBlockPosition, EditingVideoBlockMotion } from '../../shared/editing-types'
import type { AppLocale } from '../../shared/localization'
import { MIN_CLIP_DURATION_SECONDS, type TimelineExportMode } from '../../shared/clip-export'
import { buildClipExportSubtitlePath, remapSrtToTimeline } from './clip-export'
import type { MediaTimelineExportClip, MediaTimelineExportVideoBlock } from '../../shared/media-types'
import { getEditingClipVolume, isEditingClipMuted } from '../editing/audio-operations'
import { getEditingClipFilter } from '../editing/filter-operations'
import { getEditingClipTransition } from '../editing/transition-operations'
import { getEditingClipTreatment, getEditingClipTreatmentAnchor, getEditingClipTreatmentScale } from '../editing/treatment-operations'
import { getEditingVideoBlockBorderRadius, getEditingVideoBlockBorderWidth, getEditingVideoBlockMotion, getEditingVideoBlockSize } from '../editing/video-block-operations'
import { getEditingClipMotion } from '../editing/clip-motion'
import { getEditingFramingState, getEditingFramingTransform, getEditingFramingTransition, type EditingFramingTransition } from '../editing/framing-operations'
import { getEditingPersonMatteFeatherPixels, getEditingPersonMatteOutlinePixels, getEditingPersonMatteSettings } from '../editing/person-matte'
import { buildTimelineExportDefaultFileName, getTimelineExportPathDirectory, joinTimelineExportPath } from '../../shared/timeline-export-path'
import type { SubtitleRenderSettings } from '../../shared/subtitle-presets'
import { buildAssSubtitle } from './subtitle-ass'
import { probeFfmpegCapabilities } from './ffmpeg-capabilities'
import { getEditingOverlayTrackOrder } from '../editing/overlay-track-operations'
import { getEditingGraphicMotion } from '../editing/graphic-motion'

export type RunTimelineExportOptions = {
  ffmpegPath: string
  mediaPath: string
  clips: readonly TimelineExportClip[]
  outputVideoPath: string
  mode: TimelineExportMode
  subtitlePath?: string
  subtitleSrtPath?: string
  /** Already-remapped SRT text in edited timeline time. */
  subtitleText?: string
  /** Already-remapped ASS text in edited timeline time, including karaoke tags when available. */
  subtitleAssText?: string
  subtitleRender?: SubtitleRenderSettings
  graphics?: readonly EditingGraphic[]
  frameId?: EditingFrameId
  videoBlocks?: readonly MediaTimelineExportVideoBlock[]
  /** Back-to-front order for the graphics, PiP and caption composition layers. */
  overlayTrackOrder?: readonly EditingOverlayTrackKind[]
  renderGraphics?: TimelineGraphicRasterizer
  outputFormat?: TimelineExportFormat
  getLocale?: () => AppLocale
}

export type RunTimelineExportResult = {
  videoPath: string
  subtitleSrtPath?: string
}

type ProcessResult = { code: number | null; output: string }
export type TimelineExportPersonMatteTrack = { sampleFps: number; framePattern: string; frameCount: number }
type TimelineExportClip = MediaTimelineExportClip & { hasAudio?: boolean; personMatteTrack?: TimelineExportPersonMatteTrack }
type NormalizedClip = TimelineExportClip & { durationSeconds: number }

export type TimelineExportFormat = {
  width?: number
  height?: number
  frameRate?: number
  audioSampleRate?: number
  audioChannels?: number
  fitMode?: 'contain' | 'cover'
}

export type TimelineGraphicRasterizeRequest = {
  graphics: readonly EditingGraphic[]
  frameId?: EditingFrameId
  width: number
  height: number
  outputDirectory: string
}

export type TimelineGraphicRasterAsset = {
  graphicId: string
  imagePath: string
  /** Cropped card bounds in the output canvas. Older rasterizers may omit them and keep full-frame overlay behavior. */
  x?: number
  y?: number
  width?: number
  height?: number
}

export type TimelineGraphicRasterizer = (request: TimelineGraphicRasterizeRequest) => Promise<readonly TimelineGraphicRasterAsset[]>

type NormalizedVideoBlock = MediaTimelineExportVideoBlock & { durationSeconds: number }

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

export function buildTimelineExportDefaultVideoPath(mediaPath: string, clipCount: number, durationSeconds: number, mode: TimelineExportMode): string {
  return joinTimelineExportPath(getTimelineExportPathDirectory(mediaPath), buildTimelineExportDefaultFileName(mediaPath, clipCount, durationSeconds, mode))
}

function evenDimension(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value < 2) return null
  return Math.max(2, Math.floor(value / 2) * 2)
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

function transitionHalfDuration(clip: TimelineExportClip, durationSeconds: number): number {
  const transition = getEditingClipTransition(clip)
  return transition?.type === 'fade' ? Math.min(Math.max(0, durationSeconds / 2), transition.durationSeconds / 2) : 0
}

function buildFramingCropFilter(clip: TimelineExportClip): string | null {
  if (getEditingClipTreatment(clip) !== 'punch-in') return null
  const scale = getEditingClipTreatmentScale(clip)
  const anchor = getEditingClipTreatmentAnchor(clip)
  const cropX = anchor === 'left' ? '0' : anchor === 'right' ? 'iw-ow' : '(iw-ow)/2'
  return `crop=trunc(iw/${scale}/2)*2:trunc(ih/${scale}/2)*2:${cropX}:(ih-oh)/2`
}

function hasCompactFraming(clip: TimelineExportClip): boolean {
  const treatment = getEditingClipTreatment(clip)
  return treatment === 'corner-br' || treatment === 'corner-tl' || treatment === 'split-left' || treatment === 'split-right'
}

function buildVideoFilter(format: TimelineExportFormat | undefined, clip: TimelineExportClip, fadeInDuration = 0, fadeOutDuration = 0): string {
  const width = evenDimension(format?.width)
  const height = evenDimension(format?.height)
  const fitFilter = width && height
    ? format?.fitMode === 'cover'
      ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`
      : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`
    : 'setsar=1'
  const filters: string[] = []
  const color = getEditingClipFilter(clip)
  if (color.brightness !== 1 || color.contrast !== 1 || color.saturate !== 1) filters.push(`eq=brightness=${Math.round((color.brightness - 1) * 1000) / 1000}:contrast=${color.contrast}:saturation=${color.saturate}`)
  const framingCropFilter = buildFramingCropFilter(clip)
  if (framingCropFilter) filters.push(framingCropFilter)
  if (fadeInDuration > 0) filters.push(`fade=t=in:st=0:d=${fadeInDuration}:color=black`)
  if (fadeOutDuration > 0) filters.push(`fade=t=out:st=${Math.max(0, clip.endSeconds - clip.startSeconds - fadeOutDuration)}:d=${fadeOutDuration}:color=black`)
  return [...filters, fitFilter].join(',')
}

function buildPersonMatteMaskFilter(format: TimelineExportFormat | undefined, clip: TimelineExportClip, sampleFps: number): string {
  const width = evenDimension(format?.width)
  const height = evenDimension(format?.height)
  const filters = [`fps=${sampleFps}`, 'format=rgba', 'alphaextract']
  const framingCropFilter = buildFramingCropFilter(clip)
  if (framingCropFilter) filters.push(framingCropFilter)
  const settings = getEditingPersonMatteSettings(clip.personMatte)
  const featherPixels = getEditingPersonMatteFeatherPixels(settings)
  if (featherPixels > 0) filters.push(`boxblur=${featherPixels}:1`)
  if (width && height) {
    if (format?.fitMode === 'cover') filters.push(`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:(ow-iw)/2:(oh-ih)/2`)
    else filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`)
  }
  filters.push('setsar=1')
  return filters.join(',')
}

function clipMotionProgressExpression(startSeconds: number, durationSeconds: number): string {
  return `if(lt(t,${startSeconds}),0,if(lt(t,${startSeconds + durationSeconds}),(t-${startSeconds})/${durationSeconds},1))`
}

function clipMotionOffsetExpression(axis: 'x' | 'y', boxSize: number, enterMotion: EditingGraphicMotion, exitMotion: EditingGraphicMotion, durationSeconds: number, exitStartSeconds: number): string {
  const enterOffset = axis === 'y' && enterMotion === 'rise' ? boxSize : axis === 'x' && enterMotion === 'slide-left' ? -boxSize : axis === 'x' && enterMotion === 'slide-right' ? boxSize : 0
  const exitOffset = axis === 'y' && exitMotion === 'rise' ? -boxSize : axis === 'x' && exitMotion === 'slide-left' ? -boxSize : axis === 'x' && exitMotion === 'slide-right' ? boxSize : 0
  const enterPosition = enterOffset === 0 ? '0' : `(${enterOffset})*(1-${clipMotionProgressExpression(0, durationSeconds)})`
  if (exitOffset === 0) return enterPosition
  return `if(lt(t,${exitStartSeconds}),${enterPosition},(${exitOffset})*${clipMotionProgressExpression(exitStartSeconds, durationSeconds)})`
}

function clipMotionScaleExpression(enterMotion: EditingGraphicMotion, exitMotion: EditingGraphicMotion, durationSeconds: number, exitStartSeconds: number): string | null {
  if (enterMotion !== 'scale' && exitMotion !== 'scale') return null
  const enterScale = enterMotion === 'scale' ? `0.82+0.18*${clipMotionProgressExpression(0, durationSeconds)}` : '1'
  return exitMotion === 'scale' ? `if(lt(t,${exitStartSeconds}),${enterScale},1-0.18*${clipMotionProgressExpression(exitStartSeconds, durationSeconds)})` : enterScale
}

function hasClipMotion(clip: TimelineExportClip): boolean {
  const motion = getEditingClipMotion(clip)
  return motion.enterMotion !== 'none' || motion.exitMotion !== 'none'
}

function framingProgressExpression(durationSeconds: number): string {
  return `if(lt(t,${durationSeconds}),t/${durationSeconds},1)`
}

function getFramingTransitionExpressions(transition: EditingFramingTransition): { scale: string; translateX: string; translateY: string } {
  const progress = framingProgressExpression(transition.durationSeconds)
  const from = getEditingFramingTransform(transition.from)
  const to = getEditingFramingTransform(transition.to)
  return {
    scale: `${from.scale}+(${to.scale}-${from.scale})*(${progress})`,
    translateX: `${from.translateXPercent}+(${to.translateXPercent}-${from.translateXPercent})*(${progress})`,
    translateY: `${from.translateYPercent}+(${to.translateYPercent}-${from.translateYPercent})*(${progress})`
  }
}

function removeClipFraming(clip: NormalizedClip): NormalizedClip {
  return { ...clip, treatment: 'full', treatmentScale: undefined, treatmentAnchor: undefined, treatmentSize: undefined }
}

function buildTimelineMotionCompositionFilterComplex(clip: NormalizedClip, format: TimelineExportFormat, frameRate: number, colorInputIndex: number, fadeInDuration: number, fadeOutDuration: number, foregroundSource: string, baseForegroundFilters: readonly string[], outputLabel: string, framingTransition?: EditingFramingTransition): string {
  const width = evenDimension(format.width)!
  const height = evenDimension(format.height)!
  const motion = getEditingClipMotion(clip)
  const durationSeconds = Math.min(motion.durationSeconds, clip.durationSeconds / 2)
  const exitStartSeconds = Math.max(0, clip.durationSeconds - durationSeconds)
  const framingExpressions = framingTransition ? getFramingTransitionExpressions(framingTransition) : null
  const staticFraming = getEditingFramingTransform(getEditingFramingState(clip))
  const useStaticFraming = hasCompactFraming(clip)
  const useFramingComposition = Boolean(framingTransition) || useStaticFraming
  const framingBaseFilters = foregroundSource === '[0:v]' && useFramingComposition
    ? [buildVideoFilter(format, removeClipFraming(clip), fadeInDuration, fadeOutDuration)]
    : [...baseForegroundFilters]
  const framingScaleExpression = framingExpressions?.scale ?? (useStaticFraming ? String(staticFraming.scale) : null)
  const foregroundFilters = useFramingComposition && framingScaleExpression
    ? [...framingBaseFilters, `scale=w='trunc(iw*(${escapeFilterExpression(framingScaleExpression)})/2)*2':h='trunc(ih*(${escapeFilterExpression(framingScaleExpression)})/2)*2':eval=frame`]
    : [...baseForegroundFilters]
  if (motion.enterMotion === 'fade') foregroundFilters.push(`fade=t=in:st=0:d=${durationSeconds}:color=black`)
  if (motion.exitMotion === 'fade') foregroundFilters.push(`fade=t=out:st=${exitStartSeconds}:d=${durationSeconds}:color=black`)
  const scaleExpression = clipMotionScaleExpression(motion.enterMotion, motion.exitMotion, durationSeconds, exitStartSeconds)
  if (scaleExpression) foregroundFilters.push(`scale=w='trunc(iw*(${escapeFilterExpression(scaleExpression)})/2)*2':h='trunc(ih*(${escapeFilterExpression(scaleExpression)})/2)*2':eval=frame`)
  const xExpression = clipMotionOffsetExpression('x', width, motion.enterMotion, motion.exitMotion, durationSeconds, exitStartSeconds)
  const yExpression = clipMotionOffsetExpression('y', height, motion.enterMotion, motion.exitMotion, durationSeconds, exitStartSeconds)
  const framingOffsetExpression = framingExpressions ? `(${framingExpressions.translateX}/100)*${width}` : useStaticFraming ? `(${staticFraming.translateXPercent}/100)*${width}` : '0'
  const framingYOffsetExpression = framingExpressions ? `(${framingExpressions.translateY}/100)*${height}` : useStaticFraming ? `(${staticFraming.translateYPercent}/100)*${height}` : '0'
  const xPosition = useFramingComposition
    ? `${xExpression}+(${width}-overlay_w)/2+${framingOffsetExpression}`
    : scaleExpression
      ? `${xExpression}+(${width}-overlay_w)/2`
      : xExpression
  const yPosition = useFramingComposition
    ? `${yExpression}+(${height}-overlay_h)/2+${framingYOffsetExpression}`
    : scaleExpression
      ? `${yExpression}+(${height}-overlay_h)/2`
      : yExpression
  return `${foregroundSource}${foregroundFilters.join(',')}[clip-motion-fg];[${colorInputIndex}:v]format=yuv420p[clip-motion-bg];[clip-motion-bg][clip-motion-fg]overlay=x='${escapeFilterExpression(xPosition)}':y='${escapeFilterExpression(yPosition)}':shortest=1:format=auto${outputLabel}`
}

function buildTimelineClipMotionFilterComplex(clip: NormalizedClip, format: TimelineExportFormat, frameRate: number, colorInputIndex: number, fadeInDuration: number, fadeOutDuration: number, framingTransition?: EditingFramingTransition): string {
  return buildTimelineMotionCompositionFilterComplex(clip, format, frameRate, colorInputIndex, fadeInDuration, fadeOutDuration, '[0:v]', [buildVideoFilter(format, clip, fadeInDuration, fadeOutDuration)], '[clip-motion-v]', framingTransition)
}

function buildPersonMatteFilterComplex(format: TimelineExportFormat | undefined, clip: NormalizedClip, sampleFps: number, personMatteInputIndex: number, frameRate: number, fadeInDuration: number, fadeOutDuration: number, outputLabel: string, framingTransition?: EditingFramingTransition): string {
  const personMatteSettings = getEditingPersonMatteSettings(clip.personMatte)
  const outputWidth = evenDimension(format?.width)
  const outputHeight = evenDimension(format?.height)
  const canDrawOutline = personMatteSettings.outlineWidthPercent > 0 && outputWidth !== null && outputHeight !== null
  const outlinePasses = canDrawOutline ? Math.max(1, Math.min(16, getEditingPersonMatteOutlinePixels(personMatteSettings, outputWidth!, outputHeight!))) : 0
  const outlineMaskFilter = outlinePasses > 0 ? Array.from({ length: outlinePasses }, () => 'dilation=coordinates=255').join(',') : ''
  const baseClip = framingTransition ? removeClipFraming(clip) : clip
  if (!canDrawOutline) return `[0:v]${buildVideoFilter(format, baseClip, fadeInDuration, fadeOutDuration)},format=rgba[person-matte-video];[${personMatteInputIndex}:v]${buildPersonMatteMaskFilter(format, baseClip, sampleFps)}[person-matte-mask];[person-matte-video][person-matte-mask]alphamerge${outputLabel}`
  return `[0:v]${buildVideoFilter(format, baseClip, fadeInDuration, fadeOutDuration)},format=rgba[person-matte-video];[${personMatteInputIndex}:v]${buildPersonMatteMaskFilter(format, baseClip, sampleFps)}[person-matte-mask-source];[person-matte-mask-source]split=2[person-matte-mask][person-matte-outline-mask];[person-matte-video][person-matte-mask]alphamerge[person-matte-foreground];color=c=0x${personMatteSettings.outlineColor.slice(1)}:s=${outputWidth}x${outputHeight}:r=${frameRate}:d=${clip.durationSeconds},format=rgba[person-matte-outline-color];[person-matte-outline-mask]${outlineMaskFilter}[person-matte-outline-dilated];[person-matte-outline-color][person-matte-outline-dilated]alphamerge[person-matte-outline];[person-matte-outline][person-matte-foreground]overlay=format=auto${outputLabel}`
}

function buildSilenceInput(sampleRate: number, channels: number): string {
  return channels === 1 ? `anullsrc=channel_layout=mono:sample_rate=${sampleRate}` : `anullsrc=channel_layout=stereo:sample_rate=${sampleRate}`
}

function clipVolume(clip: TimelineExportClip): number {
  return isEditingClipMuted(clip) ? 0 : getEditingClipVolume(clip)
}

export function buildTimelineSegmentArgs(clip: NormalizedClip, outputPath: string, format?: TimelineExportFormat, transitionOutDuration = 0, applyLegacySeamFade = true, framingTransition?: EditingFramingTransition): string[] {
  const frameRate = positiveNumber(format?.frameRate, 30)
  const audioSampleRate = Math.round(positiveNumber(format?.audioSampleRate, 48000))
  const audioChannels = Math.max(1, Math.round(positiveNumber(format?.audioChannels, 2)))
  const volume = clipVolume(clip)
  const fadeInDuration = applyLegacySeamFade ? transitionHalfDuration(clip, clip.durationSeconds) : 0
  const fadeOutDuration = applyLegacySeamFade ? Math.min(Math.max(0, clip.durationSeconds / 2), transitionOutDuration / 2) : 0
  const audioFilters = [`volume=${volume}`]
  if (fadeInDuration > 0) audioFilters.push(`afade=t=in:st=0:d=${fadeInDuration}`)
  if (fadeOutDuration > 0) audioFilters.push(`afade=t=out:st=${Math.max(0, clip.durationSeconds - fadeOutDuration)}:d=${fadeOutDuration}`)
  const args = ['-y', '-ss', String(clip.startSeconds), '-i', clip.mediaPath]
  if (clip.hasAudio === false) args.push('-f', 'lavfi', '-i', buildSilenceInput(audioSampleRate, audioChannels))
  const personMatteTrack = clip.personMatteTrack && clip.personMatte?.enabled ? clip.personMatteTrack : null
  if (personMatteTrack) args.push('-framerate', String(personMatteTrack.sampleFps), '-start_number', '0', '-i', personMatteTrack.framePattern)
  const personMatteInputIndex = clip.hasAudio === false ? 2 : 1
  const useMotionFilter = Boolean(format?.width && format?.height && (hasClipMotion(clip) || framingTransition || hasCompactFraming(clip)))
  if (useMotionFilter && !personMatteTrack) {
    const colorInputIndex = clip.hasAudio === false ? 2 : 1
    args.push('-f', 'lavfi', '-i', `color=c=black:s=${evenDimension(format?.width)}x${evenDimension(format?.height)}:r=${frameRate}:d=${clip.durationSeconds}`)
    args.push('-t', String(clip.durationSeconds), '-map', '[clip-motion-v]', '-map', clip.hasAudio === false ? '1:a:0' : '0:a?', '-filter_complex', buildTimelineClipMotionFilterComplex(clip, format!, frameRate, colorInputIndex, fadeInDuration, fadeOutDuration, framingTransition), '-af', audioFilters.join(','), '-r', String(frameRate), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', String(audioSampleRate), '-ac', String(audioChannels), '-b:a', '192k', '-avoid_negative_ts', 'make_zero', outputPath)
  } else {
    if (personMatteTrack) {
      const usePersonMatteMotion = useMotionFilter && format !== undefined
      const personMatteOutputLabel = usePersonMatteMotion ? '[person-matte-composite]' : '[person-matte-v]'
      const personMatteFilter = buildPersonMatteFilterComplex(format, clip, personMatteTrack.sampleFps, personMatteInputIndex, frameRate, fadeInDuration, fadeOutDuration, personMatteOutputLabel, framingTransition)
      if (usePersonMatteMotion) {
        const colorInputIndex = personMatteInputIndex + 1
        args.push('-f', 'lavfi', '-i', `color=c=black:s=${evenDimension(format.width)}x${evenDimension(format.height)}:r=${frameRate}:d=${clip.durationSeconds}`)
        const motionFilter = buildTimelineMotionCompositionFilterComplex(clip, format, frameRate, colorInputIndex, 0, 0, '[person-matte-composite]', ['format=rgba'], '[person-matte-v]', framingTransition)
        args.push('-t', String(clip.durationSeconds), '-map', '[person-matte-v]', '-filter_complex', `${personMatteFilter};${motionFilter}`)
      } else args.push('-t', String(clip.durationSeconds), '-filter_complex', personMatteFilter, '-map', '[person-matte-v]')
    } else args.push('-t', String(clip.durationSeconds), '-map', '0:v:0', '-vf', buildVideoFilter(format, clip, fadeInDuration, fadeOutDuration))
    args.push('-map', clip.hasAudio === false ? '1:a:0' : '0:a?', '-af', audioFilters.join(','), '-r', String(frameRate), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', String(audioSampleRate), '-ac', String(audioChannels), '-b:a', '192k', '-avoid_negative_ts', 'make_zero', outputPath)
  }
  return args
}

export function buildTimelineConcatArgs(listPath: string, outputPath: string): string[] {
  return ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-map', '0:v:0', '-map', '0:a?', '-c', 'copy', '-movflags', '+faststart', outputPath]
}

export function getTimelineXfadeTransitionName(type: EditingClipTransitionType): string {
  switch (type) {
    case 'fade':
    case 'fadeblack': return 'fadeblack'
    case 'dissolve': return 'dissolve'
    case 'wipe-left': return 'wipeleft'
    case 'wipe-right': return 'wiperight'
    case 'slide-left': return 'slideleft'
    case 'slide-right': return 'slideright'
    case 'zoom': return 'zoomin'
    case 'circleopen': return 'circleopen'
    case 'crosszoom': return 'zoomin'
  }
}

/** Builds a duration-preserving xfade chain. tpad supplies the outgoing hold frame so xfade starts at the original cut instead of shortening the edit. */
export function buildTimelineXfadeArgs(segmentPaths: readonly string[], clips: readonly NormalizedClip[], outputPath: string, format?: TimelineExportFormat): string[] {
  if (segmentPaths.length !== clips.length || clips.length === 0) return []
  const frameRate = positiveNumber(format?.frameRate, 30)
  const audioSampleRate = Math.round(positiveNumber(format?.audioSampleRate, 48000))
  const audioChannels = Math.max(1, Math.round(positiveNumber(format?.audioChannels, 2)))
  const groups: Array<{ start: number; end: number; duration: number }> = []
  let groupStart = 0
  for (let index = 1; index < clips.length; index += 1) {
    if (getEditingClipTransition(clips[index]!)) {
      groups.push({ start: groupStart, end: index, duration: clips.slice(groupStart, index).reduce((sum, clip) => sum + clip.durationSeconds, 0) })
      groupStart = index
    }
  }
  groups.push({ start: groupStart, end: clips.length, duration: clips.slice(groupStart).reduce((sum, clip) => sum + clip.durationSeconds, 0) })

  const filters: string[] = []
  const videoLabels: string[] = []
  const audioLabels: string[] = []
  for (const [groupIndex, group] of groups.entries()) {
    const groupVideoInputs: string[] = []
    for (let index = group.start; index < group.end; index += 1) {
      const videoLabel = `[xfade-video-${index}]`
      const audioLabel = `[xfade-audio-${index}]`
      filters.push(`[${index}:v]setpts=PTS-STARTPTS,fps=${frameRate},format=yuv420p${videoLabel}`)
      filters.push(`[${index}:a]asetpts=PTS-STARTPTS${audioLabel}`)
      groupVideoInputs.push(videoLabel)
      audioLabels.push(audioLabel)
    }
    const groupVideoLabel = `[xfade-group-${groupIndex}]`
    if (groupVideoInputs.length === 1) filters.push(`${groupVideoInputs[0]}format=yuv420p${groupVideoLabel}`)
    else filters.push(`${groupVideoInputs.join('')}concat=n=${groupVideoInputs.length}:v=1:a=0,format=yuv420p${groupVideoLabel}`)
    videoLabels.push(groupVideoLabel)
  }
  filters.push(`${audioLabels.join('')}concat=n=${audioLabels.length}:v=0:a=1,aresample=${audioSampleRate}:async=1:first_pts=0[aout]`)

  let previousVideo = videoLabels[0]!
  let timelineOffset = groups[0]!.duration
  for (let groupIndex = 1; groupIndex < groups.length; groupIndex += 1) {
    const transition = getEditingClipTransition(clips[groups[groupIndex]!.start])
    if (!transition) return []
    const duration = Math.min(transition.durationSeconds, Math.max(0.05, groups[groupIndex - 1]!.duration))
    const paddedLabel = `[xfade-padded-${groupIndex}]`
    const nextLabel = `[xfade-stage-${groupIndex}]`
    filters.push(`${previousVideo}tpad=stop_mode=clone:stop_duration=${duration}${paddedLabel}`)
    filters.push(`${paddedLabel}${videoLabels[groupIndex]}xfade=transition=${getTimelineXfadeTransitionName(transition.type)}:duration=${duration}:offset=${timelineOffset},format=yuv420p${nextLabel}`)
    previousVideo = nextLabel
    timelineOffset += groups[groupIndex]!.duration
  }
  filters.push(`${previousVideo}format=yuv420p[vout]`)
  const timelineDuration = clips.reduce((sum, clip) => sum + clip.durationSeconds, 0)
  const args = ['-y']
  for (const path of segmentPaths) args.push('-i', path)
  args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', String(timelineDuration), '-r', String(frameRate), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', String(audioSampleRate), '-ac', String(audioChannels), '-b:a', '192k', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', outputPath)
  return args
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

function roundedRectangleAlphaExpression(width: number, height: number, radius: number): string {
  const right = width - radius
  const bottom = height - radius
  const radiusSquared = radius * radius
  const circle = (centerX: number, centerY: number): string => `if(gt((X-${centerX})*(X-${centerX})+(Y-${centerY})*(Y-${centerY}),${radiusSquared}),0,255)`
  const expression = `if(lt(X,${radius}),if(lt(Y,${radius}),${circle(radius, radius)},if(gt(Y,${bottom}),${circle(radius, bottom)},255)),if(gt(X,${right}),if(lt(Y,${radius}),${circle(right, radius)},if(gt(Y,${bottom}),${circle(right, bottom)},255)),255))`
  return expression.replaceAll(',', '\\,')
}

function escapeFilterExpression(expression: string): string {
  return expression.replaceAll(',', '\\,')
}

function motionVisibleEnd(block: NormalizedVideoBlock): number {
  const motion = getEditingVideoBlockMotion(block)
  return block.startSeconds + block.durationSeconds + (motion.exitMotion === 'none' ? 0 : motion.durationSeconds)
}

function motionProgressExpression(startSeconds: number, durationSeconds: number): string {
  return `if(lt(t,${startSeconds}),0,if(lt(t,${startSeconds + durationSeconds}),(t-${startSeconds})/${durationSeconds},1))`
}

function exitMotionProgressExpression(endSeconds: number, durationSeconds: number): string {
  return `if(lt(t,${endSeconds}),0,if(lt(t,${endSeconds + durationSeconds}),(t-${endSeconds})/${durationSeconds},1))`
}

function motionFadeFilter(block: Pick<NormalizedVideoBlock, 'durationSeconds'>, enterMotion: EditingGraphicMotion, exitMotion: EditingGraphicMotion, durationSeconds: number): string {
  const fades: string[] = []
  if (enterMotion === 'fade') fades.push(`fade=t=in:st=0:d=${durationSeconds}:alpha=1`)
  if (exitMotion === 'fade') fades.push(`fade=t=out:st=${block.durationSeconds}:d=${durationSeconds}:alpha=1`)
  return fades.length > 0 ? `,format=rgba,${fades.join(',')}` : ''
}

function motionOffsetExpression(block: Pick<NormalizedVideoBlock, 'startSeconds' | 'durationSeconds'>, axis: 'x' | 'y', boxSize: number, basePosition: number, enterMotion: EditingGraphicMotion, exitMotion: EditingGraphicMotion, durationSeconds: number): string {
  const enterOffset = axis === 'y' && enterMotion === 'rise' ? boxSize : axis === 'x' && enterMotion === 'slide-left' ? -boxSize : axis === 'x' && enterMotion === 'slide-right' ? boxSize : 0
  const exitOffset = axis === 'y' && exitMotion === 'rise' ? -boxSize : axis === 'x' && exitMotion === 'slide-left' ? -boxSize : axis === 'x' && exitMotion === 'slide-right' ? boxSize : 0
  const endSeconds = block.startSeconds + block.durationSeconds
  let expression = enterOffset === 0 ? String(basePosition) : `${basePosition}+(${enterOffset})*(1-${motionProgressExpression(block.startSeconds, durationSeconds)})`
  if (exitOffset !== 0) expression = `if(lt(t,${endSeconds}),${expression},${basePosition}+(${exitOffset})*${exitMotionProgressExpression(endSeconds, durationSeconds)})`
  return expression
}

function motionScaleExpression(block: Pick<NormalizedVideoBlock, 'startSeconds' | 'durationSeconds'>, enterMotion: EditingGraphicMotion, exitMotion: EditingGraphicMotion, durationSeconds: number): string | null {
  if (enterMotion !== 'scale' && exitMotion !== 'scale') return null
  const endSeconds = block.startSeconds + block.durationSeconds
  const enterScale = enterMotion === 'scale' ? `0.82+0.18*${motionProgressExpression(block.startSeconds, durationSeconds)}` : '1'
  if (exitMotion !== 'scale') return enterScale
  return `if(lt(t,${endSeconds}),${enterScale},1-0.18*${exitMotionProgressExpression(endSeconds, durationSeconds)})`
}

export function buildTimelineOverlayFilter(graphics: readonly EditingGraphic[], assets: readonly TimelineGraphicRasterAsset[], videoBlocks: readonly NormalizedVideoBlock[], outputWidth: number, outputHeight: number, overlayTrackOrder?: readonly EditingOverlayTrackKind[], subtitlePath?: string): string {
  const assetById = new Map(assets.map((asset) => [asset.graphicId, asset]))
  const available = graphics.filter((graphic) => assetById.has(graphic.id))
  if (available.length === 0 && videoBlocks.length === 0 && !subtitlePath) return ''
  const filters: string[] = []
  let previous = '[0:v]'
  const videoInputOffset = 1 + available.length
  const overlayStages = getEditingOverlayTrackOrder(overlayTrackOrder).filter((kind) => kind === 'graphics' ? available.length > 0 : kind === 'videoBlocks' ? videoBlocks.length > 0 : Boolean(subtitlePath))
  let stageIndex = 0
  const stageOutput = (): string => stageIndex === overlayStages.length - 1 ? '[vout]' : `[overlay-stage-${stageIndex}]`
  const appendGraphics = (): void => {
    const output = stageOutput()
    for (const [index, graphic] of available.entries()) {
      const next = index === available.length - 1 ? output : `[graphic-${index}]`
      const asset = assetById.get(graphic.id)!
      const motion = getEditingGraphicMotion(graphic)
      const hasGeometry = asset.x !== undefined && asset.y !== undefined && asset.width !== undefined && asset.height !== undefined
      const isStaticFullFrame = !hasGeometry && motion.enterMotion === 'none' && motion.exitMotion === 'none'
      if (isStaticFullFrame) {
        filters.push(`${previous}[${index + 1}:v]overlay=x=0:y=0:enable='between(t,${graphic.startSeconds},${graphic.startSeconds + graphic.durationSeconds})':eof_action=pass${next}`)
        previous = next
        continue
      }
      const boxWidth = Math.max(2, Math.round(asset.width ?? outputWidth))
      const boxHeight = Math.max(2, Math.round(asset.height ?? outputHeight))
      const baseX = Math.round(asset.x ?? 0)
      const baseY = Math.round(asset.y ?? 0)
      const scaleExpression = motionScaleExpression(graphic, motion.enterMotion, motion.exitMotion, motion.durationSeconds)
      const scaleFilter = scaleExpression ? `,scale=w='trunc(iw*(${escapeFilterExpression(scaleExpression)})/2)*2':h='trunc(ih*(${escapeFilterExpression(scaleExpression)})/2)*2':eval=frame` : ''
      const alphaFilter = motionFadeFilter(graphic, motion.enterMotion, motion.exitMotion, motion.durationSeconds)
      const xExpression = motionOffsetExpression(graphic, 'x', boxWidth, baseX, motion.enterMotion, motion.exitMotion, motion.durationSeconds)
      const yExpression = motionOffsetExpression(graphic, 'y', boxHeight, baseY, motion.enterMotion, motion.exitMotion, motion.durationSeconds)
      const centeredXExpression = scaleExpression ? `${xExpression}+(${boxWidth}-overlay_w)/2` : xExpression
      const centeredYExpression = scaleExpression ? `${yExpression}+(${boxHeight}-overlay_h)/2` : yExpression
      const xPosition = scaleExpression || !/^-?\d+(\.\d+)?$/.test(centeredXExpression) ? `'${escapeFilterExpression(centeredXExpression)}'` : centeredXExpression
      const yPosition = scaleExpression || !/^-?\d+(\.\d+)?$/.test(centeredYExpression) ? `'${escapeFilterExpression(centeredYExpression)}'` : centeredYExpression
      const sourceLabel = `[graphic-source-${index}]`
      filters.push(`[${index + 1}:v]setpts=PTS+${graphic.startSeconds}/TB${scaleFilter}${alphaFilter}${sourceLabel};${previous}${sourceLabel}overlay=x=${xPosition}:y=${yPosition}:enable='between(t,${graphic.startSeconds},${graphic.startSeconds + graphic.durationSeconds + (motion.exitMotion === 'none' ? 0 : motion.durationSeconds)})':eof_action=pass:repeatlast=0${next}`)
      previous = next
    }
    stageIndex += 1
  }
  const appendVideoBlocks = (): void => {
    const output = stageOutput()
    const splitBlocks = videoBlocks.filter((block) => block.position === 'split-left' || block.position === 'split-right')
    if (splitBlocks.length > 0) {
      const splitOutputs = ['[split-base-full]', ...splitBlocks.map((_block, index) => `[split-source-${index}]`)]
      filters.push(`${previous}split=${splitOutputs.length}${splitOutputs.join('')}`)
      previous = '[split-base-full]'
      for (const [index, block] of splitBlocks.entries()) {
        const partnerWidth = Math.max(2, Math.floor(outputWidth * getEditingVideoBlockSize(block) / 100 / 2) * 2)
        const mainWidth = outputWidth - partnerWidth
        const splitX = block.position === 'split-left' ? 0 : partnerWidth
        const next = `[split-stage-${index}]`
        filters.push(`[split-source-${index}]scale=${mainWidth}:${outputHeight}:force_original_aspect_ratio=decrease,pad=${mainWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2:color=black,pad=${outputWidth}:${outputHeight}:${splitX}:0:color=black[split-main-${index}];${previous}[split-main-${index}]overlay=x=0:y=0:enable='between(t,${block.startSeconds},${motionVisibleEnd(block)})':eof_action=pass:repeatlast=0${next}`)
        previous = next
      }
    }
    for (const [index, block] of videoBlocks.entries()) {
      const isSplit = block.position === 'split-left' || block.position === 'split-right'
      const sizePercent = getEditingVideoBlockSize(block)
      const boxWidth = Math.max(2, Math.floor(outputWidth * sizePercent / 100 / 2) * 2)
      const boxHeight = isSplit ? outputHeight : Math.max(2, Math.floor(outputHeight * sizePercent / 100 / 2) * 2)
      const marginX = isSplit ? 0 : Math.max(0, Math.floor(outputWidth * 0.04 / 2) * 2)
      const marginY = isSplit ? 0 : Math.max(0, Math.floor(outputHeight * 0.04 / 2) * 2)
      const x = block.position === 'split-left' ? outputWidth - boxWidth : block.position === 'split-right' ? 0 : block.position === 'top-right' || block.position === 'bottom-right' ? outputWidth - boxWidth - marginX : marginX
      const y = isSplit ? 0 : block.position === 'bottom-left' || block.position === 'bottom-right' ? outputHeight - boxHeight - marginY : marginY
      const inputIndex = videoInputOffset + index
      const next = index === videoBlocks.length - 1 ? output : `[video-block-${index}]`
      const borderWidth = getEditingVideoBlockBorderWidth(block)
      const borderRadius = Math.min(getEditingVideoBlockBorderRadius(block), Math.floor(Math.min(boxWidth, boxHeight) / 2))
      const borderFilter = borderWidth > 0 ? `,drawbox=x=0:y=0:w=iw:h=ih:color=white@0.85:t=${borderWidth}` : ''
      const maskFilter = borderRadius > 0 ? `,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${roundedRectangleAlphaExpression(boxWidth, boxHeight, borderRadius)}'` : ''
      const motion = getEditingVideoBlockMotion(block)
      const scaleExpression = motionScaleExpression(block, motion.enterMotion, motion.exitMotion, motion.durationSeconds)
      const scaleFilter = scaleExpression ? `,scale=w='trunc(iw*(${escapeFilterExpression(scaleExpression)})/2)*2':h='trunc(ih*(${escapeFilterExpression(scaleExpression)})/2)*2':eval=frame` : ''
      const alphaFilter = motionFadeFilter(block, motion.enterMotion, motion.exitMotion, motion.durationSeconds)
      const xExpression = motionOffsetExpression(block, 'x', boxWidth, x, motion.enterMotion, motion.exitMotion, motion.durationSeconds)
      const yExpression = motionOffsetExpression(block, 'y', boxHeight, y, motion.enterMotion, motion.exitMotion, motion.durationSeconds)
      const centeredXExpression = scaleExpression ? `${xExpression}+(${boxWidth}-overlay_w)/2` : xExpression
      const centeredYExpression = scaleExpression ? `${yExpression}+(${boxHeight}-overlay_h)/2` : yExpression
      const tpadFilter = motion.exitMotion === 'none' ? '' : `tpad=stop_mode=clone:stop_duration=${motion.durationSeconds},`
      const xPosition = scaleExpression || !/^-?\d+(\.\d+)?$/.test(centeredXExpression) ? `'${escapeFilterExpression(centeredXExpression)}'` : centeredXExpression
      const yPosition = scaleExpression || !/^-?\d+(\.\d+)?$/.test(centeredYExpression) ? `'${escapeFilterExpression(centeredYExpression)}'` : centeredYExpression
      filters.push(`[${inputIndex}:v]${tpadFilter}setpts=PTS+${block.startSeconds}/TB,scale=${boxWidth}:${boxHeight}:force_original_aspect_ratio=decrease,pad=${boxWidth}:${boxHeight}:(ow-iw)/2:(oh-ih)/2:color=black${borderFilter}${maskFilter}${scaleFilter}${alphaFilter}[video-block-source-${index}];${previous}[video-block-source-${index}]overlay=x=${xPosition}:y=${yPosition}:enable='between(t,${block.startSeconds},${motionVisibleEnd(block)})':eof_action=pass:repeatlast=0${next}`)
      previous = next
    }
    stageIndex += 1
  }
  const appendCaptions = (): void => {
    const output = stageOutput()
    filters.push(`${previous}subtitles=filename='${escapeFilterPath(subtitlePath!)}'${output}`)
    previous = output
    stageIndex += 1
  }
  for (const kind of overlayStages) {
    if (kind === 'graphics') appendGraphics()
    else if (kind === 'videoBlocks') appendVideoBlocks()
    else appendCaptions()
  }
  return filters.join(';')
}

export function buildTimelineGraphicOverlayFilter(graphics: readonly EditingGraphic[], assets: readonly TimelineGraphicRasterAsset[]): string {
  return buildTimelineOverlayFilter(graphics, assets, [], 1920, 1080)
}

export function buildTimelineVideoBlockOverlayFilter(blocks: readonly NormalizedVideoBlock[], outputWidth = 1920, outputHeight = 1080): string {
  return buildTimelineOverlayFilter([], [], blocks, outputWidth, outputHeight)
}

function renderTimelineVideo(ffmpegPath: string, inputPath: string, outputPath: string, filterGraph: string, graphicAssets: readonly TimelineGraphicRasterAsset[], videoBlocks: readonly NormalizedVideoBlock[], timelineDuration: number): Promise<ProcessResult> {
  const args = ['-y', '-i', inputPath]
  for (const asset of graphicAssets) args.push('-loop', '1', '-framerate', '30', '-t', String(timelineDuration), '-i', asset.imagePath)
  for (const block of videoBlocks) args.push('-ss', String(block.sourceStartSeconds), '-t', String(block.durationSeconds), '-i', block.mediaPath)
  args.push('-filter_complex', filterGraph, '-map', '[vout]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath)
  return runProcess(ffmpegPath, args)
}

export async function runTimelineExport(options: RunTimelineExportOptions): Promise<RunTimelineExportResult> {
  const copy = getAppCopy(options.getLocale?.())
  const clips = normalizeClips(options.clips)
  if (clips.length === 0) throw new Error('时间线没有可导出的片段')
  if (options.mode === 'burn-subtitle' && !(await probeFfmpegCapabilities(options.ffmpegPath)).subtitleBurnIn) throw new Error(copy.runtime.clipExportSubtitleBurnInUnavailable)
  const subtitleText = options.mode === 'video' ? null : await resolveSubtitleText(options)
  if (options.mode !== 'video' && !subtitleText && !options.subtitleAssText?.trim()) throw new Error(copy.runtime.clipExportSubtitleMissing)
  const tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-timeline-'))

  try {
    await mkdir(dirname(options.outputVideoPath), { recursive: true })
    const segmentPaths: string[] = []
    const useXfadeTransitions = clips.some((clip) => getEditingClipTransition(clip)?.type !== undefined && getEditingClipTransition(clip)?.type !== 'fade')
    for (const [index, clip] of clips.entries()) {
      const segmentPath = join(tempDirectory, `segment-${String(index).padStart(4, '0')}.mp4`)
      const nextTransition = useXfadeTransitions ? null : clips[index + 1] ? getEditingClipTransition(clips[index + 1]!) : null
      const previousFramingState = index > 0 ? getEditingFramingState(clips[index - 1]!) : null
      const currentFramingState = getEditingFramingState(clip)
      const framingTransition = previousFramingState ? getEditingFramingTransition(previousFramingState, currentFramingState, clip.durationSeconds) : null
      const result = await runProcess(options.ffmpegPath, buildTimelineSegmentArgs(clip, segmentPath, options.outputFormat, nextTransition?.durationSeconds ?? 0, !useXfadeTransitions, framingTransition ?? undefined))
      if (result.code !== 0) throw new Error(`${copy.runtime.clipExportFailed}：${tailOutput(result.output)}`)
      segmentPaths.push(segmentPath)
    }

    const listPath = join(tempDirectory, 'segments.txt')
    await writeFile(listPath, `${segmentPaths.map((path) => `file '${escapeConcatPath(path)}'`).join('\n')}\n`, 'utf8')
    const remappedSubtitleText = buildTimelineSubtitleText({ editedSubtitleText: options.subtitleText, sourceSubtitleText: subtitleText, clips })
    const subtitlePath = (remappedSubtitleText != null || options.subtitleAssText?.trim()) ? join(tempDirectory, options.mode === 'burn-subtitle' ? 'timeline.ass' : 'timeline.srt') : null
    if (subtitlePath) {
      const content = options.mode === 'burn-subtitle' && options.subtitleAssText?.trim()
        ? options.subtitleAssText
        : options.mode === 'burn-subtitle'
          ? buildAssSubtitle(remappedSubtitleText ?? '', { ...options.subtitleRender, playResX: options.outputFormat?.width, playResY: options.outputFormat?.height })
          : remappedSubtitleText ?? ''
      await writeFile(subtitlePath, content, 'utf8')
    }

    const timelineDuration = clips.reduce((total, clip) => total + clip.durationSeconds, 0)
    const graphics = (options.graphics ?? []).flatMap((graphic, index) => {
      const startSeconds = Math.max(0, Math.min(timelineDuration, Number.isFinite(graphic.startSeconds) ? graphic.startSeconds : 0))
      const endSeconds = Math.max(startSeconds, Math.min(timelineDuration, startSeconds + (Number.isFinite(graphic.durationSeconds) ? graphic.durationSeconds : 0)))
      return endSeconds - startSeconds > 0.05 && graphic.text.trim() ? [{ ...graphic, id: `${graphic.id}-${index}`, startSeconds, durationSeconds: endSeconds - startSeconds }] : []
    })
    const graphicAssets = graphics.length > 0
      ? options.renderGraphics
        ? await options.renderGraphics({ graphics, frameId: options.frameId, width: evenDimension(options.outputFormat?.width) ?? 1920, height: evenDimension(options.outputFormat?.height) ?? 1080, outputDirectory: tempDirectory })
        : []
      : []
    if (graphics.length > 0 && graphicAssets.length !== graphics.length) throw new Error(copy.runtime.graphicExportUnavailable)
    const videoBlocks = (options.videoBlocks ?? []).flatMap((block) => {
      const startSeconds = Math.max(0, Math.min(timelineDuration, Number.isFinite(block.startSeconds) ? block.startSeconds : 0))
      const durationSeconds = Math.max(0, Math.min(timelineDuration - startSeconds, Number.isFinite(block.durationSeconds) ? block.durationSeconds : 0))
      const sourceStartSeconds = Math.max(0, Number.isFinite(block.sourceStartSeconds) ? block.sourceStartSeconds : 0)
      const sourceEndSeconds = Math.max(sourceStartSeconds, Number.isFinite(block.sourceEndSeconds) ? block.sourceEndSeconds : sourceStartSeconds + durationSeconds)
      return durationSeconds > 0.05 && sourceEndSeconds > sourceStartSeconds && block.mediaPath.trim() ? [{ ...block, startSeconds, durationSeconds: Math.min(durationSeconds, sourceEndSeconds - sourceStartSeconds), sourceStartSeconds, sourceEndSeconds }] : []
    })
    const compositionFilter = buildTimelineOverlayFilter(graphics, graphicAssets, videoBlocks, evenDimension(options.outputFormat?.width) ?? 1920, evenDimension(options.outputFormat?.height) ?? 1080, options.overlayTrackOrder, options.mode === 'burn-subtitle' ? subtitlePath ?? undefined : undefined)
    const needsPostProcess = options.mode === 'burn-subtitle' || compositionFilter.length > 0
    const combinedPath = needsPostProcess ? join(tempDirectory, 'combined.mp4') : options.outputVideoPath
    const transitionArgs = useXfadeTransitions ? buildTimelineXfadeArgs(segmentPaths, clips, combinedPath, options.outputFormat) : []
    const concatResult = await runProcess(options.ffmpegPath, transitionArgs.length > 0 ? transitionArgs : buildTimelineConcatArgs(listPath, combinedPath))
    if (concatResult.code !== 0) throw new Error(`${copy.runtime.clipExportFailed}：${tailOutput(concatResult.output)}`)

    if (needsPostProcess) {
      const burnResult = compositionFilter.length > 0
        ? await renderTimelineVideo(options.ffmpegPath, combinedPath, options.outputVideoPath, compositionFilter, graphicAssets, videoBlocks, timelineDuration)
        : await renderTimelineVideo(options.ffmpegPath, combinedPath, options.outputVideoPath, '[0:v]null[vout]', [], [], timelineDuration)
      if (burnResult.code !== 0) throw new Error(`${copy.runtime.clipExportFailed}：${tailOutput(burnResult.output)}`)
    }

    if ((options.mode === 'external-subtitle' || options.mode === 'translation-subtitle') && remappedSubtitleText != null) {
      const subtitleSrtPath = buildClipExportSubtitlePath(options.outputVideoPath)
      await writeFile(subtitleSrtPath, remappedSubtitleText, 'utf8')
      return { videoPath: options.outputVideoPath, subtitleSrtPath }
    }
    return { videoPath: options.outputVideoPath }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true })
  }
}
