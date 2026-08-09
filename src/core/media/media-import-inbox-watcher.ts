import { watch } from 'node:fs'
import { isAbsolute, normalize, resolve } from 'node:path'

type MediaImportWatchListener = (eventType: string, filename: string | Buffer | null) => void

export type MediaImportWatchHandle = {
  close: () => void
  on: (event: 'error', listener: () => void) => unknown
}

export type MediaImportInboxWatcherOptions = {
  directories: readonly string[]
  onChange: (directories: readonly string[]) => void
  debounceMs?: number
  recursive?: boolean
  watchDirectory?: (directory: string, recursive: boolean, listener: MediaImportWatchListener) => MediaImportWatchHandle
}

export type MediaImportInboxWatcher = {
  watchedDirectories: string[]
  stop: () => void
}

const MAX_WATCH_DIRECTORIES = 50
const DEFAULT_DEBOUNCE_MS = 750

function createDefaultWatchHandle(directory: string, recursive: boolean, listener: MediaImportWatchListener): MediaImportWatchHandle {
  try {
    return watch(directory, { persistent: false, recursive }, listener)
  } catch (error) {
    // Linux does not support recursive fs.watch. Keep the watcher useful for
    // the configured root and let the next event trigger a full recursive scan.
    if (!recursive) throw error
    return watch(directory, { persistent: false, recursive: false }, listener)
  }
}

function normalizeDirectories(directories: readonly string[]): string[] {
  return [...new Set(directories
    .filter((directory): directory is string => typeof directory === 'string' && isAbsolute(directory))
    .map((directory) => normalize(resolve(directory))))].slice(0, MAX_WATCH_DIRECTORIES)
}

export function createMediaImportInboxWatcher({
  directories,
  onChange,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  recursive = true,
  watchDirectory = createDefaultWatchHandle
}: MediaImportInboxWatcherOptions): MediaImportInboxWatcher {
  const normalizedDirectories = normalizeDirectories(directories)
  const watchers: MediaImportWatchHandle[] = []
  const watchedDirectories: string[] = []
  let flushTimer: NodeJS.Timeout | null = null
  let stopped = false
  let hasPendingChange = false

  const flush = (): void => {
    flushTimer = null
    if (stopped || !hasPendingChange) return
    hasPendingChange = false
    onChange([...watchedDirectories])
  }

  const queueChange = (): void => {
    if (stopped) return
    hasPendingChange = true
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, Math.max(0, debounceMs))
  }

  for (const directory of normalizedDirectories) {
    try {
      const directoryWatcher = watchDirectory(directory, recursive, () => queueChange())
      directoryWatcher.on('error', () => directoryWatcher.close())
      watchers.push(directoryWatcher)
      watchedDirectories.push(directory)
    } catch {
      // The directory may be created after startup; the next configuration
      // update or manual scan can retry it without taking down the app.
    }
  }

  return {
    watchedDirectories,
    stop: () => {
      if (stopped) return
      stopped = true
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = null
      hasPendingChange = false
      for (const watcher of watchers) watcher.close()
    }
  }
}
