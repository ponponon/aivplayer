import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

export function useSubtitleFileActions(model: AppModel, derived: AppDerived) {
  const showFailure = (message: string): void => model.setAsrNotice({ success: false, message })
  const openSubtitleFolder = async (): Promise<void> => {
    if (!derived.subtitlePath) return
    if (!(await window.aiv.showItemInFolder(derived.subtitlePath))) showFailure(derived.copy.messages.noSubtitleFolder)
  }
  const openSubtitleSrtFile = async (): Promise<void> => {
    if (!derived.subtitleSrtPath) return
    if (!(await window.aiv.openPath(derived.subtitleSrtPath))) showFailure(derived.copy.messages.noSrtFile)
  }
  const openTranslatedSubtitleSrtFile = async (): Promise<void> => {
    if (!derived.translatedSubtitleSrtPath) return
    if (!(await window.aiv.openPath(derived.translatedSubtitleSrtPath))) showFailure(derived.copy.messages.noSrtFile)
  }
  const exportSubtitleSrtFile = async (): Promise<void> => {
    if (!derived.subtitlePath) return
    model.setAsrNotice(await window.aiv.exportAsrSubtitleSrt({ subtitlePath: derived.subtitlePath, subtitleSrtPath: derived.subtitleSrtPath ?? undefined }))
  }
  const copyPath = async (path: string | null): Promise<void> => {
    if (path) model.setAsrNotice(await window.aiv.copyTextToClipboard({ text: path }))
  }
  const copySubtitleSrtPath = (): Promise<void> => copyPath(derived.subtitleSrtPath)
  const copySubtitleVttPath = (): Promise<void> => copyPath(derived.subtitlePath)
  const copyTranslatedSubtitleSrtPath = (): Promise<void> => copyPath(derived.translatedSubtitleSrtPath)
  const copyTranslatedSubtitleVttPath = (): Promise<void> => copyPath(derived.translatedSubtitlePath)
  const openAsrLogDirectory = async (): Promise<void> => {
    if (!(await window.aiv.openAsrLogDirectory())) showFailure(derived.copy.asrPanel.openLogsFailed)
  }
  return { openSubtitleFolder, openSubtitleSrtFile, openTranslatedSubtitleSrtFile, exportSubtitleSrtFile, copySubtitleSrtPath, copySubtitleVttPath, copyTranslatedSubtitleSrtPath, copyTranslatedSubtitleVttPath, openAsrLogDirectory }
}
