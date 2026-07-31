import { useCallback, useState } from 'react'
import type { EditingGraphic } from '../../../shared/editing-types'
import { createEditingElementAsset, normalizeEditingElementAssets, removeEditingElementAsset, upsertEditingElementAsset, type EditingElementAsset } from '../../../core/editing/element-assets'

const STORAGE_KEY = 'aivplayer.editing-element-assets.v1'

function readAssets(): EditingElementAsset[] {
  if (typeof window === 'undefined') return []
  try {
    return normalizeEditingElementAssets(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]'))
  } catch {
    return []
  }
}

function writeAssets(assets: readonly EditingElementAsset[]): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(assets)) } catch { /* Storage can be unavailable. */ }
}

export function useEditingElementAssets(): { assets: readonly EditingElementAsset[]; saveAsset: (graphic: EditingGraphic) => void; deleteAsset: (assetId: string) => void } {
  const [assets, setAssets] = useState<EditingElementAsset[]>(readAssets)
  const saveAsset = useCallback((graphic: EditingGraphic): void => {
    setAssets((current) => { const next = upsertEditingElementAsset(current, createEditingElementAsset(graphic)); writeAssets(next); return next })
  }, [])
  const deleteAsset = useCallback((assetId: string): void => {
    setAssets((current) => { const next = removeEditingElementAsset(current, assetId); writeAssets(next); return next })
  }, [])
  return { assets, saveAsset, deleteAsset }
}
