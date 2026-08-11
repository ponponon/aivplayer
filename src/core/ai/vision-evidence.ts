import type { EditingProject, EditingSource } from '../../shared/editing-types'
import type { VisionClipSelection, VisionEvidenceType, VisionSearchResult } from '../../shared/vision-types'

export const DEFAULT_VISION_SELECTION_INTERVAL_SECONDS = 3
export const DEFAULT_VISION_SELECTION_MERGE_GAP_SECONDS = 0.05

export type VisionSourceMetadata = Pick<EditingSource, 'id' | 'fingerprint' | 'durationSeconds' | 'width' | 'height'>

export type VisionSearchProjectOptions = {
  projectId?: string
  title?: string
  now?: number
  sourceMetadata?: ReadonlyMap<string, VisionSourceMetadata>
  selectionIntervalSeconds?: number
  mergeGapSeconds?: number
}

type TimeRange = { startSeconds: number; endSeconds: number }

function stableHash(value: string): string {
  // Keep this module usable from both Electron main and Renderer. IDs only
  // need to be deterministic here; evidence integrity is still anchored by
  // the source fingerprint and the LanceDB row data.
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    first = Math.imul(first ^ codePoint, 0x01000193)
    second = Math.imul(second ^ (codePoint + 0x9e3779b9), 0x85ebca6b)
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(3))
}

function finitePositive(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : null
}

export function createVisionSourceId(videoPath: string): string {
  return `source-vision-${stableHash(videoPath)}`
}

export function createVisionSourceFingerprint(videoPath: string, sizeBytes: number, mtimeMs: number): string {
  return `${videoPath}:${sizeBytes}:${mtimeMs}`
}

export function createVisionEvidenceId(input: {
  videoPath: string
  evidenceType: VisionEvidenceType
  startSeconds: number
  endSeconds: number
  text?: string
  sourceFingerprint?: string
  identity?: string
}): string {
  return `evidence-${stableHash([
    input.videoPath,
    input.evidenceType,
    roundSeconds(input.startSeconds),
    roundSeconds(input.endSeconds),
    input.text?.trim() ?? '',
    input.sourceFingerprint ?? '',
    input.identity ?? ''
  ].join('\0'))}`
}

export function normalizeVisionTimeRange(range: TimeRange, durationSeconds?: number): TimeRange | null {
  if (!Number.isFinite(range.startSeconds) || !Number.isFinite(range.endSeconds)) return null
  const duration = finitePositive(durationSeconds)
  const start = Math.max(0, Math.min(range.startSeconds, duration ?? Number.POSITIVE_INFINITY))
  const unclampedEnd = Math.max(0, range.endSeconds)
  const end = Math.min(unclampedEnd, duration ?? unclampedEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return { startSeconds: roundSeconds(start), endSeconds: roundSeconds(end) }
}

function sourceMetadataFor(result: VisionSearchResult, options: VisionSearchProjectOptions): VisionSourceMetadata | undefined {
  return options.sourceMetadata?.get(result.videoPath)
}

function selectionFromResult(result: VisionSearchResult, options: VisionSearchProjectOptions): VisionClipSelection | null {
  const metadata = sourceMetadataFor(result, options)
  const durationFromResult = finitePositive(result.durationSeconds)
  const durationFromMetadata = finitePositive(metadata?.durationSeconds)
  const sourceDuration = durationFromMetadata ?? durationFromResult
  const interval = finitePositive(options.selectionIntervalSeconds) ?? DEFAULT_VISION_SELECTION_INTERVAL_SECONDS
  const timestamp = Number.isFinite(result.timestampSeconds) ? Math.max(0, result.timestampSeconds) : 0
  const range = normalizeVisionTimeRange({
    startSeconds: result.startSeconds ?? Math.max(0, timestamp - interval / 2),
    endSeconds: result.endSeconds ?? timestamp + interval / 2
  }, sourceDuration ?? undefined)
  if (!range) return null

  const durationSeconds = sourceDuration ?? range.endSeconds
  const sourceId = metadata?.id ?? result.sourceId ?? createVisionSourceId(result.videoPath)
  const fingerprint = metadata?.fingerprint ?? result.sourceFingerprint ?? `${result.videoPath}:${durationSeconds}`
  const text = result.matchedText?.trim() || undefined
  return {
    sourceId,
    videoPath: result.videoPath,
    fileName: result.fileName,
    fingerprint,
    durationSeconds: Math.max(durationSeconds, range.endSeconds),
    width: metadata?.width,
    height: metadata?.height,
    startSeconds: range.startSeconds,
    endSeconds: range.endSeconds,
    evidenceIds: [result.evidenceId ?? result.id],
    text,
    evidenceTypes: [result.evidenceType ?? (result.matchSource === 'subtitle' || result.matchSource === 'both' ? 'subtitle' : 'visual')]
  }
}

function mergeText(left: string | undefined, right: string | undefined): string | undefined {
  const values = [left, right].filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim())
  return values.length > 0 ? [...new Set(values)].join('\n') : undefined
}

function mergeEvidenceTypes(left: VisionEvidenceType[], right: VisionEvidenceType[]): VisionEvidenceType[] {
  return [...new Set([...left, ...right])]
}

/** Converts search hits into source-anchored ranges and merges overlap from the same source. */
export function createVisionClipSelections(results: readonly VisionSearchResult[], options: VisionSearchProjectOptions = {}): VisionClipSelection[] {
  const selections = results.map((result) => selectionFromResult(result, options)).filter((selection): selection is VisionClipSelection => selection !== null)
  return mergeVisionClipSelections(selections, options.mergeGapSeconds)
}

export function mergeVisionClipSelections(selections: readonly VisionClipSelection[], mergeGapSeconds = DEFAULT_VISION_SELECTION_MERGE_GAP_SECONDS): VisionClipSelection[] {
  const gap = Number.isFinite(mergeGapSeconds) && mergeGapSeconds >= 0 ? mergeGapSeconds : DEFAULT_VISION_SELECTION_MERGE_GAP_SECONDS
  const sorted = [...selections].sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
  const merged: VisionClipSelection[] = []
  for (const selection of sorted) {
    const previous = merged.at(-1)
    if (!previous || previous.sourceId !== selection.sourceId || selection.startSeconds > previous.endSeconds + gap) {
      merged.push({ ...selection, evidenceIds: [...new Set(selection.evidenceIds)], evidenceTypes: [...new Set(selection.evidenceTypes)] })
      continue
    }
    previous.endSeconds = Math.max(previous.endSeconds, selection.endSeconds)
    previous.durationSeconds = Math.max(previous.durationSeconds, selection.durationSeconds)
    previous.evidenceIds = [...new Set([...previous.evidenceIds, ...selection.evidenceIds])]
    previous.text = mergeText(previous.text, selection.text)
    previous.evidenceTypes = mergeEvidenceTypes(previous.evidenceTypes, selection.evidenceTypes)
  }
  return merged
}

/** Creates a deterministic, source-anchored editing project from selected search hits. */
export function createEditingProjectFromVisionSearchResults(results: readonly VisionSearchResult[], options: VisionSearchProjectOptions = {}): EditingProject {
  const selections = createVisionClipSelections(results, options)
  return createEditingProjectFromVisionSelections(selections, options)
}

export function createEditingProjectFromVisionSelections(selections: readonly VisionClipSelection[], options: VisionSearchProjectOptions = {}): EditingProject {
  const metadataSelections = selections.map((selection) => {
    const metadata = options.sourceMetadata?.get(selection.videoPath)
    if (!metadata) return selection
    const range = normalizeVisionTimeRange(selection, metadata.durationSeconds)
    if (!range) return null
    return {
      ...selection,
      sourceId: metadata.id,
      fingerprint: metadata.fingerprint,
      durationSeconds: metadata.durationSeconds,
      width: metadata.width ?? selection.width,
      height: metadata.height ?? selection.height,
      startSeconds: range.startSeconds,
      endSeconds: range.endSeconds
    }
  }).filter((selection): selection is VisionClipSelection => selection !== null)
  const normalizedSelections = mergeVisionClipSelections(metadataSelections, options.mergeGapSeconds)
  if (normalizedSelections.length === 0) throw new Error('至少需要一个有效的视频语义选段')
  const now = options.now ?? Date.now()
  const sources = [...new Map(normalizedSelections.map((selection) => [selection.sourceId, selection])).values()].map((selection) => ({
    id: selection.sourceId,
    path: selection.videoPath,
    name: selection.fileName,
    fingerprint: selection.fingerprint,
    durationSeconds: selection.durationSeconds,
    width: selection.width,
    height: selection.height
  }))
  const title = options.title?.trim() || `语义选段 · ${sources[0]?.name ?? '视频'}`
  const projectId = options.projectId ?? `project-vision-${stableHash(`${title}\0${normalizedSelections.map((selection) => `${selection.sourceId}:${selection.startSeconds}:${selection.endSeconds}`).join('\0')}`)}`
  const videoClips = normalizedSelections.map((selection, index) => {
    const duration = selection.endSeconds - selection.startSeconds
    const clip = {
      id: `clip-vision-${stableHash(`${projectId}\0${index}\0${selection.sourceId}\0${selection.startSeconds}\0${selection.endSeconds}`)}`,
      sourceId: selection.sourceId,
      sourceStartSeconds: selection.startSeconds,
      sourceEndSeconds: selection.endSeconds
    }
    return clip
  })

  let captionStart = 0
  const captions = normalizedSelections.flatMap((selection, index) => {
    const text = selection.text?.trim()
    const duration = selection.endSeconds - selection.startSeconds
    const caption = text ? {
      id: `caption-vision-${stableHash(`${projectId}\0${index}\0${selection.evidenceIds.join(',')}`)}`,
      startSeconds: captionStart,
      durationSeconds: duration,
      sourceId: selection.sourceId,
      sourceStartSeconds: selection.startSeconds,
      sourceEndSeconds: selection.endSeconds,
      text,
      kind: 'source' as const
    } : null
    captionStart += duration
    return caption ? [caption] : []
  })

  return {
    schemaVersion: 1,
    id: projectId,
    title,
    createdAt: now,
    updatedAt: now,
    sources,
    videoClips,
    captions,
    frameId: 'clean',
    captionEffect: 'none',
    canvasPreset: 'source',
    overlayTrackOrder: ['videoBlocks', 'graphics', 'captions']
  }
}
