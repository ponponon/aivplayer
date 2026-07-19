import { isClipExportLengthSeconds, type ClipExportLengthSeconds, type ClipExportMode } from '../../../shared/clip-export'
import type { MediaClipExportRequest } from '../../../shared/media-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

export function useClipExportActions(model: AppModel, derived: AppDerived, syncPreferences: (length: ClipExportLengthSeconds, mode: ClipExportMode) => void) {
  const openClipExportDialog = (): void => {
    if (model.state.currentFile && !model.isExportingClip) {
      model.videoRef.current?.pause()
      model.setIsClipExportDialogOpen(true)
    }
  }
  const confirmClipExport = async (selection: { startSeconds: number; durationSeconds: number; mode: ClipExportMode }): Promise<void> => {
    const currentFile = model.state.currentFile
    if (!currentFile || model.isExportingClip) return
    if (isClipExportLengthSeconds(selection.durationSeconds)) {
      syncPreferences(selection.durationSeconds, selection.mode)
    }
    model.setIsClipExportDialogOpen(false)
    model.setIsExportingClip(true)
    try {
      const request: MediaClipExportRequest = { mediaPath: currentFile.path, startSeconds: selection.startSeconds, durationSeconds: selection.durationSeconds, mode: selection.mode, subtitlePath: derived.subtitlePath ?? undefined, subtitleSrtPath: derived.subtitleSrtPath ?? undefined }
      const result = await window.aiv.exportMediaClip(request)
      if (!result.canceled) model.setAsrNotice(result)
    } catch (error) {
      model.setAsrNotice({ success: false, message: `${derived.copy.runtime.clipExportFailed}：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      model.setIsExportingClip(false)
    }
  }
  return { openClipExportDialog, confirmClipExport }
}
