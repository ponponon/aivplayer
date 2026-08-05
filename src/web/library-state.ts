import type { WebShareMediaItem } from '../shared/web-types'

export type WebLibrarySortMode = 'name-asc' | 'name-desc' | 'size-desc' | 'duration-desc' | 'recent'
export type WebLibraryFilterMode = 'all' | 'favorites' | 'in-progress' | 'unwatched'

export type WebPlaybackHistoryEntry = {
  position: number
  duration: number | null
  updatedAt: number
}

export type WebLibraryPreferences = {
  favorites: string[]
  history: Record<string, WebPlaybackHistoryEntry>
  sort: WebLibrarySortMode
  filter: WebLibraryFilterMode
  selectedGroupId: string
  expandedGroups: string[]
}

export const WEB_LIBRARY_STORAGE_KEY = 'aivplayer-web-library-v1'

export function createDefaultWebLibraryPreferences(): WebLibraryPreferences {
  return {
    favorites: [],
    history: {},
    sort: 'name-asc',
    filter: 'all',
    selectedGroupId: 'all',
    expandedGroups: ['playlist']
  }
}

export function readWebLibraryPreferences(): WebLibraryPreferences {
  const fallback = createDefaultWebLibraryPreferences()
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(WEB_LIBRARY_STORAGE_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return fallback
    const value = parsed as Partial<WebLibraryPreferences>
    return {
      favorites: Array.isArray(value.favorites) ? value.favorites.filter((id): id is string => typeof id === 'string') : fallback.favorites,
      history: value.history && typeof value.history === 'object' && !Array.isArray(value.history) ? value.history as Record<string, WebPlaybackHistoryEntry> : fallback.history,
      sort: value.sort === 'name-desc' || value.sort === 'size-desc' || value.sort === 'duration-desc' || value.sort === 'recent' ? value.sort : fallback.sort,
      filter: value.filter === 'favorites' || value.filter === 'in-progress' || value.filter === 'unwatched' ? value.filter : fallback.filter,
      selectedGroupId: typeof value.selectedGroupId === 'string' ? value.selectedGroupId : fallback.selectedGroupId,
      expandedGroups: Array.isArray(value.expandedGroups) ? value.expandedGroups.filter((id): id is string => typeof id === 'string') : fallback.expandedGroups
    }
  } catch {
    return fallback
  }
}

export function writeWebLibraryPreferences(preferences: WebLibraryPreferences): void {
  try {
    window.localStorage.setItem(WEB_LIBRARY_STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Private browsing or a full storage quota should not stop playback.
  }
}

export function getHistoryEntry(preferences: WebLibraryPreferences, id: string): WebPlaybackHistoryEntry | null {
  const entry = preferences.history[id]
  if (!entry || !Number.isFinite(entry.position) || entry.position <= 0) return null
  return entry
}

export function isInProgress(item: WebShareMediaItem, preferences: WebLibraryPreferences): boolean {
  const entry = getHistoryEntry(preferences, item.id)
  if (!entry) return false
  if (entry.duration && entry.duration > 0 && entry.position >= entry.duration - 10) return false
  return true
}

export function sortWebLibraryItems(items: WebShareMediaItem[], preferences: WebLibraryPreferences): WebShareMediaItem[] {
  return [...items].sort((left, right) => {
    if (preferences.sort === 'size-desc') return right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
    if (preferences.sort === 'duration-desc') return (right.durationSeconds ?? -1) - (left.durationSeconds ?? -1) || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
    if (preferences.sort === 'recent') return (preferences.history[right.id]?.updatedAt ?? 0) - (preferences.history[left.id]?.updatedAt ?? 0) || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
    const result = left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
    return preferences.sort === 'name-desc' ? -result : result
  })
}

export function filterWebLibraryItems(items: WebShareMediaItem[], query: string, preferences: WebLibraryPreferences): WebShareMediaItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return items.filter((item) => {
    if (preferences.selectedGroupId !== 'all' && item.sourceGroupId !== preferences.selectedGroupId) return false
    if (normalizedQuery && !`${item.name} ${item.relativePath}`.toLocaleLowerCase().includes(normalizedQuery)) return false
    if (preferences.filter === 'favorites' && !preferences.favorites.includes(item.id)) return false
    if (preferences.filter === 'in-progress' && !isInProgress(item, preferences)) return false
    if (preferences.filter === 'unwatched' && getHistoryEntry(preferences, item.id)) return false
    return true
  })
}
