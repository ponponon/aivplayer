import { useEffect } from 'react'
import type { AppModel } from './app-types'

export function useAsrCheckpointEffect(model: AppModel): void {
  useEffect(() => {
    const mediaPath = model.state.currentFile?.path
    const modelId = model.asrStatus?.recommendedModelManifest.id

    if (model.isAsrBusy || !mediaPath || !modelId) {
      model.setAsrCheckpoint(null)
      return
    }

    let cancelled = false
    void window.aiv.resolveAsrSubtitleCheckpoint({ mediaPath, modelId }).then((result) => {
      if (cancelled) return
      model.setAsrCheckpoint(result.success && result.available ? result : null)
    }).catch(() => {
      if (!cancelled) model.setAsrCheckpoint(null)
    })

    return () => { cancelled = true }
  }, [model.state.currentFile?.path, model.asrStatus?.recommendedModelManifest.id, model.isAsrBusy])
}
