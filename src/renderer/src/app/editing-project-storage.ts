import type { EditingProject, EditingSource } from '../../../shared/editing-types'

const EDITING_PROJECT_STORAGE_KEY = 'aivplayer.editing-projects.v1'
const MAX_STORED_PROJECTS = 20

function readStoredProjects(): Record<string, EditingProject> {
  if (typeof window === 'undefined') return {}
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(EDITING_PROJECT_STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed as Record<string, EditingProject> : {}
  } catch {
    return {}
  }
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isValidClipAudio(clip: EditingProject['videoClips'][number]): boolean {
  return (clip.volume === undefined || (Number.isFinite(clip.volume) && clip.volume >= 0 && clip.volume <= 1)) && (clip.muted === undefined || typeof clip.muted === 'boolean')
}

export function isEditingProjectCompatible(project: EditingProject | null, source: EditingSource): project is EditingProject {
  const projectSource = project?.sources[0]
  if (!project || project.schemaVersion !== 1 || !projectSource) return false
  if (projectSource.path !== source.path || projectSource.fingerprint !== source.fingerprint) return false
  const sources = new Map(project.sources.map((item) => [item.id, item]))
  return project.videoClips.every((clip) => {
    const clipSource = sources.get(clip.sourceId)
    return Boolean(clipSource && isValidClipAudio(clip) && isFiniteNonNegative(clip.sourceStartSeconds) && isFiniteNonNegative(clip.sourceEndSeconds) && clip.sourceEndSeconds > clip.sourceStartSeconds && clip.sourceEndSeconds <= clipSource.durationSeconds + 0.01)
  })
}

export function loadEditingProject(source: EditingSource): EditingProject | null {
  const project = readStoredProjects()[source.fingerprint]
  return isEditingProjectCompatible(project ?? null, source) ? project : null
}

export function saveEditingProject(project: EditingProject): void {
  const source = project.sources[0]
  if (!source || typeof window === 'undefined') return
  try {
    const projects = readStoredProjects()
    projects[source.fingerprint] = project
    const entries = Object.entries(projects).sort((left, right) => (right[1]?.updatedAt ?? 0) - (left[1]?.updatedAt ?? 0)).slice(0, MAX_STORED_PROJECTS)
    window.localStorage.setItem(EDITING_PROJECT_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Storage can be unavailable in private or restricted renderer contexts.
  }
}
