import type { CSSProperties } from 'react'
import { findVisibleEditingGraphics } from '../../../core/editing/graphic-operations'
import { getEditingFrame } from '../../../core/editing/frames'
import { getEditingGraphicMotionPhase, getEditingGraphicMotionStyle, type EditingGraphicMotionStyle } from '../../../core/editing/graphic-motion'
import { getEditingGraphicTransform, hasEditingGraphicTransform } from '../../../core/editing/graphic-layout'
import type { EditingFrameId, EditingGraphic, EditingGraphicPosition } from '../../../shared/editing-types'

type EditingGraphicOverlayProps = {
  graphics: readonly EditingGraphic[]
  currentTime: number
  frameId?: EditingFrameId
  zIndex?: number
}

function motionTransform(style: EditingGraphicMotionStyle): string {
  return `translate(${style.translateXPercent}%, ${style.translateYPercent}%) scale(${style.scale})`
}

function hasMotionStyle(style: EditingGraphicMotionStyle): boolean {
  return style.opacity !== 1 || style.translateXPercent !== 0 || style.translateYPercent !== 0 || style.scale !== 1
}

function positionStyle(graphic: EditingGraphic, frameGraphicVariant: string, motion: EditingGraphicMotionStyle): CSSProperties {
  const frameRotation = frameGraphicVariant === 'sticker' ? -1 : 0
  const animated = hasMotionStyle(motion)
  if (hasEditingGraphicTransform(graphic)) {
    const transform = getEditingGraphicTransform(graphic)
    return { left: `${transform.xPercent}%`, top: `${transform.yPercent}%`, width: `${transform.widthPercent}%`, maxWidth: 'none', opacity: motion.opacity, transform: `translate(-50%, -50%) ${motionTransform(motion)} rotate(${transform.rotationDegrees + frameRotation}deg)` }
  }
  const { position } = graphic
  const transform = animated ? `${motionTransform(motion)}${frameRotation === 0 ? '' : ` rotate(${frameRotation}deg)`}` : undefined
  if (position === 'top-left') return { left: '6%', top: '8%', opacity: motion.opacity, ...(transform === undefined ? {} : { transform }) }
  if (position === 'top') return { left: '50%', top: '8%', opacity: motion.opacity, transform: `translateX(-50%)${transform === undefined ? '' : ` ${transform}`}` }
  if (position === 'top-right') return { right: '6%', top: '8%', opacity: motion.opacity, ...(transform === undefined ? {} : { transform }) }
  if (position === 'left') return { left: '6%', top: '50%', opacity: motion.opacity, transform: `translateY(-50%)${transform === undefined ? '' : ` ${transform}`}` }
  if (position === 'right') return { right: '6%', top: '50%', opacity: motion.opacity, transform: `translateY(-50%)${transform === undefined ? '' : ` ${transform}`}` }
  if (position === 'bottom-left') return { left: '6%', bottom: '8%', opacity: motion.opacity, ...(transform === undefined ? {} : { transform }) }
  if (position === 'bottom') return { left: '50%', bottom: '8%', opacity: motion.opacity, transform: `translateX(-50%)${transform === undefined ? '' : ` ${transform}`}` }
  if (position === 'bottom-right') return { right: '6%', bottom: '8%', opacity: motion.opacity, ...(transform === undefined ? {} : { transform }) }
  return { left: '50%', top: '50%', opacity: motion.opacity, transform: `translate(-50%, -50%)${animated ? ` ${transform}` : ''}` }
}

export function EditingGraphicOverlay({ graphics, currentTime, frameId, zIndex }: EditingGraphicOverlayProps): React.ReactElement {
  const activeGraphics = findVisibleEditingGraphics(graphics, currentTime)
  const frame = getEditingFrame(frameId)
  return <div className={`editing-graphic-layer is-frame-${frame.graphicVariant}`} style={zIndex === undefined ? undefined : { zIndex }} aria-hidden="true">{activeGraphics.map((graphic) => { const motion = getEditingGraphicMotionStyle(graphic, currentTime); const phase = getEditingGraphicMotionPhase(graphic, currentTime); return <div className={`editing-graphic-card is-${graphic.style} is-${graphic.position} ${hasEditingGraphicTransform(graphic) ? 'is-free-transform' : ''} ${phase ? `is-motion-${phase.phase}` : ''}`} key={graphic.id} data-editing-graphic-id={graphic.id} style={positionStyle(graphic, frame.graphicVariant, motion)}>{graphic.style === 'title' ? <><strong>{graphic.text}</strong><i /></> : <span>{graphic.text}</span>}</div> })}</div>
}
