export type EditingCaptionWatchRequest = {
  directories: readonly string[]
  candidatePaths: readonly string[]
}

export type EditingCaptionWatchStartResult = {
  directories: string[]
  watchedDirectories: string[]
}

export type EditingCaptionFilesChangedEvent = {
  paths: string[]
}

/**
 * Keeps the renderer independent from node:path while deriving the narrow
 * directory set that the desktop watcher is allowed to observe.
 */
export function getEditingCaptionWatchDirectories(paths: readonly (string | null | undefined)[]): string[] {
  const directories = new Set<string>()
  for (const path of paths) {
    if (!path) continue
    const separatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    if (separatorIndex < 0) continue
    if (separatorIndex === 0) {
      directories.add(path.slice(0, 1))
      continue
    }
    if (separatorIndex === 2 && /^[A-Za-z]:[\\/]$/u.test(path.slice(0, 3))) {
      directories.add(path.slice(0, 3))
      continue
    }
    directories.add(path.slice(0, separatorIndex))
  }
  return [...directories]
}
