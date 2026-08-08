import { dirname, isAbsolute, relative, resolve } from 'node:path'
import type { EditingProject } from '../shared/editing-types'

/**
 * Persists a portable path hint without replacing the absolute path used by
 * the renderer. The hint is intentionally derived at save time so a project
 * can be moved and saved again without retaining an obsolete location.
 */
export function addEditingProjectSourcePathHints(project: EditingProject, projectFilePath: string): EditingProject {
  const projectDirectory = dirname(projectFilePath)
  return {
    ...project,
    sources: project.sources.map((source) => {
      if (!isAbsolute(source.path)) return source
      const relativePath = relative(projectDirectory, source.path)
      return relativePath ? { ...source, relativePath } : source
    })
  }
}

/**
 * Applies only an existing hint whose resolved target is available. Missing
 * or ambiguous media still follows the explicit renderer repair flow.
 */
export function resolveEditingProjectSourcePathHints(project: EditingProject, projectFilePath: string, isAvailable: (path: string) => boolean): EditingProject {
  const projectDirectory = dirname(projectFilePath)
  return {
    ...project,
    sources: project.sources.map((source) => {
      if (!source.relativePath || isAvailable(source.path)) return source
      const hintedPath = resolve(projectDirectory, source.relativePath)
      if (!isAvailable(hintedPath)) return source
      return { ...source, path: hintedPath, fingerprint: `${hintedPath}:${source.durationSeconds}` }
    })
  }
}
