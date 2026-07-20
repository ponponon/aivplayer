import { getOutputMime } from './image-editor-formatters'
import type { ImageAsset, ImageSettings, RenderedImage } from './image-editor-types'

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成图片数据')), mime, quality)
  })
}

export async function renderImageToBlob(image: ImageAsset, settings: ImageSettings, scale = 1, quality = settings.quality): Promise<RenderedImage> {
  const width = Math.max(1, Math.round(settings.width * scale))
  const height = Math.max(1, Math.round(settings.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前环境不支持 Canvas')
  if (getOutputMime(settings.format, image.mimeType) === 'image/jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
  }
  context.save()
  context.translate(width / 2, height / 2)
  context.rotate((settings.rotation * Math.PI) / 180)
  context.scale(settings.flipX ? -1 : 1, settings.flipY ? -1 : 1)
  const drawWidth = settings.rotation === 90 || settings.rotation === 270 ? height : width
  const drawHeight = settings.rotation === 90 || settings.rotation === 270 ? width : height
  context.drawImage(image.element, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  context.restore()
  const mime = getOutputMime(settings.format, image.mimeType)
  const blob = await canvasToBlob(canvas, mime, quality)
  return { blob, width, height, quality }
}

export async function renderForTargetSize(image: ImageAsset, settings: ImageSettings): Promise<RenderedImage> {
  if (!settings.useTargetSize || settings.targetSizeBytes <= 0) return renderImageToBlob(image, settings)
  let scale = 1
  let fallback = await renderImageToBlob(image, settings, scale, 0.08)
  for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
    const mime = getOutputMime(settings.format, image.mimeType)
    if (mime === 'image/png') {
      fallback = await renderImageToBlob(image, settings, scale, 1)
      if (fallback.blob.size <= settings.targetSizeBytes) return fallback
    } else {
      let low = 0.08
      let high = 1
      for (let pass = 0; pass < 7; pass += 1) {
        const quality = (low + high) / 2
        const candidate = await renderImageToBlob(image, settings, scale, quality)
        if (candidate.blob.size <= settings.targetSizeBytes) { fallback = candidate; low = quality } else high = quality
      }
      if (fallback.blob.size <= settings.targetSizeBytes) return fallback
    }
    const ratio = Math.sqrt(settings.targetSizeBytes / Math.max(fallback.blob.size, 1)) * 0.9
    scale *= Math.max(0.45, Math.min(0.9, ratio))
  }
  return fallback
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片数据失败'))
    reader.readAsDataURL(blob)
  })
}
