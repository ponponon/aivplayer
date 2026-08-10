import type { VisionSearchResultsExportFormat } from './vision-types'

export type VisionSearchExportTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type VisionSearchExportTaskStage = 'searching' | 'writing' | 'completed' | 'failed' | 'cancelled'

export type VisionSearchExportProgress = {
  taskId: string
  status: VisionSearchExportTaskStatus
  stage: VisionSearchExportTaskStage
  format: VisionSearchResultsExportFormat
  resultCount: number
  writtenCount: number
  message: string
  outputPath?: string
}

export type VisionSearchExportCancelRequest = {
  taskId: string
}

export type VisionSearchExportRetryRequest = {
  taskId: string
}

export type VisionSearchExportBatchRecreateRequest = {
  taskIds: string[]
}
