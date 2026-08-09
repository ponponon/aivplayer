export type TaskCenterKind = 'asr' | 'batch-subtitle' | 'vision-index' | 'media-import' | 'evidence' | 'drama' | 'drama-generation'

export type TaskCenterStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export type TaskCenterEvent = {
  id: string
  kind: TaskCenterKind
  status: TaskCenterStatus
  title: string
  message: string
  progress: number | null
  current?: string
  updatedAt: number
}

export function isTaskCenterActive(status: TaskCenterStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'paused'
}
