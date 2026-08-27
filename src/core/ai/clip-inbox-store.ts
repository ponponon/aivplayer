import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { mergeVisionClipSelections, normalizeVisionTimeRange } from './vision-evidence'
import { normalizeVisionClipCollectionTagOperationHistoryPageRequest } from './clip-inbox-tag-history'
import { applyVisionCollectionTags, duplicateVisionCollectionTitle, mergeVisionClipCollections, normalizeVisionClipCollectionIds, normalizeVisionClipCollectionRenamePart, normalizeVisionCollectionSortMode, normalizeVisionCollectionTag, normalizeVisionCollectionTagColor, normalizeVisionCollectionTagFavorite, normalizeVisionCollectionTagNote, normalizeVisionCollectionTags, normalizeVisionCollectionTagsMode, renameVisionCollectionTag, renameVisionClipCollectionTitle, selectVisionClipCollectionsForMerge, sortVisionClipSelections, wouldCreateVisionCollectionTagParentCycle } from './clip-inbox-operations'
import type { VisionClipCollection, VisionClipCollectionBatchDeleteResult, VisionClipCollectionBatchRenameResult, VisionClipCollectionBatchTagsResult, VisionClipCollectionFlagUpdateRequest, VisionClipCollectionInput, VisionClipCollectionMergeSelection, VisionClipCollectionOperationHistory, VisionClipCollectionOperationRedoResult, VisionClipCollectionOperationType, VisionClipCollectionOperationUndoResult, VisionClipCollectionTagMetadata, VisionClipCollectionTagMetadataUpdateRequest, VisionClipCollectionTagOperationHistory, VisionClipCollectionTagOperationHistoryDetail, VisionClipCollectionTagOperationHistoryEntry, VisionClipCollectionTagOperationHistoryPage, VisionClipCollectionTagOperationType, VisionClipCollectionTagRedoResult, VisionClipCollectionTagUndoResult, VisionClipSelection, VisionEvidenceType } from '../../shared/vision-types'

type SqliteRow = Record<string, unknown>
const EVIDENCE_TYPES: readonly VisionEvidenceType[] = ['subtitle', 'visual', 'scene', 'ocr', 'entity', 'object']
const TAG_OPERATION_TYPES: readonly VisionClipCollectionTagOperationType[] = ['cleanup', 'rename', 'metadata', 'batch']
const COLLECTION_OPERATION_TYPES: readonly VisionClipCollectionOperationType[] = ['flags']
const TAG_OPERATION_HISTORY_RETENTION_LIMIT = 100

type TagOperationCollectionSnapshot = { id: string; tags: string[]; updatedAt: number }

type TagOperationSnapshot = {
  collectionTags: TagOperationCollectionSnapshot[]
  metadataTags: string[]
  metadata: VisionClipCollectionTagMetadata[]
  redoCollectionTags?: TagOperationCollectionSnapshot[]
  redoMetadataTags?: string[]
  redoMetadata?: VisionClipCollectionTagMetadata[]
}

type CollectionOperationFlagSnapshot = { id: string; isFavorite: boolean; isArchived: boolean; updatedAt: number }

type CollectionOperationSnapshot = {
  collectionFlags: CollectionOperationFlagSnapshot[]
  redoCollectionFlags?: CollectionOperationFlagSnapshot[]
}

export function getClipInboxDatabasePath(userDataPath: string): string {
  return join(userDataPath, 'library', 'clip-inbox.sqlite')
}

function stringValue(row: SqliteRow, key: string): string {
  return typeof row[key] === 'string' ? row[key] as string : ''
}

function nullableNumberValue(row: SqliteRow, key: string): number | undefined {
  return typeof row[key] === 'number' && Number.isFinite(row[key]) ? row[key] as number : undefined
}

function numberValue(row: SqliteRow, key: string): number {
  const value = nullableNumberValue(row, key)
  return value ?? 0
}

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeSelection(value: unknown): VisionClipSelection | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<VisionClipSelection>
  if (typeof item.sourceId !== 'string' || !item.sourceId.trim() || typeof item.videoPath !== 'string' || !item.videoPath.trim() || typeof item.fileName !== 'string' || typeof item.fingerprint !== 'string') return null
  if (typeof item.durationSeconds !== 'number' || !Number.isFinite(item.durationSeconds) || item.durationSeconds <= 0) return null
  if (typeof item.startSeconds !== 'number' || typeof item.endSeconds !== 'number') return null
  const range = normalizeVisionTimeRange({ startSeconds: item.startSeconds, endSeconds: item.endSeconds }, item.durationSeconds)
  if (!range) return null
  const evidenceTypes = Array.isArray(item.evidenceTypes) ? item.evidenceTypes.filter((type): type is VisionEvidenceType => typeof type === 'string' && EVIDENCE_TYPES.includes(type as VisionEvidenceType)) : []
  return {
    sourceId: item.sourceId.trim(),
    videoPath: item.videoPath.trim(),
    fileName: item.fileName.trim(),
    fingerprint: item.fingerprint,
    durationSeconds: item.durationSeconds,
    width: typeof item.width === 'number' && Number.isFinite(item.width) && item.width > 0 ? item.width : undefined,
    height: typeof item.height === 'number' && Number.isFinite(item.height) && item.height > 0 ? item.height : undefined,
    startSeconds: range.startSeconds,
    endSeconds: range.endSeconds,
    evidenceIds: Array.isArray(item.evidenceIds) ? item.evidenceIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())) : [],
    text: typeof item.text === 'string' && item.text.trim() ? item.text.trim() : undefined,
    evidenceTypes
  }
}

function parseSelectionRow(row: SqliteRow): VisionClipSelection | null {
  return normalizeSelection({
    sourceId: stringValue(row, 'source_id'),
    videoPath: stringValue(row, 'video_path'),
    fileName: stringValue(row, 'file_name'),
    fingerprint: stringValue(row, 'fingerprint'),
    durationSeconds: numberValue(row, 'duration_seconds'),
    width: nullableNumberValue(row, 'width'),
    height: nullableNumberValue(row, 'height'),
    startSeconds: numberValue(row, 'start_seconds'),
    endSeconds: numberValue(row, 'end_seconds'),
    evidenceIds: parseJsonArray(row.evidence_ids_json),
    text: stringValue(row, 'text') || undefined,
    evidenceTypes: parseJsonArray(row.evidence_types_json)
  })
}

export class ClipInboxStore {
  readonly databasePath: string
  private readonly database: DatabaseSync

  constructor(userDataPath: string) {
    this.databasePath = resolve(getClipInboxDatabasePath(userDataPath))
    mkdirSync(dirname(this.databasePath), { recursive: true })
    this.database = new DatabaseSync(this.databasePath)
    this.database.exec('PRAGMA foreign_keys = ON')
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS clip_collections (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        sort_mode TEXT NOT NULL DEFAULT 'source-time',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS clip_collection_items (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL REFERENCES clip_collections(id) ON DELETE CASCADE,
        item_index INTEGER NOT NULL,
        source_id TEXT NOT NULL,
        video_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        duration_seconds REAL NOT NULL,
        width REAL,
        height REAL,
        start_seconds REAL NOT NULL,
        end_seconds REAL NOT NULL,
        evidence_ids_json TEXT NOT NULL DEFAULT '[]',
        text TEXT NOT NULL DEFAULT '',
        evidence_types_json TEXT NOT NULL DEFAULT '[]',
        UNIQUE(collection_id, item_index)
      );
      CREATE INDEX IF NOT EXISTS clip_collection_items_collection_index ON clip_collection_items(collection_id, item_index);
      CREATE TABLE IF NOT EXISTS clip_tag_metadata (
        tag TEXT PRIMARY KEY,
        parent_tag TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '',
        text_color TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS clip_tag_operation_history (
        id TEXT PRIMARY KEY,
        operation_type TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        undone_at INTEGER,
        redoable INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS clip_tag_operation_history_latest ON clip_tag_operation_history(undone_at, created_at DESC);
      CREATE TABLE IF NOT EXISTS clip_collection_operation_history (
        id TEXT PRIMARY KEY,
        operation_type TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        undone_at INTEGER,
        redoable INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS clip_collection_operation_history_latest ON clip_collection_operation_history(undone_at, created_at DESC);
    `)
    this.ensureTagOperationHistoryColumn('redoable', 'INTEGER NOT NULL DEFAULT 0')
    this.ensureCollectionOperationHistoryColumn('redoable', 'INTEGER NOT NULL DEFAULT 0')
    this.ensureCollectionColumn('tags_json', "TEXT NOT NULL DEFAULT '[]'")
    this.ensureCollectionColumn('sort_mode', "TEXT NOT NULL DEFAULT 'source-time'")
    this.ensureCollectionColumn('is_favorite', 'INTEGER NOT NULL DEFAULT 0')
    this.ensureCollectionColumn('is_archived', 'INTEGER NOT NULL DEFAULT 0')
    this.ensureTagMetadataColumn('note', "TEXT NOT NULL DEFAULT ''")
    this.ensureTagMetadataColumn('is_favorite', 'INTEGER NOT NULL DEFAULT 0')
  }

  close(): void {
    this.database.close()
  }

  listCollections(): VisionClipCollection[] {
    const rows = this.database.prepare('SELECT * FROM clip_collections ORDER BY updated_at DESC, created_at DESC').all() as SqliteRow[]
    return rows.map((row) => this.readCollection(row)).filter((collection): collection is VisionClipCollection => collection !== null)
  }

  updateCollectionFlags(request: VisionClipCollectionFlagUpdateRequest): Pick<import('../../shared/vision-types').VisionClipCollectionFlagUpdateResult, 'collections' | 'skippedCount'> {
    const normalizedIds = normalizeVisionClipCollectionIds(request?.collectionIds)
    const hasFavoritePatch = typeof request?.isFavorite === 'boolean'
    const hasArchivedPatch = typeof request?.isArchived === 'boolean'
    if (normalizedIds.length === 0 || (!hasFavoritePatch && !hasArchivedPatch)) return { collections: [], skippedCount: normalizedIds.length }
    const placeholders = normalizedIds.map(() => '?').join(', ')
    const rows = this.database.prepare(`SELECT id, is_favorite, is_archived, updated_at FROM clip_collections WHERE id IN (${placeholders})`).all(...normalizedIds) as SqliteRow[]
    const existingIds = new Set(rows.map((row) => stringValue(row, 'id')).filter(Boolean))
    const collectionFlags = rows.map((row) => ({
      id: stringValue(row, 'id'),
      isFavorite: normalizeVisionCollectionTagFavorite(row.is_favorite),
      isArchived: normalizeVisionCollectionTagFavorite(row.is_archived),
      updatedAt: numberValue(row, 'updated_at')
    })).filter((item) => Boolean(item.id))
    const snapshot: CollectionOperationSnapshot = {
      collectionFlags
    }
    const changed = snapshot.collectionFlags.some((item) => (hasFavoritePatch && item.isFavorite !== request.isFavorite) || (hasArchivedPatch && item.isArchived !== request.isArchived))
    if (!changed) {
      const collections = normalizedIds.filter((id) => existingIds.has(id)).map((id) => this.getCollection(id)).filter((collection): collection is VisionClipCollection => collection !== null)
      return { collections, skippedCount: normalizedIds.length - collections.length }
    }
    const assignments: string[] = []
    const values: Array<number | string> = []
    if (hasFavoritePatch) {
      assignments.push('is_favorite = ?')
      values.push(request.isFavorite ? 1 : 0)
    }
    if (hasArchivedPatch) {
      assignments.push('is_archived = ?')
      values.push(request.isArchived ? 1 : 0)
    }
    const now = Date.now()
    snapshot.redoCollectionFlags = snapshot.collectionFlags.map((item) => ({
      ...item,
      isFavorite: hasFavoritePatch ? request.isFavorite as boolean : item.isFavorite,
      isArchived: hasArchivedPatch ? request.isArchived as boolean : item.isArchived,
      updatedAt: now
    }))
    this.database.exec('BEGIN')
    try {
      const update = this.database.prepare(`UPDATE clip_collections SET ${assignments.join(', ')}, updated_at = ? WHERE id = ?`)
      for (const id of normalizedIds) {
        if (existingIds.has(id)) update.run(...values, now, id)
      }
      this.database.prepare('UPDATE clip_collection_operation_history SET redoable = 0 WHERE undone_at IS NOT NULL AND redoable = 1').run()
      this.recordCollectionOperation('flags', snapshot, now)
      this.database.exec('COMMIT')
      const collections = normalizedIds.filter((id) => existingIds.has(id)).map((id) => this.getCollection(id)).filter((collection): collection is VisionClipCollection => collection !== null)
      return { collections, skippedCount: normalizedIds.length - collections.length }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  getLastCollectionOperation(): VisionClipCollectionOperationHistory | null {
    const row = this.database.prepare('SELECT id, operation_type, created_at FROM clip_collection_operation_history WHERE undone_at IS NULL ORDER BY rowid DESC LIMIT 1').get() as SqliteRow | undefined
    return row ? this.readCollectionOperationHistory(row) : null
  }

  getLastCollectionRedoOperation(): VisionClipCollectionOperationHistory | null {
    const row = this.database.prepare('SELECT id, operation_type, created_at FROM clip_collection_operation_history WHERE undone_at IS NOT NULL AND redoable = 1 ORDER BY undone_at DESC, rowid DESC LIMIT 1').get() as SqliteRow | undefined
    return row ? this.readCollectionOperationHistory(row) : null
  }

  undoLastCollectionOperation(): VisionClipCollectionOperationUndoResult {
    const row = this.database.prepare('SELECT id, operation_type, snapshot_json, created_at FROM clip_collection_operation_history WHERE undone_at IS NULL ORDER BY rowid DESC LIMIT 1').get() as SqliteRow | undefined
    if (!row) return { success: false, message: '没有可撤销的收藏归档操作', operation: null, collections: [] }
    const operation = this.readCollectionOperationHistory(row)
    const snapshot = this.parseCollectionOperationSnapshot(row.snapshot_json)
    if (!operation || !snapshot) return { success: false, message: '收藏归档操作记录已损坏', operation: null, collections: [] }
    const now = Date.now()
    this.database.exec('BEGIN')
    try {
      const update = this.database.prepare('UPDATE clip_collections SET is_favorite = ?, is_archived = ?, updated_at = ? WHERE id = ?')
      for (const collection of snapshot.collectionFlags) update.run(collection.isFavorite ? 1 : 0, collection.isArchived ? 1 : 0, collection.updatedAt, collection.id)
      this.database.prepare('UPDATE clip_collection_operation_history SET undone_at = ?, redoable = ? WHERE id = ?').run(now, snapshot.redoCollectionFlags ? 1 : 0, operation.id)
      this.database.exec('COMMIT')
      const collections = snapshot.collectionFlags.map((item) => this.getCollection(item.id)).filter((collection): collection is VisionClipCollection => collection !== null)
      return { success: true, message: '已撤销上次收藏归档操作', operation, collections }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  redoLastCollectionOperation(): VisionClipCollectionOperationRedoResult {
    const row = this.database.prepare('SELECT id, operation_type, snapshot_json, created_at FROM clip_collection_operation_history WHERE undone_at IS NOT NULL AND redoable = 1 ORDER BY undone_at DESC, rowid DESC LIMIT 1').get() as SqliteRow | undefined
    if (!row) return { success: false, message: '没有可重做的收藏归档操作', operation: null, collections: [] }
    const operation = this.readCollectionOperationHistory(row)
    const snapshot = this.parseCollectionOperationSnapshot(row.snapshot_json)
    if (!operation || !snapshot?.redoCollectionFlags) return { success: false, message: '收藏归档操作没有可重做快照', operation: null, collections: [] }
    const now = Date.now()
    this.database.exec('BEGIN')
    try {
      const update = this.database.prepare('UPDATE clip_collections SET is_favorite = ?, is_archived = ?, updated_at = ? WHERE id = ?')
      for (const collection of snapshot.redoCollectionFlags) update.run(collection.isFavorite ? 1 : 0, collection.isArchived ? 1 : 0, collection.updatedAt, collection.id)
      this.database.prepare('UPDATE clip_collection_operation_history SET undone_at = NULL, redoable = 0 WHERE id = ?').run(operation.id)
      this.database.exec('COMMIT')
      const collections = snapshot.redoCollectionFlags.map((item) => this.getCollection(item.id)).filter((collection): collection is VisionClipCollection => collection !== null)
      return { success: true, message: '已重做上次收藏归档操作', operation, collections }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  listTagMetadata(): VisionClipCollectionTagMetadata[] {
    const rows = this.database.prepare('SELECT tag, parent_tag, color, text_color, note, is_favorite, updated_at FROM clip_tag_metadata ORDER BY tag COLLATE NOCASE ASC').all() as SqliteRow[]
    return rows.map((row) => this.readTagMetadata(row)).filter((metadata): metadata is VisionClipCollectionTagMetadata => metadata !== null)
  }

  getTagMetadata(tag: unknown): VisionClipCollectionTagMetadata | null {
    const normalizedTag = normalizeVisionCollectionTag(tag)
    if (!normalizedTag) return null
    const row = this.database.prepare('SELECT tag, parent_tag, color, text_color, note, is_favorite, updated_at FROM clip_tag_metadata WHERE tag = ?').get(normalizedTag) as SqliteRow | undefined
    return row ? this.readTagMetadata(row) : null
  }

  getLastTagOperation(): VisionClipCollectionTagOperationHistory | null {
    const row = this.database.prepare('SELECT id, operation_type, created_at FROM clip_tag_operation_history WHERE undone_at IS NULL ORDER BY rowid DESC LIMIT 1').get() as SqliteRow | undefined
    return row ? this.readTagOperationHistory(row) : null
  }

  listTagOperationHistory(): VisionClipCollectionTagOperationHistoryEntry[] {
    const rows = this.database.prepare('SELECT id, operation_type, created_at, undone_at, redoable FROM clip_tag_operation_history ORDER BY rowid DESC LIMIT 20').all() as SqliteRow[]
    return rows.map((row) => this.readTagOperationHistoryEntry(row)).filter((operation): operation is VisionClipCollectionTagOperationHistoryEntry => operation !== null)
  }

  listTagOperationHistoryPage(request: unknown = {}): VisionClipCollectionTagOperationHistoryPage {
    const normalized = normalizeVisionClipCollectionTagOperationHistoryPageRequest(request)
    const filterClause = normalized.filter === 'all' ? '' : ' WHERE operation_type = ?'
    const filterValue = normalized.filter === 'all' ? [] : [normalized.filter]
    const totalRow = this.database.prepare(`SELECT COUNT(*) AS count FROM clip_tag_operation_history${filterClause}`).get(...filterValue) as SqliteRow | undefined
    const rows = this.database.prepare(`SELECT id, operation_type, created_at, undone_at, redoable FROM clip_tag_operation_history${filterClause} ORDER BY rowid DESC LIMIT ? OFFSET ?`).all(...filterValue, normalized.limit, normalized.offset) as SqliteRow[]
    const entries = rows.map((row) => this.readTagOperationHistoryEntry(row)).filter((operation): operation is VisionClipCollectionTagOperationHistoryEntry => operation !== null)
    const total = Math.max(0, Math.floor(numberValue(totalRow ?? {}, 'count')))
    return { entries, offset: normalized.offset, limit: normalized.limit, total, hasMore: normalized.offset + entries.length < total }
  }

  getTagOperationHistoryDetail(operationId: unknown): VisionClipCollectionTagOperationHistoryDetail | null {
    const id = typeof operationId === 'string' ? operationId.trim() : ''
    if (!id) return null
    const row = this.database.prepare('SELECT id, operation_type, created_at, undone_at, redoable, snapshot_json FROM clip_tag_operation_history WHERE id = ?').get(id) as SqliteRow | undefined
    if (!row) return null
    const operation = this.readTagOperationHistoryEntry(row)
    const snapshot = this.parseTagOperationSnapshot(row.snapshot_json)
    if (!operation || !snapshot) return null
    return {
      ...operation,
      collectionCount: snapshot.collectionTags.length,
      metadataCount: snapshot.metadata.length
    }
  }

  getLastTagRedoOperation(): VisionClipCollectionTagOperationHistory | null {
    const row = this.database.prepare('SELECT id, operation_type, created_at FROM clip_tag_operation_history WHERE undone_at IS NOT NULL AND redoable = 1 ORDER BY undone_at DESC, rowid DESC LIMIT 1').get() as SqliteRow | undefined
    return row ? this.readTagOperationHistory(row) : null
  }

  undoLastTagOperation(): VisionClipCollectionTagUndoResult {
    const row = this.database.prepare('SELECT id, operation_type, snapshot_json, created_at FROM clip_tag_operation_history WHERE undone_at IS NULL ORDER BY rowid DESC LIMIT 1').get() as SqliteRow | undefined
    if (!row) return { success: false, message: '没有可撤销的标签操作', operation: null, collections: [], metadata: [] }
    const operation = this.readTagOperationHistory(row)
    const snapshot = this.parseTagOperationSnapshot(row.snapshot_json)
    if (!operation || !snapshot) return { success: false, message: '标签操作记录已损坏', operation: null, collections: [], metadata: [] }
    const now = Date.now()
    this.database.exec('BEGIN')
    try {
      this.restoreTagOperationSnapshot(snapshot, false)
      this.database.prepare('UPDATE clip_tag_operation_history SET undone_at = ?, redoable = ? WHERE id = ?').run(now, snapshot.redoCollectionTags && snapshot.redoMetadataTags && snapshot.redoMetadata ? 1 : 0, operation.id)
      this.database.exec('COMMIT')
      const collections = snapshot.collectionTags.map((item) => this.getCollection(item.id)).filter((collection): collection is VisionClipCollection => collection !== null)
      return { success: true, message: '已撤销上次标签操作', operation, collections, metadata: this.listTagMetadata() }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  redoLastTagOperation(): VisionClipCollectionTagRedoResult {
    const row = this.database.prepare('SELECT id, operation_type, snapshot_json, created_at FROM clip_tag_operation_history WHERE undone_at IS NOT NULL AND redoable = 1 ORDER BY undone_at DESC, rowid DESC LIMIT 1').get() as SqliteRow | undefined
    if (!row) return { success: false, message: '没有可重做的标签操作', operation: null, collections: [], metadata: [] }
    const operation = this.readTagOperationHistory(row)
    const snapshot = this.parseTagOperationSnapshot(row.snapshot_json)
    if (!operation || !snapshot || !snapshot.redoCollectionTags || !snapshot.redoMetadataTags || !snapshot.redoMetadata) return { success: false, message: '标签操作没有可重做快照', operation: null, collections: [], metadata: [] }
    this.database.exec('BEGIN')
    try {
      this.restoreTagOperationSnapshot(snapshot, true)
      this.database.prepare('UPDATE clip_tag_operation_history SET undone_at = NULL, redoable = 0 WHERE id = ?').run(operation.id)
      this.database.exec('COMMIT')
      const collections = snapshot.redoCollectionTags.map((item) => this.getCollection(item.id)).filter((collection): collection is VisionClipCollection => collection !== null)
      return { success: true, message: '已重做上次标签操作', operation, collections, metadata: this.listTagMetadata() }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  saveTagMetadata(input: VisionClipCollectionTagMetadataUpdateRequest): VisionClipCollectionTagMetadata {
    const tag = normalizeVisionCollectionTag(input?.tag)
    if (!tag) throw new Error('标签名称无效')
    if (!this.listCollections().some((collection) => collection.tags.includes(tag))) throw new Error(`没有集合使用标签“${tag}”`)
    const existing = this.getTagMetadata(tag)
    const parentTag = input?.parentTag === undefined ? existing?.parentTag ?? '' : normalizeVisionCollectionTag(input.parentTag)
    if (parentTag === tag) throw new Error('标签不能作为自己的父标签')
    if (wouldCreateVisionCollectionTagParentCycle(tag, parentTag, this.listTagMetadata())) throw new Error('标签父级关系不能形成环路')
    const color = input?.color === undefined ? existing?.color ?? '' : normalizeVisionCollectionTagColor(input.color)
    const textColor = input?.textColor === undefined ? existing?.textColor ?? '' : normalizeVisionCollectionTagColor(input.textColor)
    const note = input?.note === undefined ? existing?.note ?? '' : normalizeVisionCollectionTagNote(input.note)
    const isFavorite = input?.isFavorite === undefined || input?.isFavorite === null ? existing?.isFavorite ?? false : normalizeVisionCollectionTagFavorite(input.isFavorite)
    const now = Date.now()
    const snapshot: TagOperationSnapshot = { collectionTags: [], metadataTags: [tag], metadata: existing ? [existing] : [] }
    this.database.exec('BEGIN')
    try {
      this.database.prepare(`
        INSERT INTO clip_tag_metadata (tag, parent_tag, color, text_color, note, is_favorite, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tag) DO UPDATE SET parent_tag = excluded.parent_tag, color = excluded.color, text_color = excluded.text_color, note = excluded.note, is_favorite = excluded.is_favorite, updated_at = excluded.updated_at
      `).run(tag, parentTag, color, textColor, note, isFavorite ? 1 : 0, now)
      this.recordTagOperation('metadata', snapshot, now)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
    return this.getTagMetadata(tag) as VisionClipCollectionTagMetadata
  }

  getCollection(collectionId: string): VisionClipCollection | null {
    const row = this.database.prepare('SELECT * FROM clip_collections WHERE id = ?').get(collectionId) as SqliteRow | undefined
    return row ? this.readCollection(row) : null
  }

  saveCollection(input: VisionClipCollectionInput): VisionClipCollection {
    const title = typeof input?.title === 'string' ? input.title.trim() : ''
    if (!title) throw new Error('选段集合名称不能为空')
    if (!Array.isArray(input?.selections)) throw new Error('选段集合内容无效')
    const selections = sortVisionClipSelections(
      mergeVisionClipSelections(input.selections.map(normalizeSelection).filter((selection): selection is VisionClipSelection => selection !== null)),
      normalizeVisionCollectionSortMode(input.sortMode)
    )
    if (selections.length === 0) throw new Error('选段集合至少需要一个有效选段')
    const tags = normalizeVisionCollectionTags(input.tags)
    const sortMode = normalizeVisionCollectionSortMode(input.sortMode)
    const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : randomUUID()
    const existing = this.database.prepare('SELECT created_at, is_favorite, is_archived FROM clip_collections WHERE id = ?').get(id) as SqliteRow | undefined
    const isFavorite = input.isFavorite === undefined ? normalizeVisionCollectionTagFavorite(existing?.is_favorite) : normalizeVisionCollectionTagFavorite(input.isFavorite)
    const isArchived = input.isArchived === undefined ? normalizeVisionCollectionTagFavorite(existing?.is_archived) : normalizeVisionCollectionTagFavorite(input.isArchived)
    const now = Date.now()
    this.database.exec('BEGIN')
    try {
      this.database.prepare(`
        INSERT INTO clip_collections (id, title, tags_json, sort_mode, is_favorite, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title, tags_json = excluded.tags_json, sort_mode = excluded.sort_mode, is_favorite = excluded.is_favorite, is_archived = excluded.is_archived, updated_at = excluded.updated_at
      `).run(id, title, JSON.stringify(tags), sortMode, isFavorite ? 1 : 0, isArchived ? 1 : 0, existing ? numberValue(existing, 'created_at') : now, now)
      this.database.prepare('DELETE FROM clip_collection_items WHERE collection_id = ?').run(id)
      const insert = this.database.prepare(`
        INSERT INTO clip_collection_items (id, collection_id, item_index, source_id, video_path, file_name, fingerprint, duration_seconds, width, height, start_seconds, end_seconds, evidence_ids_json, text, evidence_types_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      selections.forEach((selection, index) => insert.run(
        randomUUID(), id, index, selection.sourceId, selection.videoPath, selection.fileName, selection.fingerprint,
        selection.durationSeconds, selection.width ?? null, selection.height ?? null, selection.startSeconds, selection.endSeconds,
        JSON.stringify(selection.evidenceIds), selection.text ?? '', JSON.stringify(selection.evidenceTypes)
      ))
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
    return this.getCollection(id) as VisionClipCollection
  }

  importCollection(input: VisionClipCollectionInput): VisionClipCollection {
    return this.saveCollection({ ...input, id: undefined })
  }

  duplicateCollection(collectionId: string): VisionClipCollection | null {
    const collection = this.getCollection(collectionId)
    if (!collection) return null
    return this.importCollection({
      title: duplicateVisionCollectionTitle(collection.title),
      tags: collection.tags,
      sortMode: collection.sortMode,
      isFavorite: false,
      isArchived: false,
      selections: collection.selections
    })
  }

  duplicateCollections(collectionIds: readonly string[]): { collections: VisionClipCollection[]; skippedCount: number } {
    const normalizedIds = normalizeVisionClipCollectionIds(collectionIds)
    const collections = normalizedIds.map((collectionId) => this.duplicateCollection(collectionId)).filter((collection): collection is VisionClipCollection => collection !== null)
    return { collections, skippedCount: normalizedIds.length - collections.length }
  }

  mergeCollections(collectionIds: readonly string[], title: unknown, sortMode: unknown = 'source-time', selectedSelections?: readonly VisionClipCollectionMergeSelection[]): { collection: VisionClipCollection; sourceIds: string[]; skippedCount: number } {
    const normalizedIds = normalizeVisionClipCollectionIds(collectionIds)
    const selected = normalizedIds.map((collectionId) => this.getCollection(collectionId)).filter((collection): collection is VisionClipCollection => collection !== null)
    const input = mergeVisionClipCollections(selectVisionClipCollectionsForMerge(selected, selectedSelections), title, sortMode)
    const collection = this.saveCollection(input)
    return { collection, sourceIds: selected.map((item) => item.id), skippedCount: normalizedIds.length - selected.length }
  }

  deleteCollections(collectionIds: readonly string[]): VisionClipCollectionBatchDeleteResult {
    const normalizedIds = normalizeVisionClipCollectionIds(collectionIds)
    if (normalizedIds.length === 0) return { deletedIds: [], deletedCount: 0, skippedCount: 0 }
    const placeholders = normalizedIds.map(() => '?').join(', ')
    this.database.exec('BEGIN')
    try {
      const rows = this.database.prepare(`SELECT id FROM clip_collections WHERE id IN (${placeholders})`).all(...normalizedIds) as SqliteRow[]
      const existingIds = new Set(rows.map((row) => stringValue(row, 'id')).filter(Boolean))
      const deletedIds = normalizedIds.filter((collectionId) => existingIds.has(collectionId))
      if (deletedIds.length > 0) {
        const deletePlaceholders = deletedIds.map(() => '?').join(', ')
        this.database.prepare(`DELETE FROM clip_collections WHERE id IN (${deletePlaceholders})`).run(...deletedIds)
      }
      this.database.exec('COMMIT')
      return { deletedIds, deletedCount: deletedIds.length, skippedCount: normalizedIds.length - deletedIds.length }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  renameCollections(collectionIds: readonly string[], prefix: unknown, suffix: unknown): Pick<VisionClipCollectionBatchRenameResult, 'collections' | 'skippedCount'> {
    const normalizedIds = normalizeVisionClipCollectionIds(collectionIds)
    const normalizedPrefix = normalizeVisionClipCollectionRenamePart(prefix)
    const normalizedSuffix = normalizeVisionClipCollectionRenamePart(suffix)
    if (!normalizedPrefix && !normalizedSuffix) throw new Error('批量重命名规则不能为空')
    if (normalizedIds.length === 0) return { collections: [], skippedCount: 0 }
    const placeholders = normalizedIds.map(() => '?').join(', ')
    this.database.exec('BEGIN')
    try {
      const rows = this.database.prepare(`SELECT id, title FROM clip_collections WHERE id IN (${placeholders})`).all(...normalizedIds) as SqliteRow[]
      const existingIds = new Set(rows.map((row) => stringValue(row, 'id')).filter(Boolean))
      const now = Date.now()
      const update = this.database.prepare('UPDATE clip_collections SET title = ?, updated_at = ? WHERE id = ?')
      for (const row of rows) {
        const id = stringValue(row, 'id')
        if (!id) continue
        update.run(renameVisionClipCollectionTitle(stringValue(row, 'title'), normalizedPrefix, normalizedSuffix), now, id)
      }
      this.database.exec('COMMIT')
      const collections = normalizedIds.filter((id) => existingIds.has(id)).map((id) => this.getCollection(id)).filter((collection): collection is VisionClipCollection => collection !== null)
      return { collections, skippedCount: normalizedIds.length - collections.length }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  updateCollectionsTags(collectionIds: readonly string[], tags: unknown, mode: unknown = 'replace'): Pick<VisionClipCollectionBatchTagsResult, 'collections' | 'skippedCount'> {
    const normalizedIds = normalizeVisionClipCollectionIds(collectionIds)
    const normalizedTags = normalizeVisionCollectionTags(tags)
    const normalizedMode = normalizeVisionCollectionTagsMode(mode)
    if (normalizedIds.length === 0) return { collections: [], skippedCount: 0 }
    const placeholders = normalizedIds.map(() => '?').join(', ')
    this.database.exec('BEGIN')
    try {
      const rows = this.database.prepare(`SELECT id, tags_json, updated_at FROM clip_collections WHERE id IN (${placeholders})`).all(...normalizedIds) as SqliteRow[]
      const existingIds = new Set(rows.map((row) => stringValue(row, 'id')).filter(Boolean))
      const currentTagsById = new Map(rows.map((row) => [stringValue(row, 'id'), normalizeVisionCollectionTags(parseJsonArray(row.tags_json))]))
      const snapshot = this.createTagOperationSnapshot(rows)
      const now = Date.now()
      const update = this.database.prepare('UPDATE clip_collections SET tags_json = ?, updated_at = ? WHERE id = ?')
      for (const id of normalizedIds) {
        if (existingIds.has(id)) update.run(JSON.stringify(applyVisionCollectionTags(currentTagsById.get(id) ?? [], normalizedTags, normalizedMode)), now, id)
      }
      if (existingIds.size > 0) this.recordTagOperation('batch', snapshot, now)
      this.database.exec('COMMIT')
      const collections = normalizedIds.filter((id) => existingIds.has(id)).map((id) => this.getCollection(id)).filter((collection): collection is VisionClipCollection => collection !== null)
      return { collections, skippedCount: normalizedIds.length - collections.length }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  removeTagFromAllCollections(tag: unknown): { tag: string; collections: VisionClipCollection[] } {
    const normalizedTag = normalizeVisionCollectionTag(tag)
    if (!normalizedTag) return { tag: '', collections: [] }
    const rows = this.database.prepare('SELECT id, tags_json, updated_at FROM clip_collections').all() as SqliteRow[]
    const matchingRows = rows.filter((row) => normalizeVisionCollectionTags(parseJsonArray(row.tags_json)).includes(normalizedTag))
    if (matchingRows.length === 0) return { tag: normalizedTag, collections: [] }
    const snapshot = this.createTagOperationSnapshot(matchingRows, [normalizedTag])
    this.database.exec('BEGIN')
    try {
      const now = Date.now()
      const update = this.database.prepare('UPDATE clip_collections SET tags_json = ?, updated_at = ? WHERE id = ?')
      for (const row of matchingRows) {
        const id = stringValue(row, 'id')
        const tags = normalizeVisionCollectionTags(parseJsonArray(row.tags_json)).filter((currentTag) => currentTag !== normalizedTag)
        if (id) update.run(JSON.stringify(tags), now, id)
      }
      this.database.prepare('DELETE FROM clip_tag_metadata WHERE tag = ?').run(normalizedTag)
      this.database.prepare('UPDATE clip_tag_metadata SET parent_tag = \'\', updated_at = ? WHERE parent_tag = ?').run(now, normalizedTag)
      this.recordTagOperation('cleanup', snapshot, now)
      this.database.exec('COMMIT')
      const collections = matchingRows.map((row) => this.getCollection(stringValue(row, 'id'))).filter((collection): collection is VisionClipCollection => collection !== null)
      return { tag: normalizedTag, collections }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  renameTagAcrossCollections(fromTag: unknown, toTag: unknown): { fromTag: string; toTag: string; collections: VisionClipCollection[] } {
    const normalizedFromTag = normalizeVisionCollectionTag(fromTag)
    const normalizedToTag = normalizeVisionCollectionTag(toTag)
    if (!normalizedFromTag || !normalizedToTag || normalizedFromTag === normalizedToTag) return { fromTag: normalizedFromTag, toTag: normalizedToTag, collections: [] }
    const rows = this.database.prepare('SELECT id, tags_json, updated_at FROM clip_collections').all() as SqliteRow[]
    const matchingRows = rows.filter((row) => normalizeVisionCollectionTags(parseJsonArray(row.tags_json)).includes(normalizedFromTag))
    if (matchingRows.length === 0) return { fromTag: normalizedFromTag, toTag: normalizedToTag, collections: [] }
    const snapshot = this.createTagOperationSnapshot(matchingRows, [normalizedFromTag, normalizedToTag])
    this.database.exec('BEGIN')
    try {
      const now = Date.now()
      const update = this.database.prepare('UPDATE clip_collections SET tags_json = ?, updated_at = ? WHERE id = ?')
      for (const row of matchingRows) {
        const id = stringValue(row, 'id')
        const tags = renameVisionCollectionTag(parseJsonArray(row.tags_json), normalizedFromTag, normalizedToTag)
        if (id) update.run(JSON.stringify(tags), now, id)
      }
      const oldMetadata = this.getTagMetadata(normalizedFromTag)
      const targetMetadata = this.getTagMetadata(normalizedToTag)
      if (oldMetadata && targetMetadata) {
        this.database.prepare('UPDATE clip_tag_metadata SET parent_tag = ?, color = ?, text_color = ?, updated_at = ? WHERE tag = ?').run(
          targetMetadata.parentTag === normalizedFromTag ? '' : targetMetadata.parentTag || (oldMetadata.parentTag === normalizedFromTag ? '' : oldMetadata.parentTag),
          targetMetadata.color || oldMetadata.color,
          targetMetadata.textColor || oldMetadata.textColor,
          now,
          normalizedToTag
        )
        this.database.prepare('UPDATE clip_tag_metadata SET note = ?, is_favorite = ?, updated_at = ? WHERE tag = ?').run(targetMetadata.note || oldMetadata.note, targetMetadata.isFavorite || oldMetadata.isFavorite ? 1 : 0, now, normalizedToTag)
        this.database.prepare('DELETE FROM clip_tag_metadata WHERE tag = ?').run(normalizedFromTag)
      } else if (oldMetadata) {
        this.database.prepare('UPDATE clip_tag_metadata SET tag = ?, parent_tag = ?, note = ?, is_favorite = ?, updated_at = ? WHERE tag = ?').run(
          normalizedToTag,
          oldMetadata.parentTag === normalizedFromTag ? '' : oldMetadata.parentTag,
          oldMetadata.note,
          oldMetadata.isFavorite ? 1 : 0,
          now,
          normalizedFromTag
        )
      }
      this.database.prepare('UPDATE clip_tag_metadata SET parent_tag = ?, updated_at = ? WHERE parent_tag = ? AND tag <> ?').run(normalizedToTag, now, normalizedFromTag, normalizedToTag)
      this.recordTagOperation('rename', snapshot, now)
      this.database.exec('COMMIT')
      const collections = matchingRows.map((row) => this.getCollection(stringValue(row, 'id'))).filter((collection): collection is VisionClipCollection => collection !== null)
      return { fromTag: normalizedFromTag, toTag: normalizedToTag, collections }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  importTagMetadata(metadata: readonly VisionClipCollectionTagMetadata[]): { importedCount: number; skippedCount: number; metadata: VisionClipCollectionTagMetadata[] } {
    const availableTags = new Set(this.listCollections().flatMap((collection) => collection.tags))
    const normalizedMetadata = metadata.map((item) => ({
      tag: normalizeVisionCollectionTag(item.tag),
      parentTag: normalizeVisionCollectionTag(item.parentTag),
      color: normalizeVisionCollectionTagColor(item.color),
      textColor: normalizeVisionCollectionTagColor(item.textColor),
      note: normalizeVisionCollectionTagNote(item.note),
      isFavorite: normalizeVisionCollectionTagFavorite(item.isFavorite),
      updatedAt: item.updatedAt
    }))
    const seenTags = new Set<string>()
    for (const item of normalizedMetadata) {
      if (!item.tag) throw new Error('导入标签元数据包含无效标签')
      if (seenTags.has(item.tag)) throw new Error(`导入标签元数据包含重复标签：${item.tag}`)
      seenTags.add(item.tag)
    }
    const importable = normalizedMetadata
      .filter((item) => availableTags.has(item.tag))
      .map((item) => ({ ...item, parentTag: availableTags.has(item.parentTag) && item.parentTag !== item.tag ? item.parentTag : '' }))
    const existingByTag = new Map(this.listTagMetadata().map((item) => [item.tag, item]))
    const projectedMetadata = [
      ...[...existingByTag.values()].filter((item) => !importable.some((candidate) => candidate.tag === item.tag)),
      ...importable
    ]
    for (const item of importable) {
      if (wouldCreateVisionCollectionTagParentCycle(item.tag, item.parentTag, projectedMetadata)) throw new Error(`导入标签元数据包含父标签环路：${item.tag}`)
    }
    if (importable.length === 0) return { importedCount: 0, skippedCount: normalizedMetadata.length, metadata: this.listTagMetadata() }
    const snapshot: TagOperationSnapshot = {
      collectionTags: [],
      metadataTags: importable.map((item) => item.tag),
      metadata: importable.map((item) => existingByTag.get(item.tag)).filter((item): item is VisionClipCollectionTagMetadata => item !== undefined)
    }
    const now = Date.now()
    this.database.exec('BEGIN')
    try {
      const upsert = this.database.prepare(`
        INSERT INTO clip_tag_metadata (tag, parent_tag, color, text_color, note, is_favorite, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tag) DO UPDATE SET parent_tag = excluded.parent_tag, color = excluded.color, text_color = excluded.text_color, note = excluded.note, is_favorite = excluded.is_favorite, updated_at = excluded.updated_at
      `)
      for (const item of importable) upsert.run(item.tag, item.parentTag, item.color, item.textColor, item.note, item.isFavorite ? 1 : 0, now)
      this.recordTagOperation('metadata', snapshot, now)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
    return { importedCount: importable.length, skippedCount: normalizedMetadata.length - importable.length, metadata: this.listTagMetadata() }
  }

  deleteCollection(collectionId: string): boolean {
    const result = this.database.prepare('DELETE FROM clip_collections WHERE id = ?').run(collectionId)
    return Number(result.changes) > 0
  }

  private readCollection(row: SqliteRow): VisionClipCollection | null {
    const id = stringValue(row, 'id')
    if (!id) return null
    const itemRows = this.database.prepare('SELECT * FROM clip_collection_items WHERE collection_id = ? ORDER BY item_index ASC').all(id) as SqliteRow[]
    const selections = itemRows.map(parseSelectionRow).filter((selection): selection is VisionClipSelection => selection !== null)
    if (selections.length === 0) return null
    return {
      id,
      title: stringValue(row, 'title') || '未命名选段集合',
      tags: normalizeVisionCollectionTags(parseJsonArray(row.tags_json)),
      sortMode: normalizeVisionCollectionSortMode(row.sort_mode),
      isFavorite: normalizeVisionCollectionTagFavorite(row.is_favorite),
      isArchived: normalizeVisionCollectionTagFavorite(row.is_archived),
      createdAt: numberValue(row, 'created_at'),
      updatedAt: numberValue(row, 'updated_at'),
      selections
    }
  }

  private readTagMetadata(row: SqliteRow): VisionClipCollectionTagMetadata | null {
    const tag = normalizeVisionCollectionTag(row.tag)
    if (!tag) return null
    return {
      tag,
      parentTag: normalizeVisionCollectionTag(row.parent_tag),
      color: normalizeVisionCollectionTagColor(row.color),
      textColor: normalizeVisionCollectionTagColor(row.text_color),
      note: normalizeVisionCollectionTagNote(row.note),
      isFavorite: normalizeVisionCollectionTagFavorite(row.is_favorite),
      updatedAt: numberValue(row, 'updated_at')
    }
  }

  private createTagOperationSnapshot(rows: readonly SqliteRow[], additionalMetadataTags: readonly string[] = []): TagOperationSnapshot {
    const metadata = this.listTagMetadata()
    return {
      collectionTags: rows.map((row) => ({ id: stringValue(row, 'id'), tags: normalizeVisionCollectionTags(parseJsonArray(row.tags_json)), updatedAt: numberValue(row, 'updated_at') })).filter((item) => Boolean(item.id)),
      metadataTags: [...new Set([...metadata.map((item) => item.tag), ...additionalMetadataTags.map((tag) => normalizeVisionCollectionTag(tag)).filter(Boolean)])],
      metadata
    }
  }

  private recordTagOperation(type: VisionClipCollectionTagOperationType, snapshot: TagOperationSnapshot, createdAt: number): void {
    const redoMetadata = this.listTagMetadata()
    const redoSnapshot: TagOperationSnapshot = {
      ...snapshot,
      redoCollectionTags: snapshot.collectionTags.map((item) => {
        const collection = this.getCollection(item.id)
        return collection ? { id: collection.id, tags: collection.tags, updatedAt: collection.updatedAt } : null
      }).filter((item): item is TagOperationCollectionSnapshot => item !== null),
      redoMetadataTags: [...new Set([...snapshot.metadataTags, ...redoMetadata.map((item) => item.tag)])],
      redoMetadata
    }
    this.database.prepare('UPDATE clip_tag_operation_history SET redoable = 0 WHERE undone_at IS NOT NULL AND redoable = 1').run()
    this.database.prepare('INSERT INTO clip_tag_operation_history (id, operation_type, snapshot_json, created_at) VALUES (?, ?, ?, ?)').run(randomUUID(), type, JSON.stringify(redoSnapshot), createdAt)
    this.database.exec(`DELETE FROM clip_tag_operation_history WHERE id NOT IN (SELECT id FROM clip_tag_operation_history ORDER BY rowid DESC LIMIT ${TAG_OPERATION_HISTORY_RETENTION_LIMIT})`)
  }

  private recordCollectionOperation(type: VisionClipCollectionOperationType, snapshot: CollectionOperationSnapshot, createdAt: number): void {
    this.database.prepare('INSERT INTO clip_collection_operation_history (id, operation_type, snapshot_json, created_at) VALUES (?, ?, ?, ?)').run(randomUUID(), type, JSON.stringify(snapshot), createdAt)
    this.database.exec('DELETE FROM clip_collection_operation_history WHERE id NOT IN (SELECT id FROM clip_collection_operation_history ORDER BY rowid DESC LIMIT 20)')
  }

  private parseTagOperationSnapshot(value: unknown): TagOperationSnapshot | null {
    if (typeof value !== 'string' || !value.trim()) return null
    try {
      const parsed = JSON.parse(value) as Partial<TagOperationSnapshot>
      if (!Array.isArray(parsed.collectionTags) || !Array.isArray(parsed.metadataTags) || !Array.isArray(parsed.metadata)) return null
      if (parsed.redoCollectionTags !== undefined && !Array.isArray(parsed.redoCollectionTags)) return null
      if (parsed.redoMetadataTags !== undefined && !Array.isArray(parsed.redoMetadataTags)) return null
      if (parsed.redoMetadata !== undefined && !Array.isArray(parsed.redoMetadata)) return null
      const readCollectionTags = (items: unknown[]): TagOperationCollectionSnapshot[] => items.map((item) => {
        if (!item || typeof item !== 'object') return null
        const candidate = item as Partial<TagOperationCollectionSnapshot>
        if (typeof candidate.id !== 'string' || !Array.isArray(candidate.tags) || typeof candidate.updatedAt !== 'number') return null
        return { id: candidate.id, tags: normalizeVisionCollectionTags(candidate.tags), updatedAt: candidate.updatedAt }
      }).filter((item): item is TagOperationCollectionSnapshot => item !== null)
      const readMetadata = (items: unknown[]): VisionClipCollectionTagMetadata[] => items.map((item) => {
        if (!item || typeof item !== 'object') return null
        const candidate = item as Partial<VisionClipCollectionTagMetadata>
        const tag = normalizeVisionCollectionTag(candidate.tag)
        if (!tag || typeof candidate.updatedAt !== 'number') return null
        return { tag, parentTag: normalizeVisionCollectionTag(candidate.parentTag), color: normalizeVisionCollectionTagColor(candidate.color), textColor: normalizeVisionCollectionTagColor(candidate.textColor), note: normalizeVisionCollectionTagNote(candidate.note), isFavorite: normalizeVisionCollectionTagFavorite(candidate.isFavorite), updatedAt: candidate.updatedAt }
      }).filter((item): item is VisionClipCollectionTagMetadata => item !== null)
      const readMetadataTags = (items: unknown[]): string[] => items.filter((tag): tag is string => typeof tag === 'string' && Boolean(normalizeVisionCollectionTag(tag))).map((tag) => normalizeVisionCollectionTag(tag))
      const collectionTags = readCollectionTags(parsed.collectionTags)
      const metadataTags = readMetadataTags(parsed.metadataTags)
      const metadata = readMetadata(parsed.metadata)
      const redoCollectionTags = parsed.redoCollectionTags === undefined ? undefined : readCollectionTags(parsed.redoCollectionTags)
      const redoMetadataTags = parsed.redoMetadataTags === undefined ? undefined : readMetadataTags(parsed.redoMetadataTags)
      const redoMetadata = parsed.redoMetadata === undefined ? undefined : readMetadata(parsed.redoMetadata)
      return { collectionTags, metadataTags, metadata, ...(redoCollectionTags === undefined ? {} : { redoCollectionTags }), ...(redoMetadataTags === undefined ? {} : { redoMetadataTags }), ...(redoMetadata === undefined ? {} : { redoMetadata }) }
    } catch {
      return null
    }
  }

  private restoreTagOperationSnapshot(snapshot: TagOperationSnapshot, redo: boolean): void {
    const collectionTags = redo ? snapshot.redoCollectionTags : snapshot.collectionTags
    const metadataTags = redo ? snapshot.redoMetadataTags : snapshot.metadataTags
    const metadata = redo ? snapshot.redoMetadata : snapshot.metadata
    if (!collectionTags || !metadataTags || !metadata) throw new Error('标签操作快照缺少可恢复数据')
    const updateCollection = this.database.prepare('UPDATE clip_collections SET tags_json = ?, updated_at = ? WHERE id = ?')
    for (const collection of collectionTags) updateCollection.run(JSON.stringify(collection.tags), collection.updatedAt, collection.id)
    if (metadataTags.length > 0) {
      const placeholders = metadataTags.map(() => '?').join(', ')
      this.database.prepare(`DELETE FROM clip_tag_metadata WHERE tag IN (${placeholders})`).run(...metadataTags)
    }
    const insertMetadata = this.database.prepare('INSERT INTO clip_tag_metadata (tag, parent_tag, color, text_color, note, is_favorite, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const item of metadata) insertMetadata.run(item.tag, item.parentTag, item.color, item.textColor, item.note, item.isFavorite ? 1 : 0, item.updatedAt)
  }

  private readTagOperationHistory(row: SqliteRow): VisionClipCollectionTagOperationHistory | null {
    const id = stringValue(row, 'id')
    const type = stringValue(row, 'operation_type')
    if (!id || !TAG_OPERATION_TYPES.includes(type as VisionClipCollectionTagOperationType)) return null
    return { id, type: type as VisionClipCollectionTagOperationType, createdAt: numberValue(row, 'created_at') }
  }

  private readTagOperationHistoryEntry(row: SqliteRow): VisionClipCollectionTagOperationHistoryEntry | null {
    const operation = this.readTagOperationHistory(row)
    if (!operation) return null
    const undoneAt = nullableNumberValue(row, 'undone_at') ?? null
    const status = undoneAt === null ? 'active' : numberValue(row, 'redoable') > 0 ? 'redoable' : 'undone'
    return { ...operation, status, undoneAt }
  }

  private parseCollectionOperationSnapshot(value: unknown): CollectionOperationSnapshot | null {
    if (typeof value !== 'string' || !value.trim()) return null
    try {
      const parsed = JSON.parse(value) as Partial<CollectionOperationSnapshot>
      if (!Array.isArray(parsed.collectionFlags)) return null
      if (parsed.redoCollectionFlags !== undefined && !Array.isArray(parsed.redoCollectionFlags)) return null
      const readFlags = (items: unknown[]): CollectionOperationFlagSnapshot[] => items.map((item) => {
        if (!item || typeof item !== 'object') return null
        const candidate = item as Partial<CollectionOperationFlagSnapshot>
        if (typeof candidate.id !== 'string' || typeof candidate.isFavorite !== 'boolean' || typeof candidate.isArchived !== 'boolean' || typeof candidate.updatedAt !== 'number') return null
        return { id: candidate.id, isFavorite: candidate.isFavorite, isArchived: candidate.isArchived, updatedAt: candidate.updatedAt }
      }).filter((item): item is CollectionOperationFlagSnapshot => item !== null)
      const collectionFlags = readFlags(parsed.collectionFlags)
      const redoCollectionFlags = parsed.redoCollectionFlags === undefined ? undefined : readFlags(parsed.redoCollectionFlags)
      return redoCollectionFlags === undefined ? { collectionFlags } : { collectionFlags, redoCollectionFlags }
    } catch {
      return null
    }
  }

  private readCollectionOperationHistory(row: SqliteRow): VisionClipCollectionOperationHistory | null {
    const id = stringValue(row, 'id')
    const type = stringValue(row, 'operation_type')
    if (!id || !COLLECTION_OPERATION_TYPES.includes(type as VisionClipCollectionOperationType)) return null
    return { id, type: type as VisionClipCollectionOperationType, createdAt: numberValue(row, 'created_at') }
  }

  private ensureCollectionColumn(name: 'tags_json' | 'sort_mode' | 'is_favorite' | 'is_archived', definition: string): void {
    const columns = this.database.prepare('PRAGMA table_info(clip_collections)').all() as SqliteRow[]
    if (columns.some((column) => stringValue(column, 'name') === name)) return
    this.database.exec(`ALTER TABLE clip_collections ADD COLUMN ${name} ${definition}`)
  }

  private ensureTagMetadataColumn(name: 'note' | 'is_favorite', definition: string): void {
    const columns = this.database.prepare('PRAGMA table_info(clip_tag_metadata)').all() as SqliteRow[]
    if (columns.some((column) => stringValue(column, 'name') === name)) return
    this.database.exec(`ALTER TABLE clip_tag_metadata ADD COLUMN ${name} ${definition}`)
  }

  private ensureTagOperationHistoryColumn(name: 'redoable', definition: string): void {
    const columns = this.database.prepare('PRAGMA table_info(clip_tag_operation_history)').all() as SqliteRow[]
    if (columns.some((column) => stringValue(column, 'name') === name)) return
    this.database.exec(`ALTER TABLE clip_tag_operation_history ADD COLUMN ${name} ${definition}`)
  }

  private ensureCollectionOperationHistoryColumn(name: 'redoable', definition: string): void {
    const columns = this.database.prepare('PRAGMA table_info(clip_collection_operation_history)').all() as SqliteRow[]
    if (columns.some((column) => stringValue(column, 'name') === name)) return
    this.database.exec(`ALTER TABLE clip_collection_operation_history ADD COLUMN ${name} ${definition}`)
  }
}
