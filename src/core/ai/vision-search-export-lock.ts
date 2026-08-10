import { open, readFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

export const VISION_SEARCH_EXPORT_OUTPUT_LOCK_SCHEMA_VERSION = 1

export type VisionSearchExportOutputLockMetadata = {
  schemaVersion: typeof VISION_SEARCH_EXPORT_OUTPUT_LOCK_SCHEMA_VERSION
  token: string
  pid: number
  createdAt: number
  outputPath: string
  taskId?: string
}

export type VisionSearchExportOutputLock = {
  lockPath: string
  metadata: VisionSearchExportOutputLockMetadata
  release: () => Promise<void>
}

export class VisionSearchExportOutputLockError extends Error {
  readonly code = 'VISION_SEARCH_EXPORT_OUTPUT_LOCKED'

  constructor(
    readonly outputPath: string,
    readonly lockPath: string,
    readonly owner?: VisionSearchExportOutputLockMetadata
  ) {
    super('视觉搜索导出输出路径已被占用')
    this.name = 'VisionSearchExportOutputLockError'
  }
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
}

function parseOwner(value: string): VisionSearchExportOutputLockMetadata | undefined {
  try {
    const raw = JSON.parse(value) as Partial<VisionSearchExportOutputLockMetadata>
    if (raw.schemaVersion !== VISION_SEARCH_EXPORT_OUTPUT_LOCK_SCHEMA_VERSION
      || typeof raw.token !== 'string' || !raw.token
      || typeof raw.pid !== 'number' || !Number.isInteger(raw.pid) || raw.pid <= 0
      || typeof raw.createdAt !== 'number' || !Number.isFinite(raw.createdAt)
      || typeof raw.outputPath !== 'string' || !raw.outputPath) return undefined
    return {
      schemaVersion: VISION_SEARCH_EXPORT_OUTPUT_LOCK_SCHEMA_VERSION,
      token: raw.token,
      pid: raw.pid,
      createdAt: raw.createdAt,
      outputPath: raw.outputPath,
      ...(typeof raw.taskId === 'string' && raw.taskId ? { taskId: raw.taskId } : {})
    }
  } catch {
    return undefined
  }
}

async function readOwner(lockPath: string): Promise<VisionSearchExportOutputLockMetadata | undefined> {
  try {
    return parseOwner(await readFile(lockPath, 'utf8'))
  } catch {
    return undefined
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return errorCode(error) === 'EPERM'
  }
}

async function removeStaleLock(lockPath: string): Promise<boolean> {
  const owner = await readOwner(lockPath)
  if (!owner || isProcessAlive(owner.pid)) return false
  try {
    await unlink(lockPath)
    return true
  } catch (error) {
    return errorCode(error) === 'ENOENT'
  }
}

export function getVisionSearchExportOutputLockPath(outputPath: string): string {
  return `${resolve(outputPath)}.aivplayer.lock`
}

export async function acquireVisionSearchExportOutputLock(outputPath: string, taskId?: string): Promise<VisionSearchExportOutputLock> {
  const normalizedOutputPath = resolve(outputPath)
  const lockPath = getVisionSearchExportOutputLockPath(normalizedOutputPath)
  const metadata: VisionSearchExportOutputLockMetadata = {
    schemaVersion: VISION_SEARCH_EXPORT_OUTPUT_LOCK_SCHEMA_VERSION,
    token: randomUUID(),
    pid: process.pid,
    createdAt: Date.now(),
    outputPath: normalizedOutputPath,
    ...(taskId?.trim() ? { taskId: taskId.trim().slice(0, 128) } : {})
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx', 0o600)
      try {
        await handle.writeFile(`${JSON.stringify(metadata)}\n`, 'utf8')
        await handle.sync()
      } catch (error) {
        await handle.close().catch(() => undefined)
        await unlink(lockPath).catch(() => undefined)
        throw error
      }

      let released = false
      return {
        lockPath,
        metadata,
        release: async () => {
          if (released) return
          released = true
          await handle.close()
          const owner = await readOwner(lockPath)
          if (owner?.token !== metadata.token) return
          await unlink(lockPath).catch((error) => {
            if (errorCode(error) !== 'ENOENT') throw error
          })
        }
      }
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error
      if (attempt === 0 && await removeStaleLock(lockPath)) continue
      throw new VisionSearchExportOutputLockError(normalizedOutputPath, lockPath, await readOwner(lockPath))
    }
  }

  throw new VisionSearchExportOutputLockError(normalizedOutputPath, lockPath, await readOwner(lockPath))
}

export async function withVisionSearchExportOutputLock<T>(
  outputPath: string,
  operation: () => Promise<T>,
  taskId?: string
): Promise<T> {
  const lock = await acquireVisionSearchExportOutputLock(outputPath, taskId)
  try {
    return await operation()
  } finally {
    await lock.release()
  }
}
