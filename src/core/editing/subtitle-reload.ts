import type { EditingCaption, EditingProject } from '../../shared/editing-types'
import { mergeEditingScriptSegments } from './script-operations'

export type EditingSubtitleReloadChangeStatus = 'added' | 'removed' | 'changed'

export type EditingSubtitleReloadChange = {
  id: string
  kind: EditingCaption['kind']
  status: EditingSubtitleReloadChangeStatus
  currentText?: string
  incomingText?: string
}

export type EditingSubtitleReloadPreview = {
  hasChanges: boolean
  addedCount: number
  removedCount: number
  changedCount: number
  sourceChangedCount: number
  translationChangedCount: number
  changes: EditingSubtitleReloadChange[]
}

const CAPTION_COMPARE_EPSILON = 0.001
const PREVIEW_CHANGE_LIMIT = 12

function sameNumber(left: number | undefined, right: number | undefined): boolean {
  if (left === undefined || right === undefined) return left === right
  return Math.abs(left - right) < CAPTION_COMPARE_EPSILON
}

function sameCaptionContent(left: EditingCaption, right: EditingCaption): boolean {
  return left.kind === right.kind
    && left.text === right.text
    && left.sourceId === right.sourceId
    && sameNumber(left.startSeconds, right.startSeconds)
    && sameNumber(left.durationSeconds, right.durationSeconds)
    && sameNumber(left.sourceStartSeconds, right.sourceStartSeconds)
    && sameNumber(left.sourceEndSeconds, right.sourceEndSeconds)
}

function countByKind(changes: readonly EditingSubtitleReloadChange[], kind: EditingCaption['kind']): number {
  return changes.filter((change) => change.kind === kind).length
}

function changeOrder(left: EditingSubtitleReloadChange, right: EditingSubtitleReloadChange): number {
  const statusOrder: Record<EditingSubtitleReloadChangeStatus, number> = { changed: 0, added: 1, removed: 2 }
  return statusOrder[left.status] - statusOrder[right.status] || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
}

/** Compares the materialized subtitle tracks without treating word timing enrichment as a conflict. */
export function buildEditingSubtitleReloadPreview(current: readonly EditingCaption[], incoming: readonly EditingCaption[]): EditingSubtitleReloadPreview {
  const currentById = new Map(current.map((caption) => [caption.id, caption]))
  const incomingById = new Map(incoming.map((caption) => [caption.id, caption]))
  const changes: EditingSubtitleReloadChange[] = []

  for (const caption of incoming) {
    const previous = currentById.get(caption.id)
    if (!previous) {
      changes.push({ id: caption.id, kind: caption.kind, status: 'added', incomingText: caption.text })
    } else if (!sameCaptionContent(previous, caption)) {
      changes.push({ id: caption.id, kind: caption.kind, status: 'changed', currentText: previous.text, incomingText: caption.text })
    }
  }
  for (const caption of current) {
    if (!incomingById.has(caption.id)) changes.push({ id: caption.id, kind: caption.kind, status: 'removed', currentText: caption.text })
  }

  const orderedChanges = [...changes].sort(changeOrder)
  return {
    hasChanges: orderedChanges.length > 0,
    addedCount: orderedChanges.filter((change) => change.status === 'added').length,
    removedCount: orderedChanges.filter((change) => change.status === 'removed').length,
    changedCount: orderedChanges.filter((change) => change.status === 'changed').length,
    sourceChangedCount: countByKind(orderedChanges, 'source'),
    translationChangedCount: countByKind(orderedChanges, 'translation'),
    changes: orderedChanges.slice(0, PREVIEW_CHANGE_LIMIT)
  }
}

function sortCaptions(captions: readonly EditingCaption[]): EditingCaption[] {
  return [...captions].sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id))
}

/** Replaces only captions and script rows, preserving the edited timeline and all visual tracks. */
export function replaceEditingCaptionsForReload(project: EditingProject, incoming: readonly EditingCaption[], captionSourceRevision: string, updatedAt = Date.now()): EditingProject {
  const captions = sortCaptions(incoming)
  return {
    ...project,
    captions,
    scriptSegments: mergeEditingScriptSegments(undefined, captions),
    captionSourceRevision,
    updatedAt
  }
}
