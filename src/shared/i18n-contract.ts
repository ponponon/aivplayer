import type { zhCN } from './i18n/locales/zh-CN'

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

export type LocaleCopy = Widen<typeof zhCN>
