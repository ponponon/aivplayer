export type EditingSubtitleExportKind = 'source' | 'translation'
export type EditingSubtitleExportFormat = 'srt' | 'vtt' | 'ass'

export type EditingSubtitleFileExportRequest = {
  mediaPath: string
  kind: EditingSubtitleExportKind
  format?: EditingSubtitleExportFormat
  subtitleText: string
  outputSubtitlePath?: string
}

export type EditingSubtitleFileExportResult = {
  success: boolean
  message: string
  filePath?: string
  canceled?: boolean
}

export function isEditingSubtitleExportKind(value: unknown): value is EditingSubtitleExportKind {
  return value === 'source' || value === 'translation'
}

export function isEditingSubtitleExportFormat(value: unknown): value is EditingSubtitleExportFormat {
  return value === 'srt' || value === 'vtt' || value === 'ass'
}
