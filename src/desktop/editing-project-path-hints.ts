import { existsSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import type { EditingProject, EditingCaptionPathHints, EditingCaptionPreferredPaths } from '../shared/editing-types'

function normalizePortablePathHint(value: string): string {
  return value.replace(/[\\/]+/gu, sep)
}

function resolvePortableHint(projectDirectory: string, hint: string): string {
  return resolve(projectDirectory, normalizePortablePathHint(hint))
}

/**
 * Resolves an existing path when only filename casing differs. It walks the
 * already-resolved path one directory at a time and refuses ambiguous names.
 */
export function resolveEditingProjectPathCaseInsensitive(path: string): string | null {
  const parsed = parse(path)
  let current = parsed.root
  const segments = path.slice(parsed.root.length).split(sep).filter(Boolean)
  for (const segment of segments) {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return null
    }
    const matches = entries.filter((entry) => entry.name.toLocaleLowerCase() === segment.toLocaleLowerCase())
    if (matches.length !== 1) return null
    current = join(current, matches[0]!.name)
  }
  return existsSync(current) ? current : null
}

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
export function resolveEditingProjectSourcePathHints(project: EditingProject, projectFilePath: string, isAvailable: (path: string) => boolean, resolveAvailablePath: (path: string) => string | null = (path) => isAvailable(path) ? path : null): EditingProject {
  const projectDirectory = dirname(projectFilePath)
  const resolvedProject: EditingProject = {
    ...project,
    sources: project.sources.map((source) => {
      if (!source.relativePath || isAvailable(source.path)) return source
      const hintedPath = resolvePortableHint(projectDirectory, source.relativePath)
      const resolvedPath = resolveAvailablePath(hintedPath)
      if (!resolvedPath) return source
      return { ...source, path: resolvedPath, fingerprint: `${resolvedPath}:${source.durationSeconds}` }
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
      const hintedPath = resolvePortableHint(projectDirectory, hint)
      const resolvedHint = resolveAvailablePath(hintedPath)
      if (resolvedHint) {
        current[kind] = resolvedHint
      } else if (!resolveAvailablePath(current[kind] ?? '')) {
        current[kind] = null
      }
    }
  }
  return { ...resolvedProject, captionSourcePaths }
}
