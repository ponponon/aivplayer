import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { ipcMain } from 'electron'
import { createEditingCaptionDirectoryWatcher, type EditingCaptionDirectoryWatcher } from '../core/editing/caption-directory-watcher'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { EditingCaptionFilesChangedEvent, EditingCaptionWatchRequest, EditingCaptionWatchStartResult } from '../shared/editing-caption-watcher'

type WatchState = {
  sender: WebContents
  watcher: EditingCaptionDirectoryWatcher
  onDestroyed: () => void
}

const watchStates = new Map<number, WatchState>()

function asWatchRequest(value: unknown): EditingCaptionWatchRequest {
  if (!value || typeof value !== 'object') return { directories: [], candidatePaths: [] }
  const request = value as Partial<EditingCaptionWatchRequest>
  return {
    directories: Array.isArray(request.directories) ? request.directories.filter((path): path is string => typeof path === 'string') : [],
    candidatePaths: Array.isArray(request.candidatePaths) ? request.candidatePaths.filter((path): path is string => typeof path === 'string') : []
  }
}

function stopEditingCaptionWatcherForSender(sender: WebContents): void {
  const state = watchStates.get(sender.id)
  if (!state) return
  state.watcher.stop()
  sender.removeListener('destroyed', state.onDestroyed)
  watchStates.delete(sender.id)
}

export function registerEditingCaptionWatcherIpc(): void {
  ipcMain.handle(IPC_CHANNELS.EDITING_CAPTION_WATCH_START, (event: IpcMainInvokeEvent, value: unknown): EditingCaptionWatchStartResult => {
    stopEditingCaptionWatcherForSender(event.sender)
    const request = asWatchRequest(value)
    const watcher = createEditingCaptionDirectoryWatcher({
      directories: request.directories,
      candidatePaths: request.candidatePaths,
      onChange: (paths) => {
        if (event.sender.isDestroyed()) return
        const payload: EditingCaptionFilesChangedEvent = { paths: [...paths] }
        event.sender.send(IPC_CHANNELS.EDITING_CAPTION_FILES_CHANGED, payload)
      }
    })
    const onDestroyed = (): void => stopEditingCaptionWatcherForSender(event.sender)
    const state: WatchState = { sender: event.sender, watcher, onDestroyed }
    watchStates.set(event.sender.id, state)
    event.sender.once('destroyed', onDestroyed)
    return { directories: [...request.directories], watchedDirectories: watcher.watchedDirectories }
  })

  ipcMain.handle(IPC_CHANNELS.EDITING_CAPTION_WATCH_STOP, (event: IpcMainInvokeEvent): void => {
    stopEditingCaptionWatcherForSender(event.sender)
  })
}

export function stopEditingCaptionWatcher(): void {
  for (const state of [...watchStates.values()]) stopEditingCaptionWatcherForSender(state.sender)
}
