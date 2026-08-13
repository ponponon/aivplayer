import { normalizeVisionCollectionTags, normalizeVisionCollectionSortMode } from './clip-inbox-operations'
import { normalizeVisionTimeRange } from './vision-evidence'
import type { VisionClipCollectionInput, VisionClipSelection, VisionEvidenceType } from '../../shared/vision-types'

const VISION_CLIP_COLLECTION_EXPORT_VERSION = 1
const VISION_CLIP_COLLECTION_BATCH_EXPORT_VERSION = 2
const MAX_COLLECTION_TITLE_LENGTH = 200
const MAX_COLLECTION_SELECTIONS = 10_000
const MAX_SELECTION_TEXT_LENGTH = 20_000
const VISION_EVIDENCE_TYPES: readonly VisionEvidenceType[] = ['subtitle', 'visual', 'scene', 'ocr', 'entity', 'object', 'speaker']

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`导入文件中的${label}无效`)
  return value.trim()
}

function finitePositiveNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`导入文件中的${label}无效`)
  return value
}

function optionalPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function parseSelection(value: unknown, index: number): VisionClipSelection {
  if (!isRecord(value)) throw new Error(`导入文件中的第 ${index + 1} 个选段无效`)
  const durationSeconds = finitePositiveNumber(value.durationSeconds, '媒体时长')
  if (typeof value.startSeconds !== 'number' || typeof value.endSeconds !== 'number' || !Number.isFinite(value.startSeconds) || !Number.isFinite(value.endSeconds)) {
    throw new Error(`导入文件中的第 ${index + 1} 个选段时间无效`)
  }
  const range = normalizeVisionTimeRange({ startSeconds: value.startSeconds, endSeconds: value.endSeconds }, durationSeconds)
  if (!range) throw new Error(`导入文件中的第 ${index + 1} 个选段为空或超出媒体范围`)
  const evidenceIds = Array.isArray(value.evidenceIds)
    ? [...new Set(value.evidenceIds.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()))].slice(0, 100)
    : []
  const evidenceTypes = Array.isArray(value.evidenceTypes)
    ? [...new Set(value.evidenceTypes.filter((item): item is VisionEvidenceType => typeof item === 'string' && VISION_EVIDENCE_TYPES.includes(item as VisionEvidenceType)))]
    : []
  const text = typeof value.text === 'string' && value.text.trim() ? value.text.trim().slice(0, MAX_SELECTION_TEXT_LENGTH) : undefined
  return {
    sourceId: requiredString(value.sourceId, '源 ID'),
    videoPath: requiredString(value.videoPath, '视频路径'),
    fileName: typeof value.fileName === 'string' ? value.fileName.trim() : '',
    fingerprint: typeof value.fingerprint === 'string' ? value.fingerprint.trim() : '',
    durationSeconds,
    width: optionalPositiveNumber(value.width),
    height: optionalPositiveNumber(value.height),
    startSeconds: range.startSeconds,
    endSeconds: range.endSeconds,
    evidenceIds,
    text,
    evidenceTypes
  }
}

/** Parses the portable JSON produced by renderVisionClipCollectionExport. */
function parseCollectionInput(value: unknown): VisionClipCollectionInput {
  if (!isRecord(value)) throw new Error('导入文件中的集合无效')
  const collection = value
  const title = requiredString(collection.title, '集合名称').slice(0, MAX_COLLECTION_TITLE_LENGTH)
  if (!Array.isArray(collection.selections) || collection.selections.length === 0 || collection.selections.length > MAX_COLLECTION_SELECTIONS) {
    throw new Error('导入文件中的选段数量无效')
  }
  return {
    title,
    tags: normalizeVisionCollectionTags(collection.tags),
    sortMode: normalizeVisionCollectionSortMode(collection.sortMode),
    selections: collection.selections.map((selection, index) => parseSelection(selection, index))
  }
}

export function parseVisionClipCollectionImport(value: unknown): VisionClipCollectionInput {
  if (!isRecord(value) || value.exportVersion !== VISION_CLIP_COLLECTION_EXPORT_VERSION || !isRecord(value.collection)) {
    throw new Error('选段集合导入文件格式无效或版本不受支持')
  }
  return parseCollectionInput(value.collection)
}

export function parseVisionClipCollectionsImport(value: unknown): VisionClipCollectionInput[] {
  if (!isRecord(value) || value.exportVersion !== VISION_CLIP_COLLECTION_BATCH_EXPORT_VERSION || !Array.isArray(value.collections) || value.collections.length === 0) {
    throw new Error('选段集合批量导入文件格式无效或版本不受支持')
  }
  return value.collections.map((collection, index) => {
    try {
      return parseCollectionInput(collection)
    } catch (error) {
      throw new Error(`第 ${index + 1} 个集合导入失败：${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

export function parseVisionClipCollectionImportText(text: string): VisionClipCollectionInput {
  if (typeof text !== 'string' || text.length === 0) throw new Error('导入文件为空')
  try {
    return parseVisionClipCollectionImport(JSON.parse(text) as unknown)
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('导入文件不是有效的 JSON')
    throw error
  }
}
