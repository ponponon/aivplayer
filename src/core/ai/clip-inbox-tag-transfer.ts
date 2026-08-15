import { normalizeVisionCollectionTag, normalizeVisionCollectionTagColor, normalizeVisionCollectionTagFavorite, normalizeVisionCollectionTagNote } from './clip-inbox-operations'
import type { VisionClipCollectionTagMetadata } from '../../shared/vision-types'

export const VISION_CLIP_COLLECTION_TAG_METADATA_EXPORT_VERSION = 1
const MAX_TAG_METADATA_TRANSFER_ITEMS = 5000

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeTransferColor(value: unknown, index: number, label: string): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') throw new Error(`第 ${index + 1} 个标签的${label}无效`)
  const normalized = normalizeVisionCollectionTagColor(value)
  if (value.trim() && !normalized) throw new Error(`第 ${index + 1} 个标签的${label}无效`)
  return normalized
}

function parseMetadataItem(value: unknown, index: number): VisionClipCollectionTagMetadata {
  if (!isRecord(value)) throw new Error(`第 ${index + 1} 个标签元数据无效`)
  const tag = normalizeVisionCollectionTag(value.tag)
  if (!tag) throw new Error(`第 ${index + 1} 个标签名称无效`)
  const parentTag = value.parentTag === undefined || value.parentTag === null ? '' : normalizeVisionCollectionTag(value.parentTag)
  return {
    tag,
    parentTag,
    color: normalizeTransferColor(value.color, index, '背景色'),
    textColor: normalizeTransferColor(value.textColor, index, '文字色'),
    note: normalizeVisionCollectionTagNote(value.note),
    isFavorite: normalizeVisionCollectionTagFavorite(value.isFavorite),
    updatedAt: typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0
  }
}

export function renderVisionClipCollectionTagMetadataExport(metadata: readonly VisionClipCollectionTagMetadata[]): string {
  const normalized = metadata.map((item, index) => parseMetadataItem(item, index)).sort((left, right) => left.tag.localeCompare(right.tag, undefined, { sensitivity: 'base' }))
  return `${JSON.stringify({ exportVersion: VISION_CLIP_COLLECTION_TAG_METADATA_EXPORT_VERSION, metadata: normalized }, null, 2)}\n`
}

export function parseVisionClipCollectionTagMetadataImport(value: unknown): VisionClipCollectionTagMetadata[] {
  if (!isRecord(value) || value.exportVersion !== VISION_CLIP_COLLECTION_TAG_METADATA_EXPORT_VERSION || !Array.isArray(value.metadata)) {
    throw new Error('标签元数据导入文件格式无效或版本不受支持')
  }
  if (value.metadata.length > MAX_TAG_METADATA_TRANSFER_ITEMS) throw new Error('标签元数据数量超过上限')
  const metadata = value.metadata.map(parseMetadataItem)
  const tags = new Set<string>()
  for (const item of metadata) {
    if (tags.has(item.tag)) throw new Error(`标签元数据中存在重复标签：${item.tag}`)
    tags.add(item.tag)
  }
  return metadata
}

export function parseVisionClipCollectionTagMetadataImportText(text: string): VisionClipCollectionTagMetadata[] {
  if (typeof text !== 'string' || text.length === 0) throw new Error('标签元数据导入文件为空')
  try {
    return parseVisionClipCollectionTagMetadataImport(JSON.parse(text) as unknown)
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('标签元数据导入文件不是有效的 JSON')
    throw error
  }
}
