import { useEffect } from 'react'
import type { AppModel } from './app-types'

export function useMediaMetadataEffect(model: AppModel): void {
  useEffect(() => {
    const filePath = model.state.currentFile?.path
    if (!filePath) { model.setMediaMetadata(null); return }
    let cancelled = false
    model.setMediaMetadata(null)
    void window.aiv.getMediaMetadata(filePath).then((metadata) => {
      if (!cancelled) model.setMediaMetadata(metadata)
    }).catch(() => {
      if (!cancelled) model.setMediaMetadata(null)
    })
    return () => { cancelled = true }
  }, [model.state.currentFile?.path])

  useEffect(() => {
    if (!model.state.currentFile) model.setIsMediaDetailsDialogOpen(false)
  }, [model.state.currentFile])
}
