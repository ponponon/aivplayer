import type { EditingVideoBlock, EditingVideoBlockMotion, EditingVideoBlockPosition } from '../../shared/editing-types'

export const EDITING_VIDEO_BLOCK_DEFAULT_DURATION = 3
export const EDITING_VIDEO_BLOCK_MIN_DURATION = 0.2
export const EDITING_VIDEO_BLOCK_MIN_SIZE_PERCENT = 20
export const EDITING_VIDEO_BLOCK_MAX_SIZE_PERCENT = 80
export const EDITING_VIDEO_BLOCK_DEFAULT_CORNER_SIZE_PERCENT = 32
export const EDITING_VIDEO_BLOCK_DEFAULT_SPLIT_SIZE_PERCENT = 50
export const EDITING_VIDEO_BLOCK_MIN_BORDER_RADIUS = 0
export const EDITING_VIDEO_BLOCK_MAX_BORDER_RADIUS = 64
export const EDITING_VIDEO_BLOCK_DEFAULT_CORNER_BORDER_RADIUS = 8
export const EDITING_VIDEO_BLOCK_DEFAULT_SPLIT_BORDER_RADIUS = 0
export const EDITING_VIDEO_BLOCK_MIN_BORDER_WIDTH = 0
export const EDITING_VIDEO_BLOCK_MAX_BORDER_WIDTH = 8
export const EDITING_VIDEO_BLOCK_DEFAULT_CORNER_BORDER_WIDTH = 2
export const EDITING_VIDEO_BLOCK_DEFAULT_SPLIT_BORDER_WIDTH = 1
export const EDITING_VIDEO_BLOCK_MOTION_MIN_DURATION = 0.1
export const EDITING_VIDEO_BLOCK_MOTION_MAX_DURATION = 1
export const EDITING_VIDEO_BLOCK_MOTION_DEFAULT_DURATION = 0.35
export const EDITING_VIDEO_BLOCK_MOTIONS: readonly EditingVideoBlockMotion[] = ['none', 'fade', 'slide-left', 'slide-right', 'rise', 'scale']

function createVideoBlockId(): string {
  return `video-block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function clampDuration(durationSeconds: number, startSeconds: number, timelineDuration: number): number {
  return Math.max(EDITING_VIDEO_BLOCK_MIN_DURATION, Math.min(Math.max(EDITING_VIDEO_BLOCK_MIN_DURATION, timelineDuration - startSeconds), Number.isFinite(durationSeconds) ? durationSeconds : EDITING_VIDEO_BLOCK_DEFAULT_DURATION))
}

function isSplitPosition(position: EditingVideoBlockPosition): boolean {
  return position === 'split-left' || position === 'split-right'
}

function clampSizePercent(sizePercent: number): number {
  return Math.min(EDITING_VIDEO_BLOCK_MAX_SIZE_PERCENT, Math.max(EDITING_VIDEO_BLOCK_MIN_SIZE_PERCENT, Number.isFinite(sizePercent) ? sizePercent : EDITING_VIDEO_BLOCK_DEFAULT_CORNER_SIZE_PERCENT))
}

function defaultSizePercent(position: EditingVideoBlockPosition): number {
  return isSplitPosition(position) ? EDITING_VIDEO_BLOCK_DEFAULT_SPLIT_SIZE_PERCENT : EDITING_VIDEO_BLOCK_DEFAULT_CORNER_SIZE_PERCENT
}

function clampBorderRadius(borderRadius: number): number {
  return Math.min(EDITING_VIDEO_BLOCK_MAX_BORDER_RADIUS, Math.max(EDITING_VIDEO_BLOCK_MIN_BORDER_RADIUS, Number.isFinite(borderRadius) ? borderRadius : EDITING_VIDEO_BLOCK_DEFAULT_CORNER_BORDER_RADIUS))
}

function clampBorderWidth(borderWidth: number): number {
  return Math.min(EDITING_VIDEO_BLOCK_MAX_BORDER_WIDTH, Math.max(EDITING_VIDEO_BLOCK_MIN_BORDER_WIDTH, Number.isFinite(borderWidth) ? borderWidth : EDITING_VIDEO_BLOCK_DEFAULT_CORNER_BORDER_WIDTH))
}

function clampMotionDuration(durationSeconds: number): number {
  return Math.min(EDITING_VIDEO_BLOCK_MOTION_MAX_DURATION, Math.max(EDITING_VIDEO_BLOCK_MOTION_MIN_DURATION, Number.isFinite(durationSeconds) ? durationSeconds : EDITING_VIDEO_BLOCK_MOTION_DEFAULT_DURATION))
}

export function getEditingVideoBlockSize(block: Pick<EditingVideoBlock, 'position' | 'sizePercent'>): number {
  return clampSizePercent(block.sizePercent ?? defaultSizePercent(block.position))
}

export function getEditingVideoBlockBorderRadius(block: Pick<EditingVideoBlock, 'position' | 'borderRadius'>): number {
  return clampBorderRadius(block.borderRadius ?? (isSplitPosition(block.position) ? EDITING_VIDEO_BLOCK_DEFAULT_SPLIT_BORDER_RADIUS : EDITING_VIDEO_BLOCK_DEFAULT_CORNER_BORDER_RADIUS))
}

export function getEditingVideoBlockBorderWidth(block: Pick<EditingVideoBlock, 'position' | 'borderWidth'>): number {
  return clampBorderWidth(block.borderWidth ?? (isSplitPosition(block.position) ? EDITING_VIDEO_BLOCK_DEFAULT_SPLIT_BORDER_WIDTH : EDITING_VIDEO_BLOCK_DEFAULT_CORNER_BORDER_WIDTH))
}

export function getEditingVideoBlockMotion(block: Pick<EditingVideoBlock, 'enterMotion' | 'exitMotion' | 'motionDurationSeconds'>): { enterMotion: EditingVideoBlockMotion; exitMotion: EditingVideoBlockMotion; durationSeconds: number } {
  return { enterMotion: block.enterMotion ?? 'none', exitMotion: block.exitMotion ?? 'none', durationSeconds: clampMotionDuration(block.motionDurationSeconds ?? EDITING_VIDEO_BLOCK_MOTION_DEFAULT_DURATION) }
}

export function getEditingVideoBlockMotionPhase(block: EditingVideoBlock, currentTime: number): { motion: EditingVideoBlockMotion; phase: 'enter' | 'exit'; progress: number } | null {
  const motion = getEditingVideoBlockMotion(block)
  if (motion.enterMotion !== 'none' && currentTime >= block.startSeconds && currentTime < block.startSeconds + motion.durationSeconds) return { motion: motion.enterMotion, phase: 'enter', progress: Math.min(1, Math.max(0, (currentTime - block.startSeconds) / motion.durationSeconds)) }
  if (motion.exitMotion !== 'none' && currentTime >= block.startSeconds + block.durationSeconds && currentTime < block.startSeconds + block.durationSeconds + motion.durationSeconds) return { motion: motion.exitMotion, phase: 'exit', progress: Math.min(1, Math.max(0, (currentTime - block.startSeconds - block.durationSeconds) / motion.durationSeconds)) }
  return null
}

export function isEditingVideoBlockVisible(block: EditingVideoBlock, currentTime: number): boolean {
  const endSeconds = block.startSeconds + block.durationSeconds
  const motion = getEditingVideoBlockMotion(block)
  return (currentTime >= block.startSeconds && currentTime < endSeconds) || (motion.exitMotion !== 'none' && currentTime >= endSeconds && currentTime < endSeconds + motion.durationSeconds)
}

export function createEditingVideoBlock(sourceId: string, sourceDurationSeconds: number, startSeconds: number, timelineDuration: number, options: { sourceStartSeconds?: number; durationSeconds?: number; position?: EditingVideoBlockPosition; sizePercent?: number; borderRadius?: number; borderWidth?: number; enterMotion?: EditingVideoBlockMotion; exitMotion?: EditingVideoBlockMotion; motionDurationSeconds?: number; id?: string } = {}): EditingVideoBlock | null {
  const safeSourceDuration = Math.max(0, Number.isFinite(sourceDurationSeconds) ? sourceDurationSeconds : 0)
  const safeTimelineDuration = Math.max(0, Number.isFinite(timelineDuration) ? timelineDuration : 0)
  const sourceStartSeconds = Math.min(Math.max(0, Number.isFinite(options.sourceStartSeconds) ? options.sourceStartSeconds! : 0), Math.max(0, safeSourceDuration - EDITING_VIDEO_BLOCK_MIN_DURATION))
  const safeStart = Math.min(Math.max(0, Number.isFinite(startSeconds) ? startSeconds : 0), Math.max(0, safeTimelineDuration - EDITING_VIDEO_BLOCK_MIN_DURATION))
  const availableDuration = Math.min(safeSourceDuration - sourceStartSeconds, safeTimelineDuration - safeStart)
  if (!sourceId || availableDuration < EDITING_VIDEO_BLOCK_MIN_DURATION) return null
  const durationSeconds = Math.min(clampDuration(options.durationSeconds ?? EDITING_VIDEO_BLOCK_DEFAULT_DURATION, safeStart, safeTimelineDuration), availableDuration)
  const position = options.position ?? 'bottom-right'
  return { id: options.id ?? createVideoBlockId(), sourceId, sourceStartSeconds, sourceEndSeconds: sourceStartSeconds + durationSeconds, startSeconds: safeStart, durationSeconds, position, sizePercent: clampSizePercent(options.sizePercent ?? defaultSizePercent(position)), borderRadius: clampBorderRadius(options.borderRadius ?? (isSplitPosition(position) ? EDITING_VIDEO_BLOCK_DEFAULT_SPLIT_BORDER_RADIUS : EDITING_VIDEO_BLOCK_DEFAULT_CORNER_BORDER_RADIUS)), borderWidth: clampBorderWidth(options.borderWidth ?? (isSplitPosition(position) ? EDITING_VIDEO_BLOCK_DEFAULT_SPLIT_BORDER_WIDTH : EDITING_VIDEO_BLOCK_DEFAULT_CORNER_BORDER_WIDTH)), enterMotion: options.enterMotion ?? 'none', exitMotion: options.exitMotion ?? 'none', motionDurationSeconds: clampMotionDuration(options.motionDurationSeconds ?? EDITING_VIDEO_BLOCK_MOTION_DEFAULT_DURATION) }
}

export function updateEditingVideoBlock(blocks: readonly EditingVideoBlock[], blockId: string, patch: Partial<Pick<EditingVideoBlock, 'startSeconds' | 'durationSeconds' | 'position' | 'sourceStartSeconds' | 'sizePercent' | 'borderRadius' | 'borderWidth' | 'enterMotion' | 'exitMotion' | 'motionDurationSeconds'>>, timelineDuration: number, sourceDurationById: ReadonlyMap<string, number> = new Map()): EditingVideoBlock[] {
  return blocks.map((block) => {
    if (block.id !== blockId) return block
    const startSeconds = Math.min(Math.max(0, Number.isFinite(patch.startSeconds ?? block.startSeconds) ? patch.startSeconds ?? block.startSeconds : block.startSeconds), Math.max(0, timelineDuration - EDITING_VIDEO_BLOCK_MIN_DURATION))
    const sourceDurationSeconds = Math.max(block.sourceEndSeconds, sourceDurationById.get(block.sourceId) ?? block.sourceEndSeconds)
    const sourceStartSeconds = Math.min(Math.max(0, Number.isFinite(patch.sourceStartSeconds ?? block.sourceStartSeconds) ? patch.sourceStartSeconds ?? block.sourceStartSeconds : block.sourceStartSeconds), Math.max(0, sourceDurationSeconds - EDITING_VIDEO_BLOCK_MIN_DURATION))
    const durationSeconds = Math.min(clampDuration(patch.durationSeconds ?? block.durationSeconds, startSeconds, timelineDuration), sourceDurationSeconds - sourceStartSeconds)
    const position = patch.position ?? block.position
    return { ...block, ...(patch.position === undefined ? {} : { position }), ...(patch.sizePercent === undefined ? {} : { sizePercent: clampSizePercent(patch.sizePercent) }), ...(patch.borderRadius === undefined ? {} : { borderRadius: clampBorderRadius(patch.borderRadius) }), ...(patch.borderWidth === undefined ? {} : { borderWidth: clampBorderWidth(patch.borderWidth) }), ...(patch.enterMotion === undefined ? {} : { enterMotion: patch.enterMotion }), ...(patch.exitMotion === undefined ? {} : { exitMotion: patch.exitMotion }), ...(patch.motionDurationSeconds === undefined ? {} : { motionDurationSeconds: clampMotionDuration(patch.motionDurationSeconds) }), startSeconds, sourceStartSeconds, durationSeconds, sourceEndSeconds: sourceStartSeconds + durationSeconds }
  })
}

export function removeEditingVideoBlock(blocks: readonly EditingVideoBlock[], blockId: string): EditingVideoBlock[] {
  return blocks.filter((block) => block.id !== blockId)
}

export function findActiveEditingVideoBlocks(blocks: readonly EditingVideoBlock[], currentTime: number): EditingVideoBlock[] {
  return blocks.filter((block) => currentTime >= block.startSeconds && currentTime < block.startSeconds + block.durationSeconds).sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))
}

export function findVisibleEditingVideoBlocks(blocks: readonly EditingVideoBlock[], currentTime: number): EditingVideoBlock[] {
  return blocks.filter((block) => isEditingVideoBlockVisible(block, currentTime)).sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))
}
