export const SPEAKER_DIARIZATION_CATALOG_SCHEMA_VERSION = 1 as const

export type SpeakerDiarizationCatalogEntry = {
  speakerId: number
  name: string
  aliases: string[]
}

export type SpeakerDiarizationCatalogSource = {
  sourceFingerprint: string
  videoPath: string
  fileName: string
  updatedAt: number
  entries: SpeakerDiarizationCatalogEntry[]
}

export type SpeakerDiarizationCatalog = {
  schemaVersion: typeof SPEAKER_DIARIZATION_CATALOG_SCHEMA_VERSION
  updatedAt: number
  sources: SpeakerDiarizationCatalogSource[]
}

export type SpeakerDiarizationCatalogPatch = {
  sourceFingerprint: string
  videoPath: string
  fileName: string
  speakerId: number
  name: string
  aliases?: string[]
}
