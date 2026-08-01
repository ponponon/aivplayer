import { useEffect, useState } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { AppModel } from './app-types'

export function useWebShareActions(model: AppModel, copy: LocaleCopy) {
  const [webShareDirectoryPaths, setWebShareDirectoryPaths] = useState<string[]>([])

  useEffect(() => {
    let active = true
    void window.aiv.getWebShareStatus().then((status) => {
      if (active) {
        model.setWebShareStatus(status)
        setWebShareDirectoryPaths(status.sharedDirectoryPaths)
      }
    }).catch(() => undefined)
    return () => { active = false }
  }, [model.setWebShareStatus])

  const openWebShareDialog = (): void => {
    model.setWebShareError(null)
    model.setWebShareNotice(null)
    model.setIsWebShareDialogOpen(true)
  }

  const getWebShareRequest = (directoryPaths = webShareDirectoryPaths) => ({
    filePaths: model.state.playlist.map((file) => file.path),
    directoryPaths
  })

  const refreshWebShare = async (directoryPaths = webShareDirectoryPaths): Promise<void> => {
    model.setWebShareError(null)
    model.setWebShareNotice(null)
    try {
      model.setWebShareStatus(await window.aiv.refreshWebShare(getWebShareRequest(directoryPaths)))
    } catch (error) {
      model.setWebShareError(error instanceof Error ? error.message : String(error))
    }
  }

  const addWebShareDirectory = async (): Promise<void> => {
    const directoryPath = await window.aiv.openFolderPicker({ title: copy.webShare.chooseFolder })
    if (!directoryPath || webShareDirectoryPaths.includes(directoryPath)) return
    const nextPaths = [...webShareDirectoryPaths, directoryPath]
    setWebShareDirectoryPaths(nextPaths)
    if (model.webShareStatus.running) await refreshWebShare(nextPaths)
  }

  const removeWebShareDirectory = async (directoryPath: string): Promise<void> => {
    const nextPaths = webShareDirectoryPaths.filter((path) => path !== directoryPath)
    setWebShareDirectoryPaths(nextPaths)
    if (model.webShareStatus.running) await refreshWebShare(nextPaths)
  }

  const startWebShare = async (): Promise<void> => {
    if (model.state.playlist.length === 0 && webShareDirectoryPaths.length === 0) {
      model.setWebShareError(copy.webShare.noFiles)
      model.setWebShareNotice(null)
      model.setIsWebShareDialogOpen(true)
      return
    }
    model.setWebShareError(null)
    model.setWebShareNotice(null)
    try {
      const status = await window.aiv.startWebShare(getWebShareRequest())
      model.setWebShareStatus(status)
      setWebShareDirectoryPaths(status.sharedDirectoryPaths)
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

  return {
    openWebShareDialog,
    startWebShare,
    stopWebShare,
    copyWebShareUrl,
    refreshWebShare,
    webShareDirectoryPaths,
    addWebShareDirectory,
    removeWebShareDirectory
  }
}
