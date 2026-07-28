import {
  EDITING_PROJECT_SCHEMA_VERSION,
  type EditingProject,
  type EditingSource
} from '../../shared/editing-types'

export type EditingProjectOptions = {
  projectId?: string
  clipId?: string
  title?: string
  now?: number
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Creates a new project with the complete source as its first video clip. */
export function createEditingProject(source: EditingSource, options: EditingProjectOptions = {}): EditingProject {
  const now = options.now ?? Date.now()
  const durationSeconds = Math.max(0, Number.isFinite(source.durationSeconds) ? source.durationSeconds : 0)

  return {
    schemaVersion: EDITING_PROJECT_SCHEMA_VERSION,
    id: options.projectId ?? createId('project'),
    title: options.title?.trim() || source.name,
    createdAt: now,
    updatedAt: now,
    sources: [{ ...source, durationSeconds }],
    videoClips: durationSeconds > 0
      ? [{
          id: options.clipId ?? createId('clip'),
          sourceId: source.id,
          sourceStartSeconds: 0,
          sourceEndSeconds: durationSeconds
        }]
      : [],
    captions: []
  }
}
