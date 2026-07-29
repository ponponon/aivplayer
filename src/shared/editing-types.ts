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
  treatment?: EditingClipTreatment
  treatmentScale?: number
  treatmentAnchor?: EditingTreatmentAnchor
  filter?: EditingClipFilter
  transitionIn?: EditingClipTransition
}

export type EditingClipTreatment = 'full' | 'punch-in'
export type EditingTreatmentAnchor = 'left' | 'center' | 'right'
export type EditingClipFilter = { brightness?: number; contrast?: number; saturate?: number }
export type EditingClipTransitionType = 'fade' | 'fadeblack' | 'dissolve' | 'wipe-left' | 'wipe-right' | 'slide-left' | 'slide-right' | 'zoom'
export type EditingClipTransition = { type: EditingClipTransitionType; durationSeconds: number }
export type EditingGraphicPosition = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type EditingGraphicStyle = 'title' | 'label'
export type EditingGraphic = {
  id: string
  startSeconds: number
  durationSeconds: number
  text: string
  position: EditingGraphicPosition
  style: EditingGraphicStyle
}
export type EditingVideoBlockPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'split-left' | 'split-right'
export type EditingVideoBlockMotion = 'none' | 'fade' | 'slide-left' | 'slide-right' | 'rise' | 'scale'
export type EditingVideoBlock = {
  id: string
  sourceId: string
  sourceStartSeconds: number
  sourceEndSeconds: number
  startSeconds: number
  durationSeconds: number
  position: EditingVideoBlockPosition
  /** Width/height for corner blocks, partner width for split blocks. */
  sizePercent?: number
  borderRadius?: number
  borderWidth?: number
  enterMotion?: EditingVideoBlockMotion
  exitMotion?: EditingVideoBlockMotion
  motionDurationSeconds?: number
}
export const EDITING_PUNCH_IN_MIN_SCALE = 1
export const EDITING_PUNCH_IN_MAX_SCALE = 2.5
export const EDITING_PUNCH_IN_DEFAULT_SCALE = 1.35
export const EDITING_TRANSITION_MIN_DURATION = 0.1
export const EDITING_TRANSITION_MAX_DURATION = 1
export const EDITING_TRANSITION_DEFAULT_DURATION = 0.35

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

/**
 * Source-anchored transcript rows survive timeline cuts. Unlike captions, this
 * is the editing script: a row remains visible after it is removed so it can
 * be restored without rerunning ASR.
 */
export type EditingScriptSegment = {
  id: string
  sourceId: string
  sourceStartSeconds: number
  sourceEndSeconds: number
  text: string
  translationText?: string
  deleted?: boolean
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
  /** Optional graphic blocks kept separate from subtitle captions for Pireel-style composition. */
  graphics?: EditingGraphic[]
  /** Optional picture-in-picture video blocks kept separate from the primary video track. */
  videoBlocks?: EditingVideoBlock[]
  /** Optional for backward compatibility with schema version 1 project files. */
  scriptSegments?: EditingScriptSegment[]
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
