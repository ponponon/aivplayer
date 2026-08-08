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
}

type BaseLocaleCopy = Widen<typeof zhCN>

export type LocaleCopy = Omit<BaseLocaleCopy, 'editing'> & {
  editing: BaseLocaleCopy['editing'] & CaptionManifestCopy
}
