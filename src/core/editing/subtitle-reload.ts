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

export type EditingSubtitleReloadIncomingPreviewTrack = {
  kind: EditingCaption['kind']
  text: string
  startSeconds: number
  endSeconds: number
}

export type EditingSubtitleReloadChangePreview = {
  id: string
  kind: EditingCaption['kind']
  text: string
  startSeconds: number
  endSeconds: number
  current: Partial<Record<EditingCaption['kind'], EditingSubtitleReloadIncomingPreviewTrack>> | null
  incoming: Partial<Record<EditingCaption['kind'], EditingSubtitleReloadIncomingPreviewTrack>>
}

export type EditingSubtitleReloadIncomingPreview = EditingSubtitleReloadChangePreview & { current: null }

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

function getChangePreviewTrack(change: EditingSubtitleReloadChange, side: 'current' | 'incoming'): EditingSubtitleReloadIncomingPreviewTrack | null {
  const text = side === 'current' ? change.currentText : change.incomingText
  const start = side === 'current' ? change.currentStartSeconds : change.incomingStartSeconds
  const end = side === 'current' ? change.currentEndSeconds : change.incomingEndSeconds
  if (text === undefined) return null
  const startSeconds = getFiniteTime(start)
  const endSeconds = getFiniteTime(end)
  if (startSeconds === undefined || endSeconds === undefined || endSeconds <= startSeconds) return null
  return { kind: change.kind, text, startSeconds, endSeconds }
}

function getIncomingPreviewTrack(change: EditingSubtitleReloadChange): EditingSubtitleReloadIncomingPreviewTrack | null {
  if (change.status !== 'added' && change.status !== 'changed') return null
  return getChangePreviewTrack(change, 'incoming')
}

/** Matches the loader's source-prefixed script IDs with the normalized diff ID. */
export function shareEditingSubtitleReloadScriptSegmentIds(left: string, right: string): boolean {
  return left === right || left === `source-${right}` || right === `source-${left}`
}

export function shareEditingSubtitleReloadScriptSegments(left: Pick<EditingSubtitleReloadChange, 'id' | 'kind'>, right: Pick<EditingSubtitleReloadChange, 'id' | 'kind'>): boolean {
  const leftSegmentId = getEditingSubtitleReloadChangeScriptSegmentId(left)
  const rightSegmentId = getEditingSubtitleReloadChangeScriptSegmentId(right)
  return shareEditingSubtitleReloadScriptSegmentIds(leftSegmentId, rightSegmentId)
}

export function getEditingSubtitleReloadChangeKey(change: Pick<EditingSubtitleReloadChange, 'id' | 'kind' | 'status'>): string {
  return `${change.status}:${change.kind}:${change.id}`
}

/** Returns the removed rows resolved together when the source row owns a paired translation row. */
export function getEditingSubtitleReloadRelatedChangeKeys(changes: readonly EditingSubtitleReloadChange[], change: EditingSubtitleReloadChange): string[] {
  return [...new Set(changes
    .filter((candidate) => candidate.status === change.status)
    .filter((candidate) => getEditingSubtitleReloadChangeKey(candidate) === getEditingSubtitleReloadChangeKey(change) || (change.status === 'removed' && change.kind === 'source' && shareEditingSubtitleReloadScriptSegments(change, candidate)))
    .map(getEditingSubtitleReloadChangeKey))]
}

function summarizeEditingSubtitleReloadChanges(changes: readonly EditingSubtitleReloadChange[]): EditingSubtitleReloadPreview {
  const orderedChanges = [...changes]
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

export function filterEditingSubtitleReloadPreview(preview: EditingSubtitleReloadPreview, resolvedChangeKeys: readonly string[]): EditingSubtitleReloadPreview {
  if (resolvedChangeKeys.length === 0) return preview
  const resolved = new Set(resolvedChangeKeys)
  return summarizeEditingSubtitleReloadChanges(preview.changes.filter((change) => !resolved.has(getEditingSubtitleReloadChangeKey(change))))
}

/** Builds a transient preview for added or changed cues; it never mutates the project. */
export function getEditingSubtitleReloadChangePreview(change: EditingSubtitleReloadChange, relatedChanges: readonly EditingSubtitleReloadChange[] = []): EditingSubtitleReloadChangePreview | null {
  if (change.status !== 'added' && change.status !== 'changed') return null
  const primaryTrack = getIncomingPreviewTrack(change)
  if (!primaryTrack) return null
  const current: Partial<Record<EditingCaption['kind'], EditingSubtitleReloadIncomingPreviewTrack>> | null = change.status === 'added' ? null : {}
  const incoming: Partial<Record<EditingCaption['kind'], EditingSubtitleReloadIncomingPreviewTrack>> = { [primaryTrack.kind]: primaryTrack }
  if (current) {
    const primaryCurrentTrack = getChangePreviewTrack(change, 'current')
    if (primaryCurrentTrack) current[primaryCurrentTrack.kind] = primaryCurrentTrack
  }
  for (const relatedChange of relatedChanges) {
    if (relatedChange.id === change.id && relatedChange.kind === change.kind) continue
    if (relatedChange.status !== change.status) continue
    if (!shareEditingSubtitleReloadScriptSegments(change, relatedChange)) continue
    const relatedTrack = getIncomingPreviewTrack(relatedChange)
    if (relatedTrack) incoming[relatedTrack.kind] = relatedTrack
    if (current) {
      const relatedCurrentTrack = getChangePreviewTrack(relatedChange, 'current')
      if (relatedCurrentTrack) current[relatedCurrentTrack.kind] = relatedCurrentTrack
    }
  }
  const idPrefix = change.status === 'added' ? 'incoming' : 'preview'
  return { id: `${idPrefix}-${change.kind}-${change.id}`, kind: primaryTrack.kind, text: primaryTrack.text, startSeconds: primaryTrack.startSeconds, endSeconds: primaryTrack.endSeconds, current, incoming }
}

/** Builds the added-only preview contract used by the incoming subtitle action. */
export function getEditingSubtitleReloadIncomingPreview(change: EditingSubtitleReloadChange, relatedChanges: readonly EditingSubtitleReloadChange[] = []): EditingSubtitleReloadIncomingPreview | null {
  if (change.status !== 'added') return null
  const preview = getEditingSubtitleReloadChangePreview(change, relatedChanges)
  return preview?.current === null ? preview as EditingSubtitleReloadIncomingPreview : null
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

  return summarizeEditingSubtitleReloadChanges([...changes].sort(changeOrder))
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

function matchesCurrentCaption(change: EditingSubtitleReloadChange, caption: EditingCaption): boolean {
  if (change.currentText !== undefined && change.currentText !== caption.text) return false
  if (change.currentStartSeconds !== undefined && !sameNumber(change.currentStartSeconds, caption.startSeconds)) return false
  if (change.currentEndSeconds !== undefined && !sameNumber(change.currentEndSeconds, captionEndSeconds(caption))) return false
  return true
}

function sourceRangeOfCaption(caption: EditingCaption): { sourceStartSeconds: number; sourceEndSeconds: number } {
  return {
    sourceStartSeconds: caption.sourceStartSeconds ?? caption.startSeconds,
    sourceEndSeconds: caption.sourceEndSeconds ?? caption.startSeconds + caption.durationSeconds
  }
}

function matchesIncomingCaption(change: EditingSubtitleReloadChange, caption: EditingCaption): boolean {
  if (change.incomingText !== undefined && change.incomingText !== caption.text) return false
  if (change.incomingStartSeconds !== undefined && !sameNumber(change.incomingStartSeconds, caption.startSeconds)) return false
  if (change.incomingEndSeconds !== undefined && !sameNumber(change.incomingEndSeconds, captionEndSeconds(caption))) return false
  return true
}

/** Applies exactly one changed cue while leaving additions, removals, and other cues untouched. */
export function applyEditingSubtitleReloadChange(project: EditingProject, incoming: readonly EditingCaption[], change: EditingSubtitleReloadChange, updatedAt = Date.now()): EditingProject | null {
  if (change.status !== 'changed') return null
  const currentCaption = project.captions.find((caption) => caption.id === change.id && caption.kind === change.kind)
  const incomingCaption = incoming.find((caption) => caption.id === change.id && caption.kind === change.kind)
  if (!currentCaption || !incomingCaption || !matchesCurrentCaption(change, currentCaption)) return null

  const captions = sortCaptions(project.captions.map((caption) => caption === currentCaption ? incomingCaption : caption))
  const scriptSegmentId = getEditingSubtitleReloadChangeScriptSegmentId(change)
  const scriptSegments = project.scriptSegments?.map((segment) => {
    if (!shareEditingSubtitleReloadScriptSegmentIds(segment.id, scriptSegmentId)) return segment
    if (change.kind === 'translation') return { ...segment, translationText: incomingCaption.text }
    const sourceRange = sourceRangeOfCaption(incomingCaption)
    const next = {
      ...segment,
      sourceId: incomingCaption.sourceId ?? segment.sourceId,
      sourceStartSeconds: sourceRange.sourceStartSeconds,
      sourceEndSeconds: sourceRange.sourceEndSeconds,
      text: incomingCaption.text
    }
    if (incomingCaption.words && incomingCaption.words.length > 0) next.words = incomingCaption.words
    else delete next.words
    return next
  })

  return { ...project, captions, ...(scriptSegments ? { scriptSegments } : {}), updatedAt }
}

/** Adds exactly one incoming cue and merges only the affected script context. */
export function applyEditingSubtitleReloadAddition(project: EditingProject, incoming: readonly EditingCaption[], change: EditingSubtitleReloadChange, updatedAt = Date.now()): EditingProject | null {
  if (change.status !== 'added') return null
  const incomingCaption = incoming.find((caption) => caption.id === change.id && caption.kind === change.kind)
  if (!incomingCaption || project.captions.some((caption) => caption.id === change.id && caption.kind === change.kind) || !matchesIncomingCaption(change, incomingCaption)) return null

  const captions = sortCaptions([...project.captions, incomingCaption])
  const shouldMaterializeScript = project.scriptSegments !== undefined || captions.some((caption) => caption.kind === 'source')
  const scriptSegments = shouldMaterializeScript ? mergeEditingScriptSegments(project.scriptSegments, captions) : undefined
  return { ...project, captions, ...(scriptSegments ? { scriptSegments } : {}), updatedAt }
}

/** Removes one incoming-deleted cue; source removal also hides its paired translation and preserves a restorable script row. */
export function applyEditingSubtitleReloadRemoval(project: EditingProject, change: EditingSubtitleReloadChange, updatedAt = Date.now()): EditingProject | null {
  if (change.status !== 'removed') return null
  const currentCaption = project.captions.find((caption) => caption.id === change.id && caption.kind === change.kind)
  if (!currentCaption || !matchesCurrentCaption(change, currentCaption)) return null

  const scriptSegmentId = getEditingSubtitleReloadChangeScriptSegmentId(change)
  const removedCaptionIds = new Set([change.id])
  if (change.kind === 'source') {
    for (const caption of project.captions) {
      if (shareEditingSubtitleReloadScriptSegmentIds(getEditingSubtitleReloadChangeScriptSegmentId(caption), scriptSegmentId)) removedCaptionIds.add(caption.id)
    }
  }
  const captions = sortCaptions(project.captions.filter((caption) => !removedCaptionIds.has(caption.id)))
  const scriptSegments = project.scriptSegments?.map((segment) => {
    if (!shareEditingSubtitleReloadScriptSegmentIds(segment.id, scriptSegmentId)) return segment
    if (change.kind === 'source') return { ...segment, deleted: true }
    const next = { ...segment }
    delete next.translationText
    return next
  })
  return { ...project, captions, ...(scriptSegments ? { scriptSegments } : {}), updatedAt }
}

/** Keeps one removed cue in the project while recording the resolved diff keys for the pending revision. */
export function applyEditingSubtitleReloadKeep(project: EditingProject, changes: readonly EditingSubtitleReloadChange[], change: EditingSubtitleReloadChange, sourceRevisionKey: string, updatedAt = Date.now()): EditingProject | null {
  if (change.status !== 'removed' || sourceRevisionKey.trim().length === 0) return null
  const currentCaption = project.captions.find((caption) => caption.id === change.id && caption.kind === change.kind)
  if (!currentCaption || !matchesCurrentCaption(change, currentCaption)) return null
  const existingKeys = project.captionReloadResolution?.sourceRevisionKey === sourceRevisionKey ? project.captionReloadResolution.changeKeys : []
  const resolvedChangeKeys = [...new Set([...existingKeys, ...getEditingSubtitleReloadRelatedChangeKeys(changes, change)])]
  return { ...project, captionReloadResolution: { sourceRevisionKey, changeKeys: resolvedChangeKeys }, updatedAt }
}

/** Replaces only captions and script rows, preserving the edited timeline and all visual tracks. */
export function replaceEditingCaptionsForReload(project: EditingProject, incoming: readonly EditingCaption[], captionSourceRevision: string, updatedAt = Date.now()): EditingProject {
  const captions = sortCaptions(incoming)
  const { captionReloadResolution: _captionReloadResolution, ...projectWithoutReloadResolution } = project
  return {
    ...projectWithoutReloadResolution,
    captions,
    scriptSegments: mergeEditingScriptSegments(undefined, captions),
    captionSourceRevision,
    updatedAt
  }
}
