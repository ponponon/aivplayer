import { useEffect, useRef, useState } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import { createInitialImageSettings, getOutputExtension } from './image-editor-formatters'
import { blobToDataUrl, renderForTargetSize } from './image-editor-render'
import type { ImageAsset, ImageSettings, RenderedImage } from './image-editor-types'

function loadImage(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取图片，请换一个常见格式的图片文件'))
    image.src = sourceUrl
  })
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(avif|bmp|gif|jpe?g|png|webp)$/i.test(file.name)
}

function normalizedExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return extension === 'jpeg' ? 'jpg' : extension
}

export function useImageEditor(copy: LocaleCopy['imageWorkspace']) {
  const [images, setImages] = useState<ImageAsset[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [settings, setSettings] = useState<ImageSettings | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [preview, setPreview] = useState<RenderedImage | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [isBatchExporting, setIsBatchExporting] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const imagesRef = useRef<ImageAsset[]>([])
  const selected = images.find((image) => image.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) { setSettings(null); return }
    setSettings(createInitialImageSettings(selected.width, selected.height, selected.name, selected.mimeType))
    setStatus(null)
  }, [selectedId])

  useEffect(() => {
    if (!selected || !settings) return
    let active = true
    setIsRendering(true)
    void renderForTargetSize(selected, settings).then((result) => {
      if (!active) return
      const nextUrl = URL.createObjectURL(result.blob)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = nextUrl
      setPreviewUrl(nextUrl)
      setPreview(result)
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '图片预览生成失败') }).finally(() => { if (active) setIsRendering(false) })
    return () => { active = false }
  }, [selected?.id, settings?.width, settings?.height, settings?.format, settings?.quality, settings?.useTargetSize, settings?.targetSizeBytes, settings?.rotation, settings?.flipX, settings?.flipY])

  useEffect(() => { imagesRef.current = images }, [images])
  useEffect(() => () => {
    for (const image of imagesRef.current) URL.revokeObjectURL(image.sourceUrl)
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const addFiles = async (files: File[]): Promise<void> => {
    const candidates = files.filter(isImageFile)
    if (candidates.length === 0) { setError('请选择 JPG、PNG、WebP、GIF 或 BMP 图片'); return }
    setError(null)
    const loaded: ImageAsset[] = []
    for (const file of candidates) {
      const sourceUrl = URL.createObjectURL(file)
      try {
        const element = await loadImage(sourceUrl)
        const path = (() => { try { return window.aiv.getPathForFile(file) } catch { return '' } })()
        loaded.push({ id: `${path || file.name}-${file.lastModified}-${file.size}`, file, name: file.name, path, sourceUrl, element, width: element.naturalWidth, height: element.naturalHeight, sizeBytes: file.size, mimeType: file.type || 'image/png' })
      } catch (reason) { URL.revokeObjectURL(sourceUrl); setError(reason instanceof Error ? reason.message : '图片加载失败') }
    }
    if (loaded.length === 0) return
    setImages((current) => { const known = new Set(current.map((image) => image.id)); return [...current, ...loaded.filter((image) => !known.has(image.id))] })
    setSelectedId((current) => current ?? loaded[0].id)
  }

  const removeImage = (imageId: string): void => {
    const removed = images.find((image) => image.id === imageId)
    if (removed) URL.revokeObjectURL(removed.sourceUrl)
    const next = images.filter((image) => image.id !== imageId)
    setImages(next)
    if (selectedId === imageId) setSelectedId(next[0]?.id ?? null)
  }

  const updateSettings = (patch: Partial<ImageSettings>): void => setSettings((current) => current ? { ...current, ...patch } : current)
  const resetSettings = (): void => { if (selected) setSettings(createInitialImageSettings(selected.width, selected.height, selected.name, selected.mimeType)) }
  const canOverwriteOriginal = Boolean(settings && images.length > 0 && images.every((image) => Boolean(image.path) && normalizedExtension(image.name) === getOutputExtension(settings.format, image.name)))
  const exportImage = async (): Promise<void> => {
    if (!selected || !settings || !preview) return
    setStatus(copy.rendering)
    try {
      const rendered = await renderForTargetSize(selected, settings)
      const dataUrl = await blobToDataUrl(rendered.blob)
      const extension = getOutputExtension(settings.format, selected.name)
      const result = await window.aiv.saveImage({ dataUrl, extension, fileName: `${selected.name.replace(/\.[^.]+$/, '')}-edited.${extension}` })
      setStatus(result.success ? copy.exportReady : result.canceled ? null : result.message)
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : '导出失败') }
  }

  const exportAllImages = async (overwriteOriginal: boolean): Promise<void> => {
    if (!settings || images.length === 0 || isBatchExporting) return
    if (overwriteOriginal) {
      if (!canOverwriteOriginal) { setStatus(copy.formatMismatch); return }
      if (!window.confirm(copy.overwriteConfirm(images.length))) return
    }
    let outputDirectoryPath: string | undefined
    if (!overwriteOriginal) {
      const selectedDirectory = await window.aiv.openFolderPicker({ title: copy.chooseOutputFolder })
      if (!selectedDirectory) return
      outputDirectoryPath = selectedDirectory
    }
    setIsBatchExporting(true)
    setBatchProgress({ current: 0, total: images.length })
    let exportedCount = 0
    let failedCount = 0
    for (const [index, image] of images.entries()) {
      setBatchProgress({ current: index + 1, total: images.length })
      try {
        const scale = selected ? settings.width / Math.max(selected.width, 1) : 1
        const imageSettings = settings.lockAspectRatio ? { ...settings, width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale)) } : settings
        const rendered = await renderForTargetSize(image, imageSettings)
        const extension = getOutputExtension(imageSettings.format, image.name)
        const dataUrl = await blobToDataUrl(rendered.blob)
        const result = await window.aiv.saveImage({ dataUrl, extension, fileName: `${image.name.replace(/\.[^.]+$/, '')}-edited.${extension}`, outputDirectoryPath, overwriteOriginal, originalPath: image.path })
        if (result.success) exportedCount += 1
        else if (!result.canceled) failedCount += 1
      } catch { failedCount += 1 }
    }
    setBatchProgress(null)
    setIsBatchExporting(false)
    setStatus(failedCount > 0 ? copy.batchExportFailed(failedCount) : copy.batchExported(exportedCount))
  }

  return { images, selected, selectedId, settings, previewUrl, preview, isRendering, isBatchExporting, batchProgress, canOverwriteOriginal, status, error, setSelectedId, addFiles, removeImage, updateSettings, resetSettings, exportImage, exportAllImages }
}
