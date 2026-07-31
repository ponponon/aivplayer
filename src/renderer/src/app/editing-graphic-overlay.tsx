import type { CSSProperties } from 'react'
import { findActiveEditingGraphics } from '../../../core/editing/graphic-operations'
import { getEditingFrame } from '../../../core/editing/frames'
import { getEditingGraphicTransform, hasEditingGraphicTransform } from '../../../core/editing/graphic-layout'
import type { EditingFrameId, EditingGraphic, EditingGraphicPosition } from '../../../shared/editing-types'

type EditingGraphicOverlayProps = {
  graphics: readonly EditingGraphic[]
  currentTime: number
  frameId?: EditingFrameId
  zIndex?: number
}

function positionStyle(graphic: EditingGraphic, frameGraphicVariant: string): CSSProperties {
  if (hasEditingGraphicTransform(graphic)) {
    const transform = getEditingGraphicTransform(graphic)
    const frameRotation = frameGraphicVariant === 'sticker' ? -1 : 0
    return { left: `${transform.xPercent}%`, top: `${transform.yPercent}%`, width: `${transform.widthPercent}%`, maxWidth: 'none', transform: `translate(-50%, -50%) rotate(${transform.rotationDegrees + frameRotation}deg)` }
  }
  const { position } = graphic
  if (position === 'top-left') return { left: '6%', top: '8%' }
  if (position === 'top-right') return { right: '6%', top: '8%' }
  if (position === 'bottom-left') return { left: '6%', bottom: '8%' }
  if (position === 'bottom-right') return { right: '6%', bottom: '8%' }
  return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
}

export function EditingGraphicOverlay({ graphics, currentTime, frameId, zIndex }: EditingGraphicOverlayProps): React.ReactElement {
  const activeGraphics = findActiveEditingGraphics(graphics, currentTime)
  const frame = getEditingFrame(frameId)
  return <div className={`editing-graphic-layer is-frame-${frame.graphicVariant}`} style={zIndex === undefined ? undefined : { zIndex }} aria-hidden="true">{activeGraphics.map((graphic) => <div className={`editing-graphic-card is-${graphic.style} is-${graphic.position} ${hasEditingGraphicTransform(graphic) ? 'is-free-transform' : ''}`} key={graphic.id} data-editing-graphic-id={graphic.id} style={positionStyle(graphic, frame.graphicVariant)}>{graphic.style === 'title' ? <><strong>{graphic.text}</strong><i /></> : <span>{graphic.text}</span>}</div>)}</div>
}
