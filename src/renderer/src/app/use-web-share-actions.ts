import { useEffect } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { AppModel } from './app-types'

export function useWebShareActions(model: AppModel, copy: LocaleCopy) {
  useEffect(() => {
    let active = true
    void window.aiv.getWebShareStatus().then((status) => {
      if (active) model.setWebShareStatus(status)
    }).catch(() => undefined)
    return () => { active = false }
  }, [model.setWebShareStatus])

  const openWebShareDialog = (): void => {
    model.setWebShareError(null)
    model.setWebShareNotice(null)
    model.setIsWebShareDialogOpen(true)
  }

  const startWebShare = async (): Promise<void> => {
    if (model.state.playlist.length === 0) {
      model.setWebShareError(copy.webShare.noFiles)
      model.setWebShareNotice(null)
      model.setIsWebShareDialogOpen(true)
      return
    }
    model.setWebShareError(null)
    model.setWebShareNotice(null)
    try {
      const status = await window.aiv.startWebShare({ filePaths: model.state.playlist.map((file) => file.path) })
      model.setWebShareStatus(status)
      model.setIsWebShareDialogOpen(true)
    } catch (error) {
      model.setWebShareError(error instanceof Error ? error.message : String(error))
      model.setWebShareNotice(null)
      model.setIsWebShareDialogOpen(true)
    }
  }

  const stopWebShare = async (): Promise<void> => {
    try {
      model.setWebShareStatus(await window.aiv.stopWebShare())
    } catch (error) {
      model.setWebShareError(error instanceof Error ? error.message : String(error))
      model.setWebShareNotice(null)
    }
  }

  const copyWebShareUrl = async (url: string): Promise<void> => {
    const result = await window.aiv.copyTextToClipboard({ text: url })
    model.setWebShareError(result.success ? null : result.message)
    model.setWebShareNotice(result.success ? copy.webShare.copied : null)
  }

  return { openWebShareDialog, startWebShare, stopWebShare, copyWebShareUrl }
}
