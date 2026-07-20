export type ImageFormat = 'original' | 'jpeg' | 'webp' | 'png'

export type ImageAsset = {
  id: string
  file: File
  name: string
  path: string
  sourceUrl: string
  element: HTMLImageElement
  width: number
  height: number
  sizeBytes: number
  mimeType: string
}

export type ImageSettings = {
  width: number
  height: number
  lockAspectRatio: boolean
  format: ImageFormat
  quality: number
  useTargetSize: boolean
  targetSizeBytes: number
  rotation: 0 | 90 | 180 | 270
  flipX: boolean
  flipY: boolean
}

export type RenderedImage = {
  blob: Blob
  width: number
  height: number
  quality: number
}
