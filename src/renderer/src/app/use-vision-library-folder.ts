import { useEffect, useRef, useState } from 'react'
import type { AppController } from './app-context'
import type { VisionDirectoryBatchScanProgress } from '../../../shared/vision-types'
type UseVisionLibraryFolderOptions = {
  onError: (message: string | null) => void
}
function formatError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
export function useVisionLibraryFolder(app: AppController, isIndexing: boolean, options: UseVisionLibraryFolderOptions) {
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [videoPaths, setVideoPaths] = useState<string[]>([])
  const [includeSubfolders, setIncludeSubfolders] = useState(true)
  const [scanProgress, setScanProgress] = useState<import('../../../shared/vision-types').VisionDirectoryScanProgress | null>(null)
  const [batchScanProgress, setBatchScanProgress] = useState<VisionDirectoryBatchScanProgress | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const batchContextRef = useRef<{ totalDirectories: number; currentDirectoryIndex: number; completedDirectories: number; discoveredVideos: number; failedDirectories: number } | null>(null)
  const isBusy = isIndexing || isScanning
  const savedFolders = app.appSettings.vision.libraryDirectories
  useEffect(() => window.aiv.onVisionDirectoryScanProgress((next) => {
    setScanProgress(next)
    const batch = batchContextRef.current
    if (!batch && next.status === 'scanning') setBatchScanProgress(null)
    if (batch && next.status === 'scanning') {
      setBatchScanProgress({
        status: 'scanning',
        totalDirectories: batch.totalDirectories,
        currentDirectoryIndex: batch.currentDirectoryIndex,
        completedDirectories: batch.completedDirectories,
        discoveredVideos: batch.discoveredVideos + next.discoveredVideos,
        failedDirectories: batch.failedDirectories,
        currentDirectoryPath: next.directoryPath,
        currentPath: next.currentPath
      })
    }
    if (next.status === 'scanning') setIsScanning(true)
    if (!batch && (next.status === 'completed' || next.status === 'cancelled' || next.status === 'error')) setIsScanning(false)
  }), [])
  const scanFolder = (directoryPath: string): void => {
    setIsScanning(true)
    setScanProgress(null)
    setBatchScanProgress(null)
    batchContextRef.current = null
    options.onError(null)
    void window.aiv.scanVisionDirectory({ directoryPath, recursive: includeSubfolders }).then((result) => {
      if (result.status === 'completed') setVideoPaths(result.files)
      if (result.status === 'cancelled') setVideoPaths([])
      setIsScanning(false)
    }).catch((reason: unknown) => {
      setVideoPaths([])
      setIsScanning(false)
      options.onError(formatError(reason))
    })
  }
  const scanAllFolders = (): void => {
    if (isBusy || savedFolders.length === 0) return
    const directories = [...savedFolders]
    const batch = {
      totalDirectories: directories.length,
      currentDirectoryIndex: 0,
      completedDirectories: 0,
      discoveredVideos: 0,
      failedDirectories: 0
    }
    const allFiles = new Set<string>()
    batchContextRef.current = batch
    setIsScanning(true)
    setScanProgress(null)
    setBatchScanProgress({ ...batch, status: 'scanning' })
    setFolderPath(null)
    setVideoPaths([])
    options.onError(null)

    void (async () => {
      let cancelled = false
      for (const [index, directoryPath] of directories.entries()) {
        if (!batchContextRef.current) return
        batch.currentDirectoryIndex = index + 1
        setBatchScanProgress({ ...batch, status: 'scanning', currentDirectoryPath: directoryPath })
        try {
          const result = await window.aiv.scanVisionDirectory({ directoryPath, recursive: includeSubfolders })
          if (result.status === 'cancelled') {
            cancelled = true
            break
          }
          for (const filePath of result.files) allFiles.add(filePath)
          batch.completedDirectories = index + 1
          batch.discoveredVideos = allFiles.size
          setBatchScanProgress({ ...batch, status: 'scanning', currentDirectoryPath: directoryPath })
        } catch {
          batch.failedDirectories += 1
          batch.completedDirectories = index + 1
          setBatchScanProgress({ ...batch, status: 'scanning', currentDirectoryPath: directoryPath })
        }
      }
      setVideoPaths([...allFiles])
      if (!cancelled && allFiles.size > 0) {
        try {
          await window.aiv.enqueueVisionIndex({ mediaPaths: [...allFiles], intervalSeconds: 3 })
        } catch (reason: unknown) {
          options.onError(formatError(reason))
        }
      }
      setBatchScanProgress({ ...batch, status: cancelled ? 'cancelled' : 'completed', discoveredVideos: allFiles.size })
      batchContextRef.current = null
      setIsScanning(false)
    })()
  }
  const chooseFolder = (): void => {
    if (isBusy) return
    void window.aiv.openFolderPicker({ title: app.copy.vision.chooseFolder }).then((directoryPath) => {
      if (!directoryPath) return
      app.patchAppSettingsSection('vision', (current) => current.libraryDirectories.includes(directoryPath) ? current : { ...current, libraryDirectories: [...current.libraryDirectories, directoryPath] })
      setFolderPath(directoryPath)
      setVideoPaths([])
      scanFolder(directoryPath)
    }).catch((reason: unknown) => options.onError(formatError(reason)))
  }
  const useSavedFolder = (directoryPath: string): void => {
    if (isBusy) return
    setFolderPath(directoryPath)
    setVideoPaths([])
    scanFolder(directoryPath)
  }
  const removeSavedFolder = (directoryPath: string): void => {
    if (isBusy) return
    app.patchAppSettingsSection('vision', (current) => ({ ...current, libraryDirectories: current.libraryDirectories.filter((path) => path !== directoryPath) }))
    if (folderPath === directoryPath) {
      setFolderPath(null)
      setVideoPaths([])
    }
  }
  return {
    folderPath,
    videoPaths,
    includeSubfolders,
    setIncludeSubfolders,
    scanProgress,
    batchScanProgress,
    isScanning,
    isBusy,
    savedFolders,
    chooseFolder,
    scanCurrentFolder: () => { if (folderPath) scanFolder(folderPath) },
    scanAllFolders,
    useSavedFolder,
    removeSavedFolder,
  }
}
