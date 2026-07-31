export type PersonMatteModelStatus = {
  available: boolean
  modelId: string
  modelDirectory: string
  message: string
}

export type PersonMatteModelDownloadStatus = 'cached' | 'downloading' | 'completed'

export type PersonMatteModelDownloadProgress = {
  status: PersonMatteModelDownloadStatus
  relativePath: string
  fileIndex: number
  fileCount: number
  receivedBytes: number
  totalBytes: number | null
  percent: number | null
}

export type PersonMatteModelDownloadResult = {
  success: boolean
  message: string
  status: PersonMatteModelStatus
}
