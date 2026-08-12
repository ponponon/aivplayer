import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppController } from './app-context'
import type { MediaImportInboxBatchAction, MediaImportInboxDirectoriesChangedEvent, MediaImportInboxItem, MediaImportInboxMetadataPatch, MediaImportInboxPipelineProgress, MediaImportInboxScanProgress } from '../../../shared/media-import-inbox'

function formatError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export function useVisionImportInbox(app: AppController) {
  const directories = app.appSettings.media.importInboxDirectories
  const writeSidecars = app.appSettings.media.importInboxWriteSidecars
  const directoryKey = useMemo(() => directories.join('\u0000'), [directories])
  const [items, setItems] = useState<MediaImportInboxItem[]>([])
  const [progress, setProgress] = useState<MediaImportInboxScanProgress | null>(null)
  const [pipelineProgress, setPipelineProgress] = useState<MediaImportInboxPipelineProgress | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  const refresh = useCallback(async (scanDirectories: string[]): Promise<void> => {
    if (busyRef.current || scanDirectories.length === 0) return
    busyRef.current = true
    setIsBusy(true)
    setError(null)
    setProgress(null)
    try {
      const response = await window.aiv.scanMediaImportInbox({ directories: scanDirectories, recursive: true })
      setItems(response.items)
    } catch (reason: unknown) {
      setError(formatError(reason))
    } finally {
      busyRef.current = false
      setIsBusy(false)
    }
  }, [])

  useEffect(() => {
    const removeProgress = window.aiv.onMediaImportInboxProgress((next) => setProgress(next))
    const removeItemChanged = window.aiv.onMediaImportInboxItemChanged((next) => {
      setItems((current) => current.some((item) => item.id === next.id)
        ? current.map((item) => item.id === next.id ? next : item)
        : [...current, next])
    })
    const removePipelineProgress = window.aiv.onMediaImportInboxPipelineProgress((next) => setPipelineProgress(next))
    return () => {
      removeProgress()
      removeItemChanged()
      removePipelineProgress()
    }
  }, [])

  useEffect(() => {
    let active = true
    const watchRequest = { directories: [...directories], recursive: true }
    void window.aiv.startMediaImportInboxWatch(watchRequest).catch(() => undefined)
    void window.aiv.listMediaImportInbox().then((next) => {
      if (active) setItems(next)
    }).catch(() => undefined)
    const removeChanges = window.aiv.onMediaImportInboxDirectoriesChanged((event: MediaImportInboxDirectoriesChangedEvent) => {
      if (active) void refresh(event.directories)
    })
    if (directories.length > 0) void refresh([...directories])
    return () => {
      active = false
      removeChanges()
      void window.aiv.stopMediaImportInboxWatch()
    }
  }, [directoryKey, directories, refresh])

  const addFolder = useCallback(async (): Promise<void> => {
    const directoryPath = await window.aiv.openFolderPicker({ title: app.copy.vision.inboxChooseFolder }).catch(() => null)
    if (!directoryPath) return
    app.patchAppSettingsSection('media', (current) => current.importInboxDirectories.includes(directoryPath)
      ? current
      : { ...current, importInboxDirectories: [...current.importInboxDirectories, directoryPath] })
  }, [app])

  const removeFolder = useCallback((directoryPath: string): void => {
    app.patchAppSettingsSection('media', (current) => ({
      ...current,
      importInboxDirectories: current.importInboxDirectories.filter((path) => path !== directoryPath)
    }))
  }, [app])

  const transition = useCallback(async (item: MediaImportInboxItem, status: 'ignored' | 'queued' | 'discovered' | 'failed', transitionError?: string): Promise<MediaImportInboxItem | null> => {
    const next = await window.aiv.transitionMediaImportInbox({ itemId: item.id, status, error: transitionError })
    if (next) setItems((current) => current.map((candidate) => candidate.id === next.id ? next : candidate))
    return next
  }, [])

  const queueItem = useCallback(async (item: MediaImportInboxItem): Promise<void> => {
    await transition(item, 'queued')
  }, [transition])

  const retryItem = useCallback(async (item: MediaImportInboxItem): Promise<void> => {
    const discovered = await transition(item, 'discovered')
    if (discovered) await queueItem(discovered)
  }, [queueItem, transition])

  const transitionBatch = useCallback(async (selectedItems: MediaImportInboxItem[], action: MediaImportInboxBatchAction): Promise<void> => {
    if (selectedItems.length === 0) return
    try {
      const nextItems = await window.aiv.transitionMediaImportInboxBatch({ itemIds: selectedItems.map((item) => item.id), action })
      if (!nextItems) return
      if (action === 'clear') {
        setItems(await window.aiv.listMediaImportInbox())
        return
      }
      const updates = new Map(nextItems.map((item) => [item.id, item]))
      setItems((current) => current.map((item) => updates.get(item.id) ?? item))
    } catch (reason: unknown) {
      setError(formatError(reason))
      throw reason
    }
  }, [])

  const updateMetadata = useCallback(async (item: MediaImportInboxItem, patch: MediaImportInboxMetadataPatch): Promise<void> => {
    try {
      const next = await window.aiv.updateMediaImportInboxMetadata({ itemId: item.id, patch, writeSidecar: writeSidecars })
      if (next) setItems((current) => current.map((candidate) => candidate.id === next.id ? next : candidate))
    } catch (reason: unknown) {
      setError(formatError(reason))
    }
  }, [writeSidecars])

  return {
    directories,
    items,
    progress,
    pipelineProgress,
    isBusy,
    error,
    writeSidecars,
    setWriteSidecars: (value: boolean) => app.patchAppSettingsSection('media', { importInboxWriteSidecars: value }),
    addFolder,
    removeFolder,
    scan: () => void refresh([...directories]),
    queueItem: (item: MediaImportInboxItem) => void queueItem(item),
    ignoreItem: (item: MediaImportInboxItem) => void transition(item, 'ignored'),
    retryItem: (item: MediaImportInboxItem) => void retryItem(item),
    batchQueue: (selectedItems: MediaImportInboxItem[]) => transitionBatch(selectedItems, 'queue'),
    batchIgnore: (selectedItems: MediaImportInboxItem[]) => transitionBatch(selectedItems, 'ignore'),
    batchRetry: (selectedItems: MediaImportInboxItem[]) => transitionBatch(selectedItems, 'retry'),
    batchClear: (selectedItems: MediaImportInboxItem[]) => transitionBatch(selectedItems, 'clear'),
    updateMetadata: (item: MediaImportInboxItem, patch: MediaImportInboxMetadataPatch) => void updateMetadata(item, patch)
  }
}
