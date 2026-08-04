export type AppUpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

export type AppUpdateProgress = {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export type AppUpdateState = {
  status: AppUpdateStatus
  currentVersion: string
  version?: string
  progress?: AppUpdateProgress
  error?: string
}

export function createInitialAppUpdateState(currentVersion = ''): AppUpdateState {
  return { status: 'idle', currentVersion }
}
