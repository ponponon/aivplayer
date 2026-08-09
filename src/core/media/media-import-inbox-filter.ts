import type { MediaImportInboxItem, MediaImportInboxStatus } from '../../shared/media-import-inbox'

export type MediaImportInboxFilter = {
  query?: string
  status?: MediaImportInboxStatus | 'all'
  favoriteOnly?: boolean
}

function searchableText(item: MediaImportInboxItem): string {
  return [item.fileName, item.path, item.metadata.tags.join(' '), item.metadata.note, item.metadata.source ?? '', item.metadata.projectId ?? '']
    .join('\u0000')
    .toLocaleLowerCase()
}

export function filterMediaImportInboxItems(items: readonly MediaImportInboxItem[], filter: MediaImportInboxFilter): MediaImportInboxItem[] {
  const query = typeof filter.query === 'string' ? filter.query.trim().toLocaleLowerCase() : ''
  const status = filter.status ?? 'all'
  return items.filter((item) => {
    if (status !== 'all' && item.status !== status) return false
    if (filter.favoriteOnly === true && !item.metadata.favorite) return false
    return !query || searchableText(item).includes(query)
  })
}
