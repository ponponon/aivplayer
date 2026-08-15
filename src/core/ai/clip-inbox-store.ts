import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { mergeVisionClipSelections, normalizeVisionTimeRange } from './vision-evidence'
import { duplicateVisionCollectionTitle, normalizeVisionClipCollectionIds, normalizeVisionClipCollectionRenamePart, normalizeVisionCollectionSortMode, normalizeVisionCollectionTags, renameVisionClipCollectionTitle, sortVisionClipSelections } from './clip-inbox-operations'
import type { VisionClipCollection, VisionClipCollectionBatchDeleteResult, VisionClipCollectionBatchRenameResult, VisionClipCollectionBatchTagsResult, VisionClipCollectionInput, VisionClipSelection, VisionEvidenceType } from '../../shared/vision-types'

type SqliteRow = Record<string, unknown>
const EVIDENCE_TYPES: readonly VisionEvidenceType[] = ['subtitle', 'visual', 'scene', 'ocr', 'entity', 'object']

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
    `)
    this.ensureCollectionColumn('tags_json', "TEXT NOT NULL DEFAULT '[]'")
    this.ensureCollectionColumn('sort_mode', "TEXT NOT NULL DEFAULT 'source-time'")
  }

  close(): void {
    this.database.close()
  }

  listCollections(): VisionClipCollection[] {
    const rows = this.database.prepare('SELECT * FROM clip_collections ORDER BY updated_at DESC, created_at DESC').all() as SqliteRow[]
    return rows.map((row) => this.readCollection(row)).filter((collection): collection is VisionClipCollection => collection !== null)
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
    const existing = this.database.prepare('SELECT created_at FROM clip_collections WHERE id = ?').get(id) as SqliteRow | undefined
    const now = Date.now()
    this.database.exec('BEGIN')
    try {
      this.database.prepare(`
        INSERT INTO clip_collections (id, title, tags_json, sort_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title, tags_json = excluded.tags_json, sort_mode = excluded.sort_mode, updated_at = excluded.updated_at
      `).run(id, title, JSON.stringify(tags), sortMode, existing ? numberValue(existing, 'created_at') : now, now)
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
      selections: collection.selections
    })
  }

  duplicateCollections(collectionIds: readonly string[]): { collections: VisionClipCollection[]; skippedCount: number } {
    const normalizedIds = normalizeVisionClipCollectionIds(collectionIds)
    const collections = normalizedIds.map((collectionId) => this.duplicateCollection(collectionId)).filter((collection): collection is VisionClipCollection => collection !== null)
    return { collections, skippedCount: normalizedIds.length - collections.length }
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

  updateCollectionsTags(collectionIds: readonly string[], tags: unknown): Pick<VisionClipCollectionBatchTagsResult, 'collections' | 'skippedCount'> {
    const normalizedIds = normalizeVisionClipCollectionIds(collectionIds)
    const normalizedTags = normalizeVisionCollectionTags(tags)
    if (normalizedIds.length === 0) return { collections: [], skippedCount: 0 }
    const placeholders = normalizedIds.map(() => '?').join(', ')
    this.database.exec('BEGIN')
    try {
      const rows = this.database.prepare(`SELECT id FROM clip_collections WHERE id IN (${placeholders})`).all(...normalizedIds) as SqliteRow[]
      const existingIds = new Set(rows.map((row) => stringValue(row, 'id')).filter(Boolean))
      const now = Date.now()
      const update = this.database.prepare('UPDATE clip_collections SET tags_json = ?, updated_at = ? WHERE id = ?')
      for (const id of normalizedIds) {
        if (existingIds.has(id)) update.run(JSON.stringify(normalizedTags), now, id)
      }
      this.database.exec('COMMIT')
      const collections = normalizedIds.filter((id) => existingIds.has(id)).map((id) => this.getCollection(id)).filter((collection): collection is VisionClipCollection => collection !== null)
      return { collections, skippedCount: normalizedIds.length - collections.length }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
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
      createdAt: numberValue(row, 'created_at'),
      updatedAt: numberValue(row, 'updated_at'),
      selections
    }
  }

  private ensureCollectionColumn(name: 'tags_json' | 'sort_mode', definition: string): void {
    const columns = this.database.prepare('PRAGMA table_info(clip_collections)').all() as SqliteRow[]
    if (columns.some((column) => stringValue(column, 'name') === name)) return
    this.database.exec(`ALTER TABLE clip_collections ADD COLUMN ${name} ${definition}`)
  }
}
