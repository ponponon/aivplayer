import type { EditingCaption, EditingProject } from '../../shared/editing-types'
import { mergeEditingScriptSegments } from './script-operations'

export type EditingSubtitleReloadChangeStatus = 'added' | 'removed' | 'changed'

export type EditingSubtitleReloadChange = {
  id: string
  kind: EditingCaption['kind']
  status: EditingSubtitleReloadChangeStatus
  currentText?: string
  incomingText?: string
  currentStartSeconds?: number
  currentEndSeconds?: number
  incomingStartSeconds?: number
  incomingEndSeconds?: number
}

/** Maps a source or translation caption diff back to its persistent script row. */
export function getEditingSubtitleReloadChangeScriptSegmentId(change: Pick<EditingSubtitleReloadChange, 'id' | 'kind'>): string {
  const translationPrefix = 'translation-'
  return change.kind === 'translation' && change.id.startsWith(translationPrefix)
    ? change.id.slice(translationPrefix.length)
    : change.id
}

export type EditingSubtitleReloadIncomingPreview = {
  id: string
  kind: EditingCaption['kind']
  text: string
  startSeconds: number
  endSeconds: number
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

export type EditingSubtitleReloadChangeStatusFilter = EditingSubtitleReloadChangeStatus | 'all'
export type EditingSubtitleReloadChangeKindFilter = EditingCaption['kind'] | 'all'

export type EditingSubtitleReloadChangePageOptions = {
  query?: string
  status?: EditingSubtitleReloadChangeStatusFilter
  kind?: EditingSubtitleReloadChangeKindFilter
  timeStartSeconds?: number
  timeEndSeconds?: number
  pageIndex?: number
  pageSize?: number
}

export type EditingSubtitleReloadChangePage = {
  changes: EditingSubtitleReloadChange[]
  query: string
  status: EditingSubtitleReloadChangeStatusFilter
  kind: EditingSubtitleReloadChangeKindFilter
  timeStartSeconds?: number
  timeEndSeconds?: number
  pageIndex: number
  pageSize: number
  total: number
  pageCount: number
}

export const EDITING_SUBTITLE_RELOAD_PAGE_SIZE = 8

const CAPTION_COMPARE_EPSILON = 0.001

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

function normalizeQuery(query: string | undefined): string {
  return query?.trim().toLocaleLowerCase() ?? ''
}

function captionEndSeconds(caption: EditingCaption): number {
  return caption.startSeconds + caption.durationSeconds
}

function getFiniteTime(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : undefined
}

/** Builds a transient preview only for incoming-only cues; it never mutates the project. */
export function getEditingSubtitleReloadIncomingPreview(change: EditingSubtitleReloadChange): EditingSubtitleReloadIncomingPreview | null {
  if (change.status !== 'added' || change.incomingText === undefined) return null
  const startSeconds = getFiniteTime(change.incomingStartSeconds)
  const endSeconds = getFiniteTime(change.incomingEndSeconds)
  if (startSeconds === undefined || endSeconds === undefined || endSeconds <= startSeconds) return null
  return { id: `incoming-${change.kind}-${change.id}`, kind: change.kind, text: change.incomingText, startSeconds, endSeconds }
}

export function getEditingSubtitleReloadChangeTimeRange(change: EditingSubtitleReloadChange): { startSeconds?: number; endSeconds?: number } {
  const starts = [change.currentStartSeconds, change.incomingStartSeconds].map(getFiniteTime).filter((value): value is number => value !== undefined)
  const ends = [change.currentEndSeconds, change.incomingEndSeconds].map(getFiniteTime).filter((value): value is number => value !== undefined)
  return {
    startSeconds: starts.length > 0 ? Math.min(...starts) : undefined,
    endSeconds: ends.length > 0 ? Math.max(...ends) : undefined
  }
}

function matchesTimeRange(change: EditingSubtitleReloadChange, timeStartSeconds: number | undefined, timeEndSeconds: number | undefined): boolean {
  if (timeStartSeconds === undefined && timeEndSeconds === undefined) return true
  const range = getEditingSubtitleReloadChangeTimeRange(change)
  if (range.startSeconds === undefined || range.endSeconds === undefined) return false
  if (timeStartSeconds !== undefined && range.endSeconds < timeStartSeconds) return false
  if (timeEndSeconds !== undefined && range.startSeconds > timeEndSeconds) return false
  return true
}

function matchesChange(change: EditingSubtitleReloadChange, query: string, status: EditingSubtitleReloadChangeStatusFilter, kind: EditingSubtitleReloadChangeKindFilter, timeStartSeconds: number | undefined, timeEndSeconds: number | undefined): boolean {
  if (status !== 'all' && change.status !== status) return false
  if (kind !== 'all' && change.kind !== kind) return false
  if (!matchesTimeRange(change, timeStartSeconds, timeEndSeconds)) return false
  if (!query) return true
  return [change.id, change.currentText, change.incomingText].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)
}

/** Compares the materialized subtitle tracks without treating word timing enrichment as a conflict. */
export function buildEditingSubtitleReloadPreview(current: readonly EditingCaption[], incoming: readonly EditingCaption[]): EditingSubtitleReloadPreview {
  const currentById = new Map(current.map((caption) => [caption.id, caption]))
  const incomingById = new Map(incoming.map((caption) => [caption.id, caption]))
  const changes: EditingSubtitleReloadChange[] = []

  for (const caption of incoming) {
    const previous = currentById.get(caption.id)
    if (!previous) {
      changes.push({ id: caption.id, kind: caption.kind, status: 'added', incomingText: caption.text, incomingStartSeconds: caption.startSeconds, incomingEndSeconds: captionEndSeconds(caption) })
    } else if (!sameCaptionContent(previous, caption)) {
      changes.push({ id: caption.id, kind: caption.kind, status: 'changed', currentText: previous.text, incomingText: caption.text, currentStartSeconds: previous.startSeconds, currentEndSeconds: captionEndSeconds(previous), incomingStartSeconds: caption.startSeconds, incomingEndSeconds: captionEndSeconds(caption) })
    }
  }
  for (const caption of current) {
    if (!incomingById.has(caption.id)) changes.push({ id: caption.id, kind: caption.kind, status: 'removed', currentText: caption.text, currentStartSeconds: caption.startSeconds, currentEndSeconds: captionEndSeconds(caption) })
  }

  const orderedChanges = [...changes].sort(changeOrder)
  return {
    hasChanges: orderedChanges.length > 0,
    addedCount: orderedChanges.filter((change) => change.status === 'added').length,
    removedCount: orderedChanges.filter((change) => change.status === 'removed').length,
    changedCount: orderedChanges.filter((change) => change.status === 'changed').length,
    sourceChangedCount: countByKind(orderedChanges, 'source'),
    translationChangedCount: countByKind(orderedChanges, 'translation'),
    changes: orderedChanges
  }
}

/** Filters and paginates the complete diff without changing the conflict counts. */
export function getEditingSubtitleReloadChangePage(changes: readonly EditingSubtitleReloadChange[], options: EditingSubtitleReloadChangePageOptions = {}): EditingSubtitleReloadChangePage {
  const query = normalizeQuery(options.query)
  const status = options.status ?? 'all'
  const kind = options.kind ?? 'all'
  const rawTimeStartSeconds = getFiniteTime(options.timeStartSeconds)
  const rawTimeEndSeconds = getFiniteTime(options.timeEndSeconds)
  const timeStartSeconds = rawTimeStartSeconds !== undefined && rawTimeEndSeconds !== undefined ? Math.min(rawTimeStartSeconds, rawTimeEndSeconds) : rawTimeStartSeconds
  const timeEndSeconds = rawTimeStartSeconds !== undefined && rawTimeEndSeconds !== undefined ? Math.max(rawTimeStartSeconds, rawTimeEndSeconds) : rawTimeEndSeconds
  const pageSize = Math.max(1, Math.min(100, Math.trunc(options.pageSize ?? EDITING_SUBTITLE_RELOAD_PAGE_SIZE)))
  const filtered = changes.filter((change) => matchesChange(change, query, status, kind, timeStartSeconds, timeEndSeconds))
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageIndex = Math.min(pageCount - 1, Math.max(0, Math.trunc(options.pageIndex ?? 0)))
  return {
    changes: filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    query,
    status,
    kind,
    timeStartSeconds,
    timeEndSeconds,
    pageIndex,
    pageSize,
    total: filtered.length,
    pageCount
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
