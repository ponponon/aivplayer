/**
 * Local editing project data.
 *
 * Video bytes stay on disk. The project only stores source references and the
 * source ranges that survive on the edited timeline, so projects remain small
 * and can be repaired when a file is moved.
 */

export const EDITING_PROJECT_SCHEMA_VERSION = 1 as const

export type EditingSource = {
  id: string
  path: string
  name: string
  fingerprint: string
  durationSeconds: number
  width?: number
  height?: number
}

export type EditingVideoClip = {
  id: string
  sourceId: string
  sourceStartSeconds: number
  sourceEndSeconds: number
  volume?: number
  muted?: boolean
}

export type EditingTimedItem = {
  id: string
  startSeconds: number
  durationSeconds: number
}

export type EditingCaption = EditingTimedItem & {
  sourceId?: string
  sourceStartSeconds?: number
  sourceEndSeconds?: number
  text: string
  kind: 'source' | 'translation'
}

export type EditingProject = {
  schemaVersion: typeof EDITING_PROJECT_SCHEMA_VERSION
  id: string
  title: string
  createdAt: number
  updatedAt: number
  sources: EditingSource[]
  videoClips: EditingVideoClip[]
  /** Captions are derived from ASR data when available, but may be materialized later. */
  captions: EditingCaption[]
}

export type EditingProjectFileOpenResult = {
  success: boolean
  message: string
  project?: EditingProject
  filePath?: string
  canceled?: boolean
}

export type EditingProjectFileSaveRequest = {
  project: EditingProject
  suggestedPath?: string
}

export type EditingProjectFileSaveResult = {
  success: boolean
  message: string
  filePath?: string
  canceled?: boolean
}
