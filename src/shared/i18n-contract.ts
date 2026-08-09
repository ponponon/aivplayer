import type { zhCN } from './i18n/locales/zh-CN.ts'

type Widen<T> = T extends (...args: infer Args) => infer Return
  ? (...args: Args) => Return
  : T extends string
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T extends Record<string, unknown>
          ? { [Key in keyof T]: Widen<T[Key]> }
          : T

type CaptionManifestCopy = {
  rebuildCaptionManifest: string
  rebuildingCaptionManifest: string
  captionManifestRebuilt: string
  captionManifestRebuildFailed: string
  projectOverwriteTitle: string
  projectOverwriteDescription: (path: string) => string
  projectOverwriteConfirm: string
  projectOverwriteCancel: string
  projectRepairSummary: (relinked: number, unresolved: number, ambiguous: number) => string
  projectRepairMapped: (source: string, path: string) => string
  projectRepairUnresolved: (source: string) => string
  projectRepairAmbiguous: (source: string, paths: readonly string[]) => string
  projectRepairSidecarReset: (count: number) => string
  projectRepairFailed: string
  proposalTitle: string
  proposalDescription: string
  proposalDuration: string
  proposalRemovedRanges: string
  proposalAffectedSegments: string
  proposalAffectedCaptions: string
  proposalSourceRangeUnit: string
  proposalSegmentUnit: string
  proposalCaptionUnit: string
  proposalDeleteTitle: string
  proposalRetainedTitle: string
  proposalSourceTime: string
  proposalSegmentTitle: string
  proposalDeleteAfterConfirm: string
  proposalRevisionLabel: string
  proposalConfirm: string
  proposalCancel: string
}

type BaseLocaleCopy = Widen<typeof zhCN>

export type LocaleCopy = Omit<BaseLocaleCopy, 'editing'> & {
  editing: BaseLocaleCopy['editing'] & CaptionManifestCopy
}
