const PERSON_MATTE_PREVIEW_CACHE_LIMIT = 48
const previewMaskCache = new Map<string, string>()

/** Derives a blurred alpha mask without touching the video's RGB pixels. */
export async function createPersonMattePreviewMask(sourceUrl: string, featherPixels: number): Promise<string> {
  if (featherPixels <= 0) return sourceUrl
  const cacheKey = `${sourceUrl}|${featherPixels}`
  const cached = previewMaskCache.get(cacheKey)
  if (cached) return cached

  const image = new Image()
  image.decoding = 'async'
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('人物抠像 mask 预览加载失败'))
    image.src = sourceUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const context = canvas.getContext('2d')
  if (!context || canvas.width <= 0 || canvas.height <= 0) return sourceUrl
  context.filter = `blur(${featherPixels}px)`
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const previewUrl = canvas.toDataURL('image/png')
  previewMaskCache.set(cacheKey, previewUrl)
  while (previewMaskCache.size > PERSON_MATTE_PREVIEW_CACHE_LIMIT) {
    const oldestKey = previewMaskCache.keys().next().value
    if (!oldestKey) break
    previewMaskCache.delete(oldestKey)
  }
  return previewUrl
}
