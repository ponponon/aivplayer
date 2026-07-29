import { useEffect, useRef } from 'react'
import { findVisibleEditingVideoBlocks, getEditingVideoBlockBorderRadius, getEditingVideoBlockBorderWidth, getEditingVideoBlockMotion, getEditingVideoBlockMotionPhase, getEditingVideoBlockSize } from '../../../core/editing/video-block-operations'
import type { CSSProperties } from 'react'
import type { EditingVideoBlock, EditingVideoBlockPosition } from '../../../shared/editing-types'
import type { MediaFile } from '../../../shared/media-types'

type EditingVideoBlockOverlayProps = {
  blocks: readonly EditingVideoBlock[]
  sourceFiles: Record<string, MediaFile>
  currentTime: number
  isPlaying: boolean
}

function positionClass(position: EditingVideoBlockPosition): string {
  return `is-${position}`
}

function motionStyle(block: EditingVideoBlock, currentTime: number): CSSProperties {
  const phase = getEditingVideoBlockMotionPhase(block, currentTime)
  if (!phase) return {}
  const progress = phase.progress
  const amount = phase.phase === 'enter' ? 1 - progress : progress
  switch (phase.motion) {
    case 'fade': return { opacity: phase.phase === 'enter' ? progress : 1 - progress }
    case 'slide-left': return { transform: `translateX(${-100 * amount}%)` }
    case 'slide-right': return { transform: `translateX(${100 * amount}%)` }
    case 'rise': return { transform: `translateY(${100 * amount}%)` }
    case 'scale': return { transform: `scale(${phase.phase === 'enter' ? 0.82 + 0.18 * progress : 1 - 0.18 * progress})` }
    case 'none': return {}
  }
}

function blockStyle(block: EditingVideoBlock, currentTime: number): CSSProperties {
  const sizePercent = getEditingVideoBlockSize(block)
  const isSplit = block.position === 'split-left' || block.position === 'split-right'
  return { width: `${sizePercent}%`, height: isSplit ? '100%' : `${sizePercent}%`, borderRadius: `${getEditingVideoBlockBorderRadius(block)}px`, borderWidth: `${getEditingVideoBlockBorderWidth(block)}px`, ...motionStyle(block, currentTime) }
}

export function EditingVideoBlockOverlay({ blocks, sourceFiles, currentTime, isPlaying }: EditingVideoBlockOverlayProps): React.ReactElement {
  const visibleBlocks = findVisibleEditingVideoBlocks(blocks, currentTime)
  return <div className="editing-video-block-layer" aria-hidden="true">{visibleBlocks.map((block) => <EditingVideoBlockItem key={block.id} block={block} sourceUrl={sourceFiles[block.sourceId]?.url ?? ''} currentTime={currentTime} isPlaying={isPlaying} positionClass={positionClass(block.position)} />)}</div>
}

function EditingVideoBlockItem({ block, sourceUrl, currentTime, isPlaying, positionClass: position }: { block: EditingVideoBlock; sourceUrl: string; currentTime: number; isPlaying: boolean; positionClass: string }): React.ReactElement | null {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video || !sourceUrl) return
    const sourceTime = Math.max(0, Math.min(block.sourceEndSeconds - block.sourceStartSeconds - 0.01, block.sourceStartSeconds + currentTime - block.startSeconds))
    if (Math.abs(video.currentTime - sourceTime) > 0.08) video.currentTime = sourceTime
    if (isPlaying) void video.play().catch(() => {})
    else video.pause()
  }, [block, currentTime, isPlaying, sourceUrl])
  if (!sourceUrl) return null
  return <video ref={videoRef} className={`editing-video-block ${position}`} style={blockStyle(block, currentTime)} src={sourceUrl} muted playsInline preload="metadata" />
}
