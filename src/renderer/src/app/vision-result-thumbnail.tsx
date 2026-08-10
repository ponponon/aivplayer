import { useState, type SyntheticEvent } from 'react'
import { projectVisionObjectDetectionBox } from '../../../core/ai/vision-object-detection-box'
import type { VisionObjectDetectionBox } from '../../../shared/vision-object-detection-types'

type VisionResultThumbnailProps = {
  src: string
  alt: string
  box?: VisionObjectDetectionBox
}

export function VisionResultThumbnail({ src, alt, box }: VisionResultThumbnailProps): React.ReactElement {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const projection = box && imageSize
    ? projectVisionObjectDetectionBox(box, imageSize.width, imageSize.height)
    : null

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>): void => {
    const { naturalWidth, naturalHeight } = event.currentTarget
    setImageSize(naturalWidth > 0 && naturalHeight > 0 ? { width: naturalWidth, height: naturalHeight } : null)
  }

  return (
    <span className="vision-result-thumbnail">
      <img src={src} alt={alt} onLoad={handleLoad} />
      {projection ? <span
        className="vision-result-box"
        aria-hidden="true"
        style={{
          left: `${projection.left}%`,
          top: `${projection.top}%`,
          width: `${projection.width}%`,
          height: `${projection.height}%`
        }}
      /> : null}
    </span>
  )
}
