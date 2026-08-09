import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { isVideoFilePath } from './file-opening'
import {
  MEDIA_IMPORT_INBOX_SCHEMA_VERSION,
  type MediaImportInboxFile,
  type MediaImportInboxItem,
  type MediaImportInboxMetadata,
  type MediaImportInboxMetadataPatch,
  type MediaImportInboxManifest,
  type MediaImportInboxPipeline,
  type MediaImportInboxBatchAction,
  type MediaImportInboxStatus
} from '../../shared/media-import-inbox'

export const MEDIA_IMPORT_INBOX_MAX_DIRECTORIES = 50
export const MEDIA_IMPORT_INBOX_MAX_ITEMS = 10_000
export const MEDIA_IMPORT_INBOX_MAX_TAGS = 32
export const MEDIA_IMPORT_INBOX_MAX_TAG_LENGTH = 64
export const MEDIA_IMPORT_INBOX_MAX_NOTE_LENGTH = 2_000
export const MEDIA_IMPORT_INBOX_MAX_SOURCE_LENGTH = 512
export const MEDIA_IMPORT_INBOX_MAX_PROJECT_ID_LENGTH = 128
export const MEDIA_IMPORT_INBOX_MAX_BATCH_ITEMS = 500

const IMPORT_TEMP_SUFFIXES = ['.part', '.partial', '.download', '.downloading', '.tmp'] as const

export function createDefaultMediaImportInboxMetadata(): MediaImportInboxMetadata {
  return { tags: [], favorite: false, note: '', source: null, projectId: null }
}

export function createDefaultMediaImportInboxPipeline(): MediaImportInboxPipeline {
  return { metadata: 'pending', subtitle: 'pending', vision: 'pending' }
}

function normalizePipeline(value: unknown): MediaImportInboxPipeline {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<MediaImportInboxPipeline> : {}
  const normalizeStage = (stage: unknown): MediaImportInboxPipeline[keyof MediaImportInboxPipeline] =>
    stage === 'processing' || stage === 'ready' || stage === 'skipped' || stage === 'failed' ? stage : 'pending'
  return {
    metadata: normalizeStage(raw.metadata),
    subtitle: normalizeStage(raw.subtitle),
    vision: normalizeStage(raw.vision)
  }
}

function normalizeNullableText(value: unknown, fallback: string | null, maxLength: number): string | null {
  if (value === null) return null
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().slice(0, maxLength)
  return normalized || null
}

function normalizeTags(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const seen = new Set<string>()
  const tags: string[] = []
  for (const rawTag of value) {
    if (typeof rawTag !== 'string') continue
    const tag = rawTag.trim().slice(0, MEDIA_IMPORT_INBOX_MAX_TAG_LENGTH)
    if (!tag) continue
    const key = tag.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length >= MEDIA_IMPORT_INBOX_MAX_TAGS) break
  }
  return tags
}

export function normalizeMediaImportInboxMetadata(value: unknown, fallback = createDefaultMediaImportInboxMetadata()): MediaImportInboxMetadata {
  const metadata = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<MediaImportInboxMetadata> : {}
  return {
    tags: normalizeTags(metadata.tags, fallback.tags),
    favorite: typeof metadata.favorite === 'boolean' ? metadata.favorite : fallback.favorite,
    note: typeof metadata.note === 'string' ? metadata.note.trim().slice(0, MEDIA_IMPORT_INBOX_MAX_NOTE_LENGTH) : fallback.note,
    source: normalizeNullableText(metadata.source, fallback.source, MEDIA_IMPORT_INBOX_MAX_SOURCE_LENGTH),
    projectId: normalizeNullableText(metadata.projectId, fallback.projectId, MEDIA_IMPORT_INBOX_MAX_PROJECT_ID_LENGTH)
  }
}

function areMetadataEqual(left: MediaImportInboxMetadata, right: MediaImportInboxMetadata): boolean {
  return left.favorite === right.favorite && left.note === right.note && left.source === right.source && left.projectId === right.projectId && left.tags.length === right.tags.length && left.tags.every((tag, index) => tag === right.tags[index])
}

function pathKey(filePath: string): string {
  const normalized = normalize(resolve(filePath))
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export function normalizeMediaImportDirectories(directories: readonly string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const directory of directories) {
    if (typeof directory !== 'string' || !isAbsolute(directory)) continue
    const resolved = normalize(resolve(directory))
    const key = pathKey(resolved)
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(resolved)
    if (normalized.length >= MEDIA_IMPORT_INBOX_MAX_DIRECTORIES) break
  }
  return normalized
}

export function isMediaImportCandidatePath(filePath: string): boolean {
  const fileName = basename(filePath)
  if (!fileName || fileName.startsWith('.')) return false
  const lowerName = fileName.toLowerCase()
  if (IMPORT_TEMP_SUFFIXES.some((suffix) => lowerName.endsWith(suffix))) return false
  return isVideoFilePath(filePath)
}

export function getMediaImportInboxItemId(filePath: string): string {
  return createHash('sha256').update(pathKey(filePath)).digest('hex').slice(0, 32)
}

function isSameFileVersion(left: MediaImportInboxItem, right: MediaImportInboxFile): boolean {
  return left.sizeBytes === right.sizeBytes && left.mtimeMs === right.mtimeMs
}

function isPathWithinDirectory(filePath: string, directoryPath: string): boolean {
  const relativePath = relative(pathKey(directoryPath), pathKey(filePath))
  const parentPrefix = `..${process.platform === 'win32' ? '\\' : '/'}`
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(parentPrefix) && !isAbsolute(relativePath))
}

function normalizeDiscoveredFile(file: MediaImportInboxFile): MediaImportInboxFile | null {
  if (!file || typeof file.path !== 'string' || !isAbsolute(file.path) || !isMediaImportCandidatePath(file.path)) return null
  if (typeof file.sizeBytes !== 'number' || !Number.isFinite(file.sizeBytes) || file.sizeBytes < 0) return null
  if (typeof file.mtimeMs !== 'number' || !Number.isFinite(file.mtimeMs) || file.mtimeMs <= 0) return null
  const path = normalize(resolve(file.path))
  return {
    path,
    fileName: basename(path),
    directoryPath: normalize(resolve(dirname(path))),
    sizeBytes: Math.round(file.sizeBytes),
    mtimeMs: file.mtimeMs
  }
}

export function mergeMediaImportInboxItems(
  existingItems: readonly MediaImportInboxItem[],
  discoveredFiles: readonly MediaImportInboxFile[],
  scannedDirectories: readonly string[] = [],
  now = Date.now()
): MediaImportInboxItem[] {
  const byPath = new Map<string, MediaImportInboxItem>()
  for (const rawItem of existingItems) {
    if (!rawItem || typeof rawItem.path !== 'string' || !isAbsolute(rawItem.path)) continue
    const path = normalize(resolve(rawItem.path))
    const id = getMediaImportInboxItemId(path)
    const status: MediaImportInboxStatus = ['discovered', 'queued', 'processing', 'ready', 'ignored', 'failed', 'missing'].includes(rawItem.status) ? rawItem.status : 'discovered'
    byPath.set(pathKey(path), {
      path,
      fileName: basename(path),
      directoryPath: normalize(resolve(dirname(path))),
      sizeBytes: typeof rawItem.sizeBytes === 'number' && Number.isFinite(rawItem.sizeBytes) && rawItem.sizeBytes >= 0 ? rawItem.sizeBytes : 0,
      mtimeMs: typeof rawItem.mtimeMs === 'number' && Number.isFinite(rawItem.mtimeMs) && rawItem.mtimeMs > 0 ? rawItem.mtimeMs : now,
      id,
      status,
      discoveredAt: typeof rawItem.discoveredAt === 'number' && Number.isFinite(rawItem.discoveredAt) && rawItem.discoveredAt > 0 ? rawItem.discoveredAt : now,
      updatedAt: typeof rawItem.updatedAt === 'number' && Number.isFinite(rawItem.updatedAt) && rawItem.updatedAt > 0 ? rawItem.updatedAt : now,
      metadata: normalizeMediaImportInboxMetadata(rawItem.metadata),
      pipeline: normalizePipeline(rawItem.pipeline),
      ...(typeof rawItem.lastError === 'string' && rawItem.lastError.trim() ? { lastError: rawItem.lastError.trim().slice(0, 2000) } : {})
    })
  }

  const discoveredKeys = new Set<string>()
  for (const rawFile of discoveredFiles) {
    const file = normalizeDiscoveredFile(rawFile)
    if (!file) continue
    const key = pathKey(file.path)
    discoveredKeys.add(key)
    const previous = byPath.get(key)
    if (!previous) {
      byPath.set(key, { ...file, id: getMediaImportInboxItemId(file.path), status: 'discovered', discoveredAt: now, updatedAt: now, metadata: createDefaultMediaImportInboxMetadata(), pipeline: createDefaultMediaImportInboxPipeline() })
      continue
    }

    if (!isSameFileVersion(previous, file)) {
      byPath.set(key, { ...previous, ...file, id: getMediaImportInboxItemId(file.path), status: 'discovered', updatedAt: now, pipeline: createDefaultMediaImportInboxPipeline(), lastError: undefined })
      continue
    }

    byPath.set(key, { ...previous, ...file, id: getMediaImportInboxItemId(file.path), status: previous.status === 'missing' ? 'discovered' : previous.status, updatedAt: previous.status === 'missing' ? now : previous.updatedAt })
  }

  const directories = normalizeMediaImportDirectories(scannedDirectories)
  if (directories.length > 0) {
    for (const [key, item] of byPath) {
      if (!discoveredKeys.has(key) && directories.some((directory) => isPathWithinDirectory(item.path, directory)) && item.status !== 'missing') {
        byPath.set(key, { ...item, status: 'missing', updatedAt: now })
      }
    }
  }

  return [...byPath.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt || left.fileName.localeCompare(right.fileName, undefined, { numeric: true, sensitivity: 'base' }))
    .slice(0, MEDIA_IMPORT_INBOX_MAX_ITEMS)
}

export function transitionMediaImportInboxItem(
  item: MediaImportInboxItem,
  nextStatus: Exclude<MediaImportInboxStatus, 'missing'>,
  now = Date.now(),
  error?: string
): MediaImportInboxItem | null {
  if (nextStatus === 'queued' && item.status !== 'discovered' && item.status !== 'failed') return null
  if (nextStatus === 'processing' && item.status !== 'queued') return null
  if (nextStatus === 'ready' && item.status !== 'processing') return null
  if (nextStatus === 'ignored' && item.status !== 'discovered' && item.status !== 'failed') return null
  if (nextStatus === 'discovered' && item.status !== 'failed' && item.status !== 'ignored' && item.status !== 'missing') return null
  if (nextStatus === 'failed' && item.status !== 'discovered' && item.status !== 'queued' && item.status !== 'processing') return null
  return {
    ...item,
    status: nextStatus,
    updatedAt: now,
    ...(nextStatus === 'queued' ? { pipeline: createDefaultMediaImportInboxPipeline() } : {}),
    ...(nextStatus === 'failed' && error?.trim() ? { lastError: error.trim().slice(0, 2000) } : { lastError: undefined })
  }
}

export function transitionMediaImportInboxBatch(
  items: readonly MediaImportInboxItem[],
  itemIds: readonly string[],
  action: MediaImportInboxBatchAction,
  now = Date.now()
): MediaImportInboxItem[] | null {
  if (itemIds.length === 0 || itemIds.length > MEDIA_IMPORT_INBOX_MAX_BATCH_ITEMS) return null
  if (action !== 'queue' && action !== 'ignore' && action !== 'retry' && action !== 'clear') return null

  const requestedIds = [...new Set(itemIds.map((itemId) => itemId.trim()).filter(Boolean))]
  if (requestedIds.length !== itemIds.length) return null

  const indexes = requestedIds.map((itemId) => items.findIndex((item) => item.id === itemId))
  if (indexes.some((index) => index < 0)) return null

  const nextItems = items.map((item) => ({ ...item }))
  if (action === 'clear') {
    if (indexes.some((index) => nextItems[index]?.status !== 'ignored' && nextItems[index]?.status !== 'missing')) return null
    return nextItems.filter((_, index) => !indexes.includes(index))
  }
  for (const index of indexes) {
    const current = nextItems[index]
    if (action === 'retry' && current.status !== 'failed' && current.status !== 'ignored' && current.status !== 'missing') return null
    const next = action === 'retry'
      ? transitionMediaImportInboxItem(
          transitionMediaImportInboxItem(current, 'discovered', now) ?? current,
          'queued',
          now
        )
      : transitionMediaImportInboxItem(current, action === 'queue' ? 'queued' : 'ignored', now)
    if (!next) return null
    nextItems[index] = next
  }
  return nextItems
}

function parseManifest(value: unknown): MediaImportInboxItem[] {
  if (!value || typeof value !== 'object') return []
  const manifest = value as Partial<MediaImportInboxManifest>
  if (!Array.isArray(manifest.items)) return []
  return mergeMediaImportInboxItems(manifest.items as MediaImportInboxItem[], [])
}

export function getMediaImportInboxManifestPath(userDataPath: string): string {
  return join(userDataPath, 'media-import-inbox.json')
}

export function getMediaImportInboxSidecarPath(mediaPath: string): string {
  const normalizedPath = normalize(resolve(mediaPath))
  return join(dirname(normalizedPath), `.${basename(normalizedPath)}.aivplayer.json`)
}

type MediaImportInboxSidecar = {
  schemaVersion: number
  mediaId: string
  fileName: string
  metadata: MediaImportInboxMetadata
  updatedAt: number
}

async function readSidecarMetadata(mediaPath: string, itemId: string): Promise<{ metadata: MediaImportInboxMetadata; updatedAt: number } | null> {
  try {
    const parsed = JSON.parse(await readFile(getMediaImportInboxSidecarPath(mediaPath), 'utf8')) as Partial<MediaImportInboxSidecar>
    if (parsed.mediaId !== itemId || !parsed.metadata || typeof parsed.metadata !== 'object') return null
    return {
      metadata: normalizeMediaImportInboxMetadata(parsed.metadata),
      updatedAt: typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt) && parsed.updatedAt > 0 ? parsed.updatedAt : Date.now()
    }
  } catch {
    return null
  }
}

async function writeSidecarMetadata(mediaPath: string, itemId: string, metadata: MediaImportInboxMetadata, updatedAt: number): Promise<void> {
  const sidecarPath = getMediaImportInboxSidecarPath(mediaPath)
  const temporaryPath = `${sidecarPath}.${process.pid}.tmp`
  const sidecar: MediaImportInboxSidecar = {
    schemaVersion: MEDIA_IMPORT_INBOX_SCHEMA_VERSION,
    mediaId: itemId,
    fileName: basename(mediaPath),
    metadata,
    updatedAt
  }
  await writeFile(temporaryPath, `${JSON.stringify(sidecar, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporaryPath, sidecarPath)
}

export class MediaImportInboxStore {
  readonly manifestPath: string
  private items: MediaImportInboxItem[]
  private writePromise: Promise<void> = Promise.resolve()
  private metadataWritePromise: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    this.manifestPath = resolve(getMediaImportInboxManifestPath(userDataPath))
    mkdirSync(dirname(this.manifestPath), { recursive: true })
    try {
      this.items = parseManifest(JSON.parse(readFileSync(this.manifestPath, 'utf8')))
    } catch {
      this.items = []
    }
  }

  listItems(): MediaImportInboxItem[] {
    return this.items.map((item) => ({ ...item }))
  }

  reconcile(files: readonly MediaImportInboxFile[], scannedDirectories: readonly string[] = [], now = Date.now()): MediaImportInboxItem[] {
    this.items = mergeMediaImportInboxItems(this.items, files, scannedDirectories, now)
    return this.listItems()
  }

  async refreshSidecars(paths: readonly string[] = this.items.map((item) => item.path)): Promise<void> {
    const keys = new Set(paths.map(pathKey))
    let changed = false
    await Promise.all(this.items.map(async (item, index) => {
      if (!keys.has(pathKey(item.path))) return
      const sidecar = await readSidecarMetadata(item.path, item.id)
      if (!sidecar || areMetadataEqual(item.metadata, sidecar.metadata)) return
      this.items[index] = { ...item, metadata: sidecar.metadata, updatedAt: Math.max(item.updatedAt, sidecar.updatedAt) }
      changed = true
    }))
    if (changed) await this.persist()
  }

  async updateMetadata(itemId: string, patch: MediaImportInboxMetadataPatch, writeSidecar: boolean, now = Date.now()): Promise<MediaImportInboxItem | null> {
    const operation = this.metadataWritePromise.then(async () => {
      const index = this.items.findIndex((item) => item.id === itemId)
      if (index < 0) return null
      const current = this.items[index]
      const metadata = normalizeMediaImportInboxMetadata({ ...current.metadata, ...patch })
      if (writeSidecar) await writeSidecarMetadata(current.path, current.id, metadata, now)
      const next = { ...current, metadata, updatedAt: now }
      this.items[index] = next
      await this.persist()
      return { ...next }
    })
    this.metadataWritePromise = operation.then(() => undefined, () => undefined)
    return operation
  }

  updatePipeline(itemId: string, patch: Partial<MediaImportInboxPipeline>, now = Date.now()): MediaImportInboxItem | null {
    const index = this.items.findIndex((item) => item.id === itemId)
    if (index < 0) return null
    const current = this.items[index]
    const pipeline = normalizePipeline({ ...current.pipeline, ...patch })
    const next = { ...current, pipeline, updatedAt: now }
    this.items[index] = next
    return { ...next }
  }

  transition(itemId: string, nextStatus: Exclude<MediaImportInboxStatus, 'missing'>, error?: string, now = Date.now()): MediaImportInboxItem | null {
    const index = this.items.findIndex((item) => item.id === itemId)
    if (index < 0) return null
    const next = transitionMediaImportInboxItem(this.items[index], nextStatus, now, error)
    if (!next) return null
    this.items[index] = next
    return { ...next }
  }

  transitionBatch(itemIds: readonly string[], action: MediaImportInboxBatchAction, now = Date.now()): MediaImportInboxItem[] | null {
    const selectedItems = this.items.filter((item) => itemIds.includes(item.id)).map((item) => ({ ...item }))
    const nextItems = transitionMediaImportInboxBatch(this.items, itemIds, action, now)
    if (!nextItems) return null
    this.items = nextItems
    if (action === 'clear') return selectedItems
    const selectedIds = new Set(itemIds.map((itemId) => itemId.trim()))
    return this.listItems().filter((item) => selectedIds.has(item.id))
  }

  async persist(): Promise<void> {
    const manifest: MediaImportInboxManifest = { schemaVersion: MEDIA_IMPORT_INBOX_SCHEMA_VERSION, items: this.items }
    const temporaryPath = `${this.manifestPath}.${process.pid}.tmp`
    this.writePromise = this.writePromise.then(async () => {
      await mkdir(dirname(this.manifestPath), { recursive: true })
      await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.manifestPath)
    })
    await this.writePromise
  }
}

export async function readMediaImportInboxManifest(manifestPath: string): Promise<MediaImportInboxManifest> {
  const value = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown
  return { schemaVersion: MEDIA_IMPORT_INBOX_SCHEMA_VERSION, items: parseManifest(value) }
}
