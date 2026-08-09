import { readdir, stat } from 'node:fs/promises'
import { basename, join, normalize, resolve } from 'node:path'
import { isMediaImportCandidatePath, normalizeMediaImportDirectories } from './media-import-inbox'
import type { MediaImportInboxFile, MediaImportInboxScanProgress, MediaImportInboxScanResult } from '../../shared/media-import-inbox'

const MAX_DISCOVERED_FILES = 10_000

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return
  const error = new Error('本地导入收件箱扫描已取消')
  error.name = 'AbortError'
  throw error
}

export function isMediaImportInboxScanAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export type MediaImportInboxScanOptions = {
  directories: readonly string[]
  recursive: boolean
  signal: AbortSignal
  onProgress: (progress: MediaImportInboxScanProgress) => void
}

export async function scanMediaImportInbox({ directories, recursive, signal, onProgress }: MediaImportInboxScanOptions): Promise<MediaImportInboxScanResult> {
  const roots = normalizeMediaImportDirectories(directories)
  const pendingDirectories = [...roots]
  const scannedDirectoryPaths: string[] = []
  const files: MediaImportInboxFile[] = []
  let failedDirectories = 0
  let lastReportedAt = 0
  let truncated = false

  const report = (status: MediaImportInboxScanProgress['status'], currentPath?: string, message?: string): void => {
    const now = Date.now()
    if (status === 'scanning' && now - lastReportedAt < 100 && files.length % 25 !== 0) return
    lastReportedAt = now
    onProgress({
      status,
      directoriesScanned: scannedDirectoryPaths.length,
      discoveredVideos: files.length,
      failedDirectories,
      currentDirectoryPath: scannedDirectoryPaths[scannedDirectoryPaths.length - 1],
      currentPath,
      message
    })
  }

  while (pendingDirectories.length > 0) {
    throwIfAborted(signal)
    const currentDirectory = pendingDirectories.shift() as string
    let entries
    try {
      entries = (await readdir(currentDirectory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
    } catch {
      failedDirectories += 1
      report('scanning', currentDirectory, '部分目录无法读取，已跳过')
      continue
    }

    scannedDirectoryPaths.push(currentDirectory)
    report('scanning', currentDirectory)
    for (const entry of entries) {
      throwIfAborted(signal)
      if (entry.name.startsWith('.')) continue
      const entryPath = normalize(resolve(join(currentDirectory, entry.name)))
      if (entry.isDirectory()) {
        if (recursive) pendingDirectories.push(entryPath)
        continue
      }
      if (!entry.isFile() || !isMediaImportCandidatePath(entryPath)) continue
      if (files.length >= MAX_DISCOVERED_FILES) {
        truncated = true
        continue
      }
      try {
        const fileStat = await stat(entryPath)
        if (!fileStat.isFile() || fileStat.size < 0 || fileStat.mtimeMs <= 0) continue
        files.push({ path: entryPath, fileName: basename(entryPath), directoryPath: currentDirectory, sizeBytes: fileStat.size, mtimeMs: fileStat.mtimeMs })
        report('scanning', entryPath)
      } catch {
        // A file can disappear while a producer is moving it into the inbox.
      }
    }
  }

  files.sort((left, right) => left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: 'base' }))
  report('completed', undefined, truncated ? `扫描完成，已限制为 ${MAX_DISCOVERED_FILES} 个视频` : `扫描完成，共发现 ${files.length} 个视频`)
  return {
    status: 'completed',
    files,
    scannedDirectories: scannedDirectoryPaths,
    directoriesScanned: scannedDirectoryPaths.length,
    discoveredVideos: files.length,
    failedDirectories,
    truncated
  }
}
