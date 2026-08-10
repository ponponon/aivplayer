import { formatSrtTimestamp, formatVttTimestamp } from '../ai/subtitle-writer.ts'
import type { EditingCaption, EditingProject } from '../../shared/editing-types'
import { isEditingOrphanTranslationCaption } from './subtitle-reload'

/** Filters captions for a subtitle track; orphan translations stay project-only in every export mode. */
export function getEditingCaptionsForSubtitleExport(project: Pick<EditingProject, 'captions' | 'scriptSegments'>, kind?: EditingCaption['kind']): EditingCaption[] {
  return project.captions.filter((caption) => (kind === undefined || caption.kind === kind) && !isEditingOrphanTranslationCaption(project, caption))
}

export function serializeEditingCaptionsToSrt(captions: readonly EditingCaption[], kind: EditingCaption['kind'] = 'source'): string {
  const sourceCaptions = [...captions
    .filter((caption) => caption.kind === kind && caption.text.trim() && caption.durationSeconds > 0)
  ].sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))
  return sourceCaptions.map((caption, index) => {
    const startSeconds = Math.max(0, Number.isFinite(caption.startSeconds) ? caption.startSeconds : 0)
    const endSeconds = startSeconds + Math.max(0.1, caption.durationSeconds)
    return `${index + 1}\n${formatSrtTimestamp(startSeconds)} --> ${formatSrtTimestamp(endSeconds)}\n${caption.text.trim()}\n`
  }).join('\n')
}

export function serializeEditingCaptionsToVtt(captions: readonly EditingCaption[], kind: EditingCaption['kind'] = 'source'): string {
  const sourceCaptions = [...captions
    .filter((caption) => caption.kind === kind && caption.text.trim() && caption.durationSeconds > 0)
  ].sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))
  if (sourceCaptions.length === 0) return ''
  return `WEBVTT\n\n${sourceCaptions.map((caption) => {
    const startSeconds = Math.max(0, Number.isFinite(caption.startSeconds) ? caption.startSeconds : 0)
    const endSeconds = startSeconds + Math.max(0.1, caption.durationSeconds)
    const text = caption.text.trim().replace(/\r\n?/gu, '\n')
      .replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    return `${formatVttTimestamp(startSeconds)} --> ${formatVttTimestamp(endSeconds)}\n${text}`
  }).join('\n\n')}\n`
}
