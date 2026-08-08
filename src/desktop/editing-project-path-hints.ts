import { dirname, isAbsolute, relative, resolve } from 'node:path'
import type { EditingProject, EditingCaptionPathHints, EditingCaptionPreferredPaths } from '../shared/editing-types'

function toRelativePathHint(projectDirectory: string, path: string | null | undefined): string | null {
  if (!path || !isAbsolute(path)) return null
  const relativePath = relative(projectDirectory, path)
  return relativePath || null
}

function addCaptionPathHints(project: EditingProject, projectDirectory: string): EditingCaptionPathHints | undefined {
  if (!project.captionSourcePaths) return undefined
  return Object.fromEntries(Object.entries(project.captionSourcePaths).map(([sourceId, paths]) => [sourceId, {
    source: toRelativePathHint(projectDirectory, paths.source),
    translation: toRelativePathHint(projectDirectory, paths.translation)
  }]))
}

/**
 * Persists a portable path hint without replacing the absolute path used by
 * the renderer. The hint is intentionally derived at save time so a project
 * can be moved and saved again without retaining an obsolete location.
 */
export function addEditingProjectSourcePathHints(project: EditingProject, projectFilePath: string): EditingProject {
  const projectDirectory = dirname(projectFilePath)
  const captionSourcePathHints = addCaptionPathHints(project, projectDirectory)
  return {
    ...project,
    sources: project.sources.map((source) => {
      if (!isAbsolute(source.path)) return source
      const relativePath = relative(projectDirectory, source.path)
      return relativePath ? { ...source, relativePath } : source
    }),
    ...(captionSourcePathHints === undefined ? {} : { captionSourcePathHints })
  }
}

/**
 * Applies only an existing hint whose resolved target is available. Missing
 * or ambiguous media still follows the explicit renderer repair flow.
 */
export function resolveEditingProjectSourcePathHints(project: EditingProject, projectFilePath: string, isAvailable: (path: string) => boolean): EditingProject {
  const projectDirectory = dirname(projectFilePath)
  const resolvedProject: EditingProject = {
    ...project,
    sources: project.sources.map((source) => {
      if (!source.relativePath || isAvailable(source.path)) return source
      const hintedPath = resolve(projectDirectory, source.relativePath)
      if (!isAvailable(hintedPath)) return source
      return { ...source, path: hintedPath, fingerprint: `${hintedPath}:${source.durationSeconds}` }
    })
  }
  if (!resolvedProject.captionSourcePaths || !resolvedProject.captionSourcePathHints) return resolvedProject
  const captionSourcePaths: EditingCaptionPreferredPaths = Object.fromEntries(Object.entries(resolvedProject.captionSourcePaths).map(([sourceId, paths]) => [sourceId, { ...paths }]))
  for (const [sourceId, hints] of Object.entries(resolvedProject.captionSourcePathHints)) {
    const current = captionSourcePaths[sourceId]
    if (!current) continue
    for (const kind of ['source', 'translation'] as const) {
      const hint = hints[kind]
      if (!hint) continue
      const hintedPath = resolve(projectDirectory, hint)
      if (isAvailable(hintedPath)) {
        current[kind] = hintedPath
      } else if (!isAvailable(current[kind] ?? '')) {
        current[kind] = null
      }
    }
  }
  return { ...resolvedProject, captionSourcePaths }
}
