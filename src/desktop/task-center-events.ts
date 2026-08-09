import { app } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { TaskCenterEvent } from '../shared/task-center-types'
import type { AsrJobProgress } from '../shared/asr-types'
import { createAsrTaskCenterEvent } from '../core/tasks/task-center-adapters'
import { TaskCenterStore } from '../core/tasks/task-center-store'
import { desktopState } from './desktop-state'

export function getTaskCenterStore(): TaskCenterStore {
  if (!desktopState.taskCenterStore) desktopState.taskCenterStore = new TaskCenterStore(app.getPath('userData'))
  return desktopState.taskCenterStore
}

export function sendTaskCenterEvent(event: TaskCenterEvent): void {
  getTaskCenterStore().record(event)
  const sender = desktopState.mainWindow?.webContents
  if (sender && !sender.isDestroyed()) sender.send(IPC_CHANNELS.TASK_CENTER_EVENT, event)
}

export function sendAsrTaskCenterEvent(progress: AsrJobProgress): void {
  sendTaskCenterEvent(createAsrTaskCenterEvent(progress))
}
