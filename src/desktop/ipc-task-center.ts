import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getTaskCenterStore } from './task-center-events'

export function registerTaskCenterIpc(): void {
  ipcMain.handle(IPC_CHANNELS.TASK_CENTER_LIST, () => getTaskCenterStore().list())
  ipcMain.handle(IPC_CHANNELS.TASK_CENTER_CLEAR_FINISHED, async () => {
    const store = getTaskCenterStore()
    store.clearFinished()
    await store.flush()
  })
}
