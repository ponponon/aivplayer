import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WebShareMediaItem } from '../shared/web-types'
import type { WebLibraryPreferences } from './library-state'

type PreferencesUpdater = (updater: (current: WebLibraryPreferences) => WebLibraryPreferences) => void

export function useWebLibraryBatch(visibleItems: WebShareMediaItem[], preferences: WebLibraryPreferences, updatePreferences: PreferencesUpdater) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const visibleIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems])

  useEffect(() => {
    const visibleIdSet = new Set(visibleIds)
    setSelectedIds((current) => {
      const next = current.filter((id) => visibleIdSet.has(id))
      return next.length === current.length ? current : next
    })
  }, [visibleIds])

  const enterSelectionMode = useCallback((): void => setSelectionMode(true), [])
  const exitSelectionMode = useCallback((): void => {
    setSelectionMode(false)
    setSelectedIds([])
  }, [])
  const toggleSelection = useCallback((id: string): void => {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }, [])
  const selectAllVisible = useCallback((): void => {
    setSelectedIds((current) => {
      const currentSet = new Set(current)
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => currentSet.has(id))
      if (allSelected) for (const id of visibleIds) currentSet.delete(id)
      else for (const id of visibleIds) currentSet.add(id)
      return visibleIds.filter((id) => currentSet.has(id))
    })
  }, [visibleIds])
  const clearSelection = useCallback((): void => setSelectedIds([]), [])
  const toggleFavorites = useCallback((): void => {
    if (selectedIds.length === 0) return
    const allFavorited = selectedIds.every((id) => preferences.favorites.includes(id))
    updatePreferences((current) => {
      const favorites = new Set(current.favorites)
      for (const id of selectedIds) {
        if (allFavorited) favorites.delete(id)
        else favorites.add(id)
      }
      return { ...current, favorites: [...favorites] }
    })
  }, [preferences.favorites, selectedIds, updatePreferences])

  return {
    selectionMode,
    selectedIds,
    selectedCount: selectedIds.length,
    allVisibleSelected: visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id)),
    allSelectedFavorited: selectedIds.length > 0 && selectedIds.every((id) => preferences.favorites.includes(id)),
    enterSelectionMode,
    exitSelectionMode,
    toggleSelection,
    selectAllVisible,
    clearSelection,
    toggleFavorites
  }
}
