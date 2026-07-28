import type { ImageAsset } from './image-editor-types'

function loadImage(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取图片，请换一个常见格式的图片文件'))
    image.src = sourceUrl
  })
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name)
}

export function normalizedExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return extension === 'jpeg' ? 'jpg' : extension
}

function isHeicFile(file: File): boolean {
  return /\.(heic|heif)$/i.test(file.name)
}

function getPathForFile(file: File): string {
  try { return window.aiv.getPathForFile(file) } catch { return '' }
}

export async function loadImageAsset(file: File): Promise<ImageAsset> {
  let sourceUrl = URL.createObjectURL(file)
  const sourceObjectUrl = sourceUrl
  try {
    if (isHeicFile(file)) {
      const filePath = getPathForFile(file)
      if (filePath) {
        const result = await window.aiv.convertHeicToJpeg(filePath)
        if (!result.success || !result.dataUrl) throw new Error(result.error || 'HEIC 转换失败')
        URL.revokeObjectURL(sourceObjectUrl)
        sourceUrl = result.dataUrl
      }
    }
    const element = await loadImage(sourceUrl)
    const path = getPathForFile(file)
    const livePhoto = path ? await window.aiv.probeLivePhoto(path) : null
    const mimeType = isHeicFile(file) ? 'image/jpeg' : file.type || (normalizedExtension(file.name) === 'png' ? 'image/png' : 'image/jpeg')
    return { id: `${path || file.name}-${file.lastModified}-${file.size}`, file, name: file.name, path, sourceUrl, element, width: element.naturalWidth, height: element.naturalHeight, sizeBytes: file.size, mimeType, livePhoto }
  } catch (error) {
    URL.revokeObjectURL(sourceUrl)
    throw error
  }
}

