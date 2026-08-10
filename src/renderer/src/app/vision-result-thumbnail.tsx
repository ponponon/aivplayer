import { useState, type SyntheticEvent } from 'react'
import { projectVisionObjectDetectionBox } from '../../../core/ai/vision-object-detection-box'
import type { VisionObjectDetectionBox } from '../../../shared/vision-object-detection-types'

type VisionResultThumbnailProps = {
  src: string
  alt: string
  box?: VisionObjectDetectionBox
  boxes?: readonly VisionObjectDetectionBox[]
  className?: string
}

export function VisionResultThumbnail({ src, alt, box, boxes, className }: VisionResultThumbnailProps): React.ReactElement {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const boxesToRender = boxes ?? (box ? [box] : [])

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>): void => {
    const { naturalWidth, naturalHeight } = event.currentTarget
    setImageSize(naturalWidth > 0 && naturalHeight > 0 ? { width: naturalWidth, height: naturalHeight } : null)
  }

  return (
    <span className={`vision-result-thumbnail${className ? ` ${className}` : ''}`}>
      <img src={src} alt={alt} onLoad={handleLoad} />
      {imageSize ? boxesToRender.map((nextBox, index) => {
        const projection = projectVisionObjectDetectionBox(nextBox, imageSize.width, imageSize.height)
        return projection ? <span
          className="vision-result-box"
          key={`${projection.left}-${projection.top}-${projection.width}-${projection.height}-${index}`}
          aria-hidden="true"
          style={{
            left: `${projection.left}%`,
            top: `${projection.top}%`,
            width: `${projection.width}%`,
            height: `${projection.height}%`
          }}
        /> : null
      }) : null}
    </span>
  )
}
