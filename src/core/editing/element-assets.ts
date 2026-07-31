import type { EditingGraphic, EditingGraphicPosition, EditingGraphicStyle } from '../../shared/editing-types'

export const EDITING_ELEMENT_ASSET_LIMIT = 40

export type EditingElementAsset = {
  id: string
  name: string
  text: string
  position: EditingGraphicPosition
  style: EditingGraphicStyle
  durationSeconds: number
  createdAt: number
  updatedAt: number
}

function assetSignature(asset: Pick<EditingElementAsset, 'text' | 'position' | 'style' | 'durationSeconds'>): string {
  return [asset.text.trim(), asset.position, asset.style, asset.durationSeconds.toFixed(2)].join('|')
}

function makeAssetId(now: number): string {
  return `element-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createEditingElementAsset(graphic: EditingGraphic, now = Date.now()): EditingElementAsset {
  const text = graphic.text.trim()
  return { id: makeAssetId(now), name: text.replace(/\s+/gu, ' ').slice(0, 32), text, position: graphic.position, style: graphic.style, durationSeconds: graphic.durationSeconds, createdAt: now, updatedAt: now }
}

export function upsertEditingElementAsset(assets: readonly EditingElementAsset[], asset: EditingElementAsset): EditingElementAsset[] {
  const existing = assets.find((candidate) => assetSignature(candidate) === assetSignature(asset))
  if (existing) return assets.map((candidate) => candidate.id === existing.id ? { ...candidate, name: asset.name, updatedAt: asset.updatedAt } : candidate)
  return [asset, ...assets].slice(0, EDITING_ELEMENT_ASSET_LIMIT)
}

export function removeEditingElementAsset(assets: readonly EditingElementAsset[], assetId: string): EditingElementAsset[] {
  return assets.filter((asset) => asset.id !== assetId)
}

export function normalizeEditingElementAssets(value: unknown): EditingElementAsset[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is EditingElementAsset => {
    if (!item || typeof item !== 'object') return false
    const asset = item as Partial<EditingElementAsset>
    return typeof asset.id === 'string' && typeof asset.name === 'string' && typeof asset.text === 'string' && ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(asset.position ?? '') && ['title', 'label'].includes(asset.style ?? '') && typeof asset.durationSeconds === 'number' && Number.isFinite(asset.durationSeconds) && asset.durationSeconds >= 0.2 && typeof asset.createdAt === 'number' && typeof asset.updatedAt === 'number'
  }).slice(0, EDITING_ELEMENT_ASSET_LIMIT)
}
