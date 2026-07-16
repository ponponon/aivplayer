import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { BatchSubtitleJob, MediaFile } from '../../../shared/media-types'

type BatchPanelActionOptions = {
  copy: LocaleCopy
  directoryPath: string | null
  includeSubfolders: boolean
  activeJob: boolean
  setDirectoryPath: (path: string | null) => void
  setFiles: (files: MediaFile[]) => void
  setSelectedPaths: Dispatch<SetStateAction<Set<string>>>
  setIsScanning: (value: boolean) => void
  setNotice: (value: string | null) => void
  setJob: (job: BatchSubtitleJob | null) => void
  setHistoryNotice: (value: string | null) => void
}

export function useBatchPanelActions(options: BatchPanelActionOptions) {
  const {
    copy,
    directoryPath,
    includeSubfolders,
    activeJob,
    setDirectoryPath,
    setFiles,
    setSelectedPaths,
    setIsScanning,
    setNotice,
    setJob,
    setHistoryNotice
  } = options

  const scanDirectory = useCallback(async (path: string): Promise<void> => {
    setIsScanning(true)
    setNotice(null)
    try {
      const files = await window.aiv.scanBatchSubtitleDirectory({ directoryPath: path, recursive: includeSubfolders })
      setDirectoryPath(path)
      setFiles(files)
      setSelectedPaths(new Set(files.map((file) => file.path)))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setIsScanning(false)
    }
  }, [includeSubfolders, setDirectoryPath, setFiles, setIsScanning, setNotice, setSelectedPaths])

  const chooseFolder = useCallback(async (): Promise<void> => {
    const path = await window.aiv.openFolderPicker({ title: copy.batchSubtitle.chooseFolder, defaultPath: directoryPath })
    if (path) await scanDirectory(path)
  }, [copy.batchSubtitle.chooseFolder, directoryPath, scanDirectory])

  const toggleSelectedFile = useCallback((filePath: string): void => {
    if (activeJob) return
    setSelectedPaths((current) => {
      const next = new Set(current)
      next.has(filePath) ? next.delete(filePath) : next.add(filePath)
      return next
    })
  }, [activeJob, setSelectedPaths])

  const pauseOrResume = useCallback(async (job: BatchSubtitleJob | null): Promise<void> => {
    setJob(job?.status === 'paused' ? await window.aiv.resumeBatchSubtitle() : await window.aiv.pauseBatchSubtitle())
  }, [setJob])

  const cancelBatch = useCallback(async (): Promise<void> => {
    setJob(await window.aiv.cancelBatchSubtitle())
  }, [setJob])

  const retryFailed = useCallback(async (retryableOnly = false): Promise<void> => {
    setJob(await window.aiv.retryFailedBatchSubtitle(retryableOnly))
  }, [setJob])

  const retryHistory = useCallback(async (jobId: string, retryableOnly = false): Promise<void> => {
    setHistoryNotice(null)
    try {
      setJob(await window.aiv.retryHistoryBatchSubtitle(jobId, retryableOnly))
    } catch (error) {
      setHistoryNotice(error instanceof Error ? error.message : copy.batchSubtitle.historyLoadFailed)
    }
  }, [copy.batchSubtitle.historyLoadFailed, setHistoryNotice, setJob])

  const openLogDirectory = useCallback(async (): Promise<void> => {
    if (!(await window.aiv.openBatchSubtitleLogDirectory())) setNotice(copy.batchSubtitle.openLogsFailed)
  }, [copy.batchSubtitle.openLogsFailed, setNotice])

  return { scanDirectory, chooseFolder, toggleSelectedFile, pauseOrResume, cancelBatch, retryFailed, retryHistory, openLogDirectory }
}
