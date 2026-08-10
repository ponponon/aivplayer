import { resolve } from 'node:path'

export const VISION_SEARCH_EXPORT_RECREATE_BATCH_MAX = 8

export function normalizeVisionSearchExportOutputPath(outputPath: string): string {
  const normalized = resolve(outputPath.trim())
  return process.platform === 'win32' || process.platform === 'darwin' ? normalized.toLowerCase() : normalized
}

export function normalizeVisionSearchExportTaskIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const taskIds: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const taskId = item.trim()
    if (!taskId || seen.has(taskId)) continue
    seen.add(taskId)
    taskIds.push(taskId)
    if (taskIds.length >= VISION_SEARCH_EXPORT_RECREATE_BATCH_MAX) break
  }
  return taskIds
}
