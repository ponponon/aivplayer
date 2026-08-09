export const VISION_ENTITY_CATALOG_SCHEMA_VERSION = 2

export type VisionEntityCatalogEntryKind = 'builtin' | 'custom'

export type VisionEntityCatalogEntry = {
  labelId: string
  kind: VisionEntityCatalogEntryKind
  defaultName: string
  name: string
  query: string
  aliases: string[]
  hidden: boolean
  mergedInto: string | null
}

export type VisionEntityCatalog = {
  schemaVersion: typeof VISION_ENTITY_CATALOG_SCHEMA_VERSION
  updatedAt: number
  entries: VisionEntityCatalogEntry[]
}

export type VisionEntityCatalogPatch = {
  labelId: string
  name?: string
  aliases?: string[]
  hidden?: boolean
  mergedInto?: string | null
}

export type VisionEntityCatalogCreateInput = {
  name: string
  query: string
  aliases?: string[]
}

export type VisionEntityCatalogBatchAction = 'hide' | 'show' | 'merge'

export type VisionEntityCatalogBatchPatch = {
  labelIds: string[]
  action: VisionEntityCatalogBatchAction
  mergedInto?: string
}
