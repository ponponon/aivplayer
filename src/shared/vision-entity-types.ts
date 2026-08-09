export const VISION_ENTITY_CATALOG_SCHEMA_VERSION = 1

export type VisionEntityCatalogEntry = {
  labelId: string
  defaultName: string
  name: string
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

export type VisionEntityCatalogBatchAction = 'hide' | 'show' | 'merge'

export type VisionEntityCatalogBatchPatch = {
  labelIds: string[]
  action: VisionEntityCatalogBatchAction
  mergedInto?: string
}
