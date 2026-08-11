import { mkdirSync, readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { TaskCenterEvent, TaskCenterKind, TaskCenterStatus } from '../../shared/task-center-types'
import { isTaskCenterActive } from '../../shared/task-center-types'

export const TASK_CENTER_SCHEMA_VERSION = 1
export const TASK_CENTER_MAX_EVENTS = 40

type TaskCenterManifest = {
  schemaVersion: number
  events: TaskCenterEvent[]
}

const taskKinds: readonly TaskCenterKind[] = ['asr', 'batch-subtitle', 'vision-index', 'vision-export', 'media-import', 'evidence', 'drama', 'drama-generation']
const taskStatuses: readonly TaskCenterStatus[] = ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled']

function isTaskKind(value: unknown): value is TaskCenterKind {
  return typeof value === 'string' && taskKinds.includes(value as TaskCenterKind)
}

function isTaskStatus(value: unknown): value is TaskCenterStatus {
  return typeof value === 'string' && taskStatuses.includes(value as TaskCenterStatus)
}

function normalizeEvent(value: unknown): TaskCenterEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<TaskCenterEvent>
  if (typeof raw.id !== 'string' || !raw.id.trim() || !isTaskKind(raw.kind) || !isTaskStatus(raw.status)) return null
  if (typeof raw.title !== 'string' || typeof raw.message !== 'string' || typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) return null
  const progress = raw.progress === null || raw.progress === undefined ? null : typeof raw.progress === 'number' && Number.isFinite(raw.progress) ? Math.max(0, Math.min(1, raw.progress)) : null
  return {
    id: raw.id.trim().slice(0, 256),
    kind: raw.kind,
    status: raw.status,
    title: raw.title.trim().slice(0, 120),
    message: raw.message.trim().slice(0, 1_000),
    progress,
    ...(typeof raw.current === 'string' && raw.current.trim() ? { current: raw.current.trim().slice(0, 512) } : {}),
    updatedAt: raw.updatedAt
  }
}

function normalizeEvents(value: unknown): TaskCenterEvent[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const raw = value as Partial<TaskCenterManifest>
  if (raw.schemaVersion !== TASK_CENTER_SCHEMA_VERSION || !Array.isArray(raw.events)) return []
  return raw.events.map(normalizeEvent).filter((event): event is TaskCenterEvent => event !== null).filter((event) => !isTaskCenterActive(event.status)).sort((left, right) => right.updatedAt - left.updatedAt).slice(0, TASK_CENTER_MAX_EVENTS)
}

export function getTaskCenterStorePath(userDataPath: string): string {
  return join(userDataPath, 'task-center.json')
}

export class TaskCenterStore {
  private readonly manifestPath: string
  private events: TaskCenterEvent[]
  private writeChain: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    this.manifestPath = getTaskCenterStorePath(userDataPath)
    mkdirSync(dirname(this.manifestPath), { recursive: true })
    try {
      this.events = normalizeEvents(JSON.parse(readFileSync(this.manifestPath, 'utf8')))
    } catch {
      this.events = []
    }
  }

  list(): TaskCenterEvent[] {
    return this.events.map((event) => ({ ...event }))
  }

  clearFinished(): void {
    this.events = []
    this.enqueueWrite()
  }

  record(event: TaskCenterEvent): void {
    if (isTaskCenterActive(event.status)) return
    const normalized = normalizeEvent(event)
    if (!normalized) return
    this.events = [...this.events.filter((item) => item.id !== normalized.id), normalized].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, TASK_CENTER_MAX_EVENTS)
    this.enqueueWrite()
  }

  private enqueueWrite(): void {
    const manifest: TaskCenterManifest = { schemaVersion: TASK_CENTER_SCHEMA_VERSION, events: this.events }
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.manifestPath), { recursive: true })
      const temporaryPath = `${this.manifestPath}.${process.pid}.tmp`
      await writeFile(temporaryPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.manifestPath)
    }).catch(() => undefined)
  }

  async flush(): Promise<void> {
    await this.writeChain
  }
}
