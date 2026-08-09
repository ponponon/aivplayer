import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseEditingProjectFile } from '../core/editing/project-file'
import { editedDurationSeconds, getVideoClipSpans, videoClipDurationSeconds } from '../core/editing/timeline-math'
import type { EditingCaption, EditingProject, EditingScriptSegment } from '../shared/editing-types'

export type EditingProjectFileErrorCode = 'INPUT_NOT_FOUND' | 'INVALID_EDITING_PROJECT'

export class EditingProjectFileError extends Error {
  readonly code: EditingProjectFileErrorCode
  readonly filePath: string

  constructor(code: EditingProjectFileErrorCode, filePath: string, message: string) {
    super(message)
    this.name = 'EditingProjectFileError'
    this.code = code
    this.filePath = filePath
  }
}

export type EditingProjectFile = {
  filePath: string
  project: EditingProject
}

export type EditingProjectInspection = {
  schemaVersion: EditingProject['schemaVersion']
  id: string
  title: string
  sources: Array<{
    id: string
    name: string
    path: string
    relativePath: string | null
    fingerprint: string
    durationSeconds: number
    width: number | null
    height: number | null
  }>
  timeline: {
    durationSeconds: number
    clipCount: number
    clips: Array<{
      index: number
      id: string
      sourceId: string
      sourceStartSeconds: number
      sourceEndSeconds: number
      durationSeconds: number
      editedStartSeconds: number
      editedEndSeconds: number
    }>
  }
  captions: {
    total: number
    sourceCount: number
    translationCount: number
    wordTimedCount: number
  }
  script: {
    total: number
    activeCount: number
    deletedCount: number
    wordTimedCount: number
  }
  composition: {
    canvasPreset: EditingProject['canvasPreset'] | null
    frameId: EditingProject['frameId'] | null
    captionEffect: EditingProject['captionEffect'] | null
    overlayTrackOrder: EditingProject['overlayTrackOrder'] | null
  }
}

export type EditingCaptionMatch = {
  id: string
  sourceId: string | null
  sourceStartSeconds: number
  sourceEndSeconds: number
  text: string
  translationText: string | null
  deleted: boolean
  wordCount: number
  matchFields: Array<'text' | 'translation'>
}

export type EditingCaptionQueryResult = {
  query: string | null
  limit: number
  totalMatches: number
  matches: EditingCaptionMatch[]
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(3))
}

function wordCount(value: { words?: unknown[] }): number {
  return Array.isArray(value.words) ? value.words.length : 0
}

function summarizeCaptions(captions: readonly EditingCaption[]): EditingProjectInspection['captions'] {
  return {
    total: captions.length,
    sourceCount: captions.filter((caption) => caption.kind === 'source').length,
    translationCount: captions.filter((caption) => caption.kind === 'translation').length,
    wordTimedCount: captions.filter((caption) => wordCount(caption) > 0).length
  }
}

function summarizeScript(segments: readonly EditingScriptSegment[] | undefined): EditingProjectInspection['script'] {
  const rows = segments ?? []
  return {
    total: rows.length,
    activeCount: rows.filter((segment) => segment.deleted !== true).length,
    deletedCount: rows.filter((segment) => segment.deleted === true).length,
    wordTimedCount: rows.filter((segment) => wordCount(segment) > 0).length
  }
}

export async function loadEditingProjectFile(filePathValue: string): Promise<EditingProjectFile> {
  const filePath = resolve(filePathValue)
  let text: string
  try {
    text = await readFile(filePath, 'utf8')
  } catch {
    throw new EditingProjectFileError('INPUT_NOT_FOUND', filePath, `工程文件不存在：${filePath}`)
  }

  try {
    return { filePath, project: parseEditingProjectFile(text) }
  } catch {
    throw new EditingProjectFileError('INVALID_EDITING_PROJECT', filePath, `工程文件无效或版本不兼容：${filePath}`)
  }
}

export function inspectEditingProject(project: EditingProject): EditingProjectInspection {
  const spans = getVideoClipSpans(project.videoClips)
  return {
    schemaVersion: project.schemaVersion,
    id: project.id,
    title: project.title,
    sources: project.sources.map((source) => ({
      id: source.id,
      name: source.name,
      path: source.path,
      relativePath: source.relativePath ?? null,
      fingerprint: source.fingerprint,
      durationSeconds: roundSeconds(source.durationSeconds),
      width: source.width ?? null,
      height: source.height ?? null
    })),
    timeline: {
      durationSeconds: roundSeconds(editedDurationSeconds(project.videoClips)),
      clipCount: project.videoClips.length,
      clips: spans.map((span) => ({
        index: span.index,
        id: span.clip.id,
        sourceId: span.clip.sourceId,
        sourceStartSeconds: roundSeconds(span.clip.sourceStartSeconds),
        sourceEndSeconds: roundSeconds(span.clip.sourceEndSeconds),
        durationSeconds: roundSeconds(videoClipDurationSeconds(span.clip)),
        editedStartSeconds: roundSeconds(span.editedStartSeconds),
        editedEndSeconds: roundSeconds(span.editedEndSeconds)
      }))
    },
    captions: summarizeCaptions(project.captions),
    script: summarizeScript(project.scriptSegments),
    composition: {
      canvasPreset: project.canvasPreset ?? null,
      frameId: project.frameId ?? null,
      captionEffect: project.captionEffect ?? null,
      overlayTrackOrder: project.overlayTrackOrder ?? null
    }
  }
}

function normalizeQuery(query: string | undefined): string | null {
  const normalized = query?.replace(/\s+/gu, ' ').trim().toLocaleLowerCase()
  return normalized ? normalized : null
}

function queryMatches(query: string | null, text: string): boolean {
  return query === null || text.replace(/\s+/gu, ' ').toLocaleLowerCase().includes(query)
}

function buildScriptMatch(segment: EditingScriptSegment, query: string | null): EditingCaptionMatch | null {
  const textMatches = queryMatches(query, segment.text)
  const translationMatches = segment.translationText ? queryMatches(query, segment.translationText) : false
  if (query !== null && !textMatches && !translationMatches) return null
  return {
    id: segment.id,
    sourceId: segment.sourceId,
    sourceStartSeconds: roundSeconds(segment.sourceStartSeconds),
    sourceEndSeconds: roundSeconds(segment.sourceEndSeconds),
    text: segment.text,
    translationText: segment.translationText ?? null,
    deleted: segment.deleted === true,
    wordCount: wordCount(segment),
    matchFields: query === null
      ? []
      : [
          ...(textMatches ? ['text' as const] : []),
          ...(translationMatches ? ['translation' as const] : [])
        ]
  }
}

function buildCaptionMatch(caption: EditingCaption, query: string | null): EditingCaptionMatch | null {
  const textMatches = queryMatches(query, caption.text)
  if (query !== null && !textMatches) return null
  return {
    id: caption.id,
    sourceId: caption.sourceId ?? null,
    sourceStartSeconds: roundSeconds(caption.sourceStartSeconds ?? caption.startSeconds),
    sourceEndSeconds: roundSeconds(caption.sourceEndSeconds ?? caption.startSeconds + caption.durationSeconds),
    text: caption.text,
    translationText: null,
    deleted: false,
    wordCount: wordCount(caption),
    matchFields: query === null ? [] : ['text']
  }
}

export function searchEditingProjectCaptions(
  project: EditingProject,
  queryValue: string | undefined,
  limit: number
): EditingCaptionQueryResult {
  const query = normalizeQuery(queryValue)
  const candidates = project.scriptSegments && project.scriptSegments.length > 0
    ? project.scriptSegments.flatMap((segment) => {
        const match = buildScriptMatch(segment, query)
        return match ? [match] : []
      })
    : project.captions
        .filter((caption) => caption.kind === 'source')
        .flatMap((caption) => {
          const match = buildCaptionMatch(caption, query)
          return match ? [match] : []
        })
  return {
    query: queryValue?.trim() ? queryValue.trim() : null,
    limit,
    totalMatches: candidates.length,
    matches: candidates.slice(0, limit)
  }
}
