import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { isVideoFilePath } from '../media/file-opening'
import type { VisionDirectoryScanProgress, VisionDirectoryScanResult } from '../../shared/vision-types'

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return
  const error = new Error('影视库文件夹扫描已取消')
  error.name = 'AbortError'
  throw error
}

export function isVisionScanAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export async function scanVisionDirectory(
  directoryPath: string,
  recursive: boolean,
  signal: AbortSignal,
  onProgress: (progress: VisionDirectoryScanProgress) => void
): Promise<VisionDirectoryScanResult> {
  const rootPath = resolve(directoryPath)
  const rootStat = await stat(rootPath)
  if (!rootStat.isDirectory()) throw new Error('影视库扫描路径不是文件夹')

  const pendingDirectories = [rootPath]
  const files: string[] = []
  let scannedDirectories = 0
  let lastReportedAt = 0

  const report = (currentPath?: string, force = false): void => {
    const now = Date.now()
    if (!force && now - lastReportedAt < 100 && files.length % 25 !== 0) return
    lastReportedAt = now
    onProgress({
      status: 'scanning',
      directoryPath: rootPath,
      scannedDirectories,
      discoveredVideos: files.length,
      currentPath
    })
  }

  while (pendingDirectories.length > 0) {
    throwIfAborted(signal)
    const currentDirectory = pendingDirectories.shift() as string
    const entries = (await readdir(currentDirectory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
    scannedDirectories += 1
    report(currentDirectory, true)

    for (const entry of entries) {
      throwIfAborted(signal)
      const entryPath = join(currentDirectory, entry.name)
      if (entry.isDirectory()) {
        if (recursive) pendingDirectories.push(entryPath)
        continue
      }
      if (!entry.isFile() || !isVideoFilePath(entryPath)) continue
      files.push(entryPath)
      report(entryPath)
    }
  }

  files.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
  report(undefined, true)
  return {
    status: 'completed',
    directoryPath: rootPath,
    files,
    scannedDirectories,
    discoveredVideos: files.length
  }
}
