import { watch } from 'node:fs'
import { isAbsolute, join, normalize, resolve } from 'node:path'

type CaptionWatchListener = (eventType: string, filename: string | Buffer | null) => void

export type EditingCaptionWatchHandle = {
  close: () => void
  on: (event: 'error', listener: () => void) => unknown
}

export type EditingCaptionDirectoryWatcherOptions = {
  directories: readonly string[]
  candidatePaths?: readonly string[]
  onChange: (paths: readonly string[]) => void
  debounceMs?: number
  watchDirectory?: (directory: string, listener: CaptionWatchListener) => EditingCaptionWatchHandle
}

export type EditingCaptionDirectoryWatcher = {
  watchedDirectories: string[]
  stop: () => void
}

const MAX_WATCH_DIRECTORIES = 64
const MAX_CANDIDATE_PATHS = 512
const DEFAULT_DEBOUNCE_MS = 250

function pathKey(path: string): string {
  const normalized = normalize(resolve(path))
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function normalizeDirectories(directories: readonly string[]): string[] {
  return [...new Set(directories
    .filter((directory): directory is string => typeof directory === 'string' && isAbsolute(directory))
    .map((directory) => normalize(resolve(directory))))].slice(0, MAX_WATCH_DIRECTORIES)
}

function normalizeCandidatePaths(paths: readonly string[]): Set<string> {
  return new Set(paths
    .filter((path): path is string => typeof path === 'string' && isAbsolute(path))
    .map(pathKey)
    .slice(0, MAX_CANDIDATE_PATHS))
}

function getChangedPath(directory: string, filename: string | Buffer | null): string {
  if (filename === null) return directory
  const name = typeof filename === 'string' ? filename : filename.toString()
  return name ? resolve(join(directory, name)) : directory
}

export function createEditingCaptionDirectoryWatcher({ directories, candidatePaths = [], onChange, debounceMs = DEFAULT_DEBOUNCE_MS, watchDirectory = (directory, listener) => watch(directory, { persistent: false }, listener) }: EditingCaptionDirectoryWatcherOptions): EditingCaptionDirectoryWatcher {
  const watchedDirectories = normalizeDirectories(directories)
  const candidatePathKeys = normalizeCandidatePaths(candidatePaths)
  const watchers: EditingCaptionWatchHandle[] = []
  const successfulDirectories: string[] = []
  const pendingPaths = new Map<string, string>()
  let flushTimer: NodeJS.Timeout | null = null
  let stopped = false

  const flush = (): void => {
    flushTimer = null
    if (stopped || pendingPaths.size === 0) return
    const paths = [...pendingPaths.values()]
    pendingPaths.clear()
    onChange(paths)
  }

  const queueChange = (directory: string, _eventType: string, filename: string | Buffer | null): void => {
    if (stopped) return
    const changedPath = getChangedPath(directory, filename)
    if (filename !== null && candidatePathKeys.size > 0 && !candidatePathKeys.has(pathKey(changedPath))) return
    pendingPaths.set(pathKey(changedPath), changedPath)
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, Math.max(0, debounceMs))
  }

  for (const directory of watchedDirectories) {
    try {
      const directoryWatcher = watchDirectory(directory, (eventType, filename) => queueChange(directory, eventType, filename))
      directoryWatcher.on('error', () => {
        directoryWatcher.close()
      })
      watchers.push(directoryWatcher)
      successfulDirectories.push(directory)
    } catch {
      // A candidate directory can disappear between project load and watch;
      // the next project/source change will request a fresh watcher.
    }
  }

  return {
    watchedDirectories: successfulDirectories,
    stop: () => {
      if (stopped) return
      stopped = true
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = null
      pendingPaths.clear()
      for (const watcher of watchers) watcher.close()
    }
  }
}
