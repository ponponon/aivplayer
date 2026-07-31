import { MIN_CLIP_DURATION_SECONDS } from '../../shared/clip-export'
import type { EditingProject, EditingSource } from '../../shared/editing-types'
import { EDITING_GRAPHIC_MIN_DURATION } from './graphic-operations'
import { EDITING_VIDEO_BLOCK_MIN_DURATION } from './video-block-operations'

export type EditingExportAuditIssueCode = 'empty-timeline' | 'missing-source' | 'missing-source-file' | 'invalid-clip-range' | 'clip-too-short' | 'invalid-video-block' | 'invalid-graphic'

export type EditingExportAuditIssue = {
  code: EditingExportAuditIssueCode
  entityId: string
  sourceId?: string
  sourceName?: string
}

export type EditingExportAudit = {
  errors: EditingExportAuditIssue[]
}

function sourceLabel(source: EditingSource | undefined, sourceId: string): string {
  return source?.name || sourceId
}

function finiteRange(startSeconds: number, endSeconds: number, maxSeconds: number, minimumSeconds: number): boolean {
  return Number.isFinite(startSeconds) && Number.isFinite(endSeconds) && startSeconds >= 0 && endSeconds > startSeconds && endSeconds <= maxSeconds + 0.01 && endSeconds - startSeconds >= minimumSeconds
}

export function auditEditingExport(project: EditingProject, availableSourceIds: readonly string[]): EditingExportAudit {
  const errors: EditingExportAuditIssue[] = []
  const sources = new Map(project.sources.map((source) => [source.id, source]))
  const available = new Set(availableSourceIds)
  const timelineDuration = project.videoClips.reduce((sum, clip) => sum + Math.max(0, clip.sourceEndSeconds - clip.sourceStartSeconds), 0)
  const add = (code: EditingExportAuditIssueCode, entityId: string, sourceId?: string, sourceName?: string): void => { errors.push({ code, entityId, ...(sourceId ? { sourceId } : {}), ...(sourceName ? { sourceName } : {}) }) }

  if (project.videoClips.length === 0 || timelineDuration < MIN_CLIP_DURATION_SECONDS) add('empty-timeline', project.id)
  for (const clip of project.videoClips) {
    const source = sources.get(clip.sourceId)
    if (!source) {
      add('missing-source', clip.id, clip.sourceId, clip.sourceId)
      continue
    }
    if (!available.has(source.id)) add('missing-source-file', clip.id, source.id, source.name)
    const durationSeconds = clip.sourceEndSeconds - clip.sourceStartSeconds
    if (!finiteRange(clip.sourceStartSeconds, clip.sourceEndSeconds, source.durationSeconds, MIN_CLIP_DURATION_SECONDS)) add(durationSeconds < MIN_CLIP_DURATION_SECONDS ? 'clip-too-short' : 'invalid-clip-range', clip.id, source.id, source.name)
  }
  for (const block of project.videoBlocks ?? []) {
    const source = sources.get(block.sourceId)
    if (!source || !available.has(block.sourceId) || !finiteRange(block.sourceStartSeconds, block.sourceEndSeconds, source?.durationSeconds ?? 0, EDITING_VIDEO_BLOCK_MIN_DURATION) || !Number.isFinite(block.startSeconds) || block.startSeconds < 0 || !Number.isFinite(block.durationSeconds) || block.durationSeconds < EDITING_VIDEO_BLOCK_MIN_DURATION || block.startSeconds + block.durationSeconds > timelineDuration + 0.01) add('invalid-video-block', block.id, block.sourceId, sourceLabel(source, block.sourceId))
  }
  for (const graphic of project.graphics ?? []) if (!graphic.text.trim() || !Number.isFinite(graphic.startSeconds) || graphic.startSeconds < 0 || !Number.isFinite(graphic.durationSeconds) || graphic.durationSeconds < EDITING_GRAPHIC_MIN_DURATION || graphic.startSeconds + graphic.durationSeconds > timelineDuration + 0.01) add('invalid-graphic', graphic.id)
  return { errors }
}
