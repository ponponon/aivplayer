export type EditingSubtitleExportKind = 'source' | 'translation'

export type EditingSubtitleFileExportRequest = {
  mediaPath: string
  kind: EditingSubtitleExportKind
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
