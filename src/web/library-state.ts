import type { WebShareMediaItem } from '../shared/web-types'

export type WebLibrarySortMode = 'name-asc' | 'name-desc' | 'size-desc' | 'duration-desc' | 'recent'
export type WebLibraryFilterMode = 'all' | 'favorites' | 'in-progress' | 'unwatched'
export type WebLibraryTreeNodeKind = 'group' | 'directory' | 'file'

export type WebLibraryTreeNode = {
  id: string
  label: string
  kind: WebLibraryTreeNodeKind
  sourceGroupId: string
  relativePath: string
  item: WebShareMediaItem | null
  itemCount: number
  children: WebLibraryTreeNode[]
}

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

export function getWebLibraryTreeNodeId(sourceGroupId: string, relativePath = ''): string {
  return relativePath ? `${sourceGroupId}::${relativePath}` : sourceGroupId
}

function isItemInsideTreeNode(item: WebShareMediaItem, nodeId: string): boolean {
  const separatorIndex = nodeId.indexOf('::')
  if (separatorIndex < 0) return item.sourceGroupId === nodeId
  const sourceGroupId = nodeId.slice(0, separatorIndex)
  const relativePath = nodeId.slice(separatorIndex + 2)
  return item.sourceGroupId === sourceGroupId && (item.relativePath === relativePath || item.relativePath.startsWith(`${relativePath}/`))
}

export function buildWebLibraryTree(items: WebShareMediaItem[]): WebLibraryTreeNode[] {
  const roots = new Map<string, WebLibraryTreeNode>()
  const childMaps = new Map<string, Map<string, WebLibraryTreeNode>>()
  for (const item of items) {
    let parentNode: WebLibraryTreeNode | undefined = roots.get(item.sourceGroupId)
    if (!parentNode) {
      parentNode = { id: item.sourceGroupId, label: item.sourceGroupLabel, kind: 'group', sourceGroupId: item.sourceGroupId, relativePath: '', item: null, itemCount: 0, children: [] }
      roots.set(item.sourceGroupId, parentNode)
      childMaps.set(parentNode.id, new Map())
    }
    parentNode.itemCount += 1
    const parts = (item.relativePath || item.name).split('/').filter(Boolean)
    let relativePath = ''
    for (const [index, part] of parts.entries()) {
      relativePath = relativePath ? `${relativePath}/${part}` : part
      const isFile = index === parts.length - 1
      const nodeId = isFile ? `${item.sourceGroupId}::file:${item.id}` : getWebLibraryTreeNodeId(item.sourceGroupId, relativePath)
      const children: Map<string, WebLibraryTreeNode> = childMaps.get(parentNode.id) ?? new Map<string, WebLibraryTreeNode>()
      let node: WebLibraryTreeNode | undefined = children.get(nodeId)
      if (!node) {
        node = { id: nodeId, label: part, kind: isFile ? 'file' : 'directory', sourceGroupId: item.sourceGroupId, relativePath, item: isFile ? item : null, itemCount: 0, children: [] }
        children.set(nodeId, node)
        childMaps.set(parentNode.id, children)
        parentNode.children.push(node)
        childMaps.set(node.id, new Map())
      }
      node.itemCount += 1
      parentNode = node
    }
  }
  const sortNodes = (nodes: WebLibraryTreeNode[]): void => {
    nodes.sort((left, right) => (left.kind === 'file' ? 1 : 0) - (right.kind === 'file' ? 1 : 0) || left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }))
    for (const node of nodes) sortNodes(node.children)
  }
  const result = [...roots.values()]
  sortNodes(result)
  return result
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
    if (preferences.selectedGroupId !== 'all' && !isItemInsideTreeNode(item, preferences.selectedGroupId)) return false
    if (normalizedQuery && !`${item.name} ${item.relativePath}`.toLocaleLowerCase().includes(normalizedQuery)) return false
    if (preferences.filter === 'favorites' && !preferences.favorites.includes(item.id)) return false
    if (preferences.filter === 'in-progress' && !isInProgress(item, preferences)) return false
    if (preferences.filter === 'unwatched' && getHistoryEntry(preferences, item.id)) return false
    return true
  })
}
