import type { VisionObjectDetectionBox } from '../../shared/vision-object-detection-types'

export type VisionObjectDetectionBoxProjection = {
  left: number
  top: number
  width: number
  height: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Projects detector pixel coordinates into percentages for a thumbnail overlay. */
export function projectVisionObjectDetectionBox(
  box: VisionObjectDetectionBox,
  imageWidth: number,
  imageHeight: number
): VisionObjectDetectionBoxProjection | null {
  if (![imageWidth, imageHeight].every((value) => Number.isFinite(value) && value > 0)) return null
  if (![box.xmin, box.ymin, box.xmax, box.ymax].every((value) => Number.isFinite(value))) return null
  if (box.xmax <= box.xmin || box.ymax <= box.ymin) return null

  const left = clamp(box.xmin, 0, imageWidth)
  const top = clamp(box.ymin, 0, imageHeight)
  const right = clamp(box.xmax, 0, imageWidth)
  const bottom = clamp(box.ymax, 0, imageHeight)
  if (right <= left || bottom <= top) return null

  return {
    left: (left / imageWidth) * 100,
    top: (top / imageHeight) * 100,
    width: ((right - left) / imageWidth) * 100,
    height: ((bottom - top) / imageHeight) * 100
  }
}
