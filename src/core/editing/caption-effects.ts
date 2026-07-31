import type { EditingCaptionEffect } from '../../shared/editing-types'

export const EDITING_CAPTION_EFFECT_IDS: readonly EditingCaptionEffect[] = ['none', 'highlight', 'pill-karaoke', 'word-pop', 'kinetic-slam', 'editorial-emphasis']

export type EditingCaptionEffectDefinition = {
  id: EditingCaptionEffect
  summary: string
  forceSingleWord?: boolean
}

export const BUILTIN_EDITING_CAPTION_EFFECTS: readonly EditingCaptionEffectDefinition[] = [
  { id: 'none', summary: '保持整句字幕，不添加词级进场' },
  { id: 'highlight', summary: '当前词使用强调色高亮' },
  { id: 'pill-karaoke', summary: '当前词显示为圆角胶囊并跟随节奏' },
  { id: 'word-pop', summary: '每个词从小到大弹出' },
  { id: 'kinetic-slam', summary: '每个词独立冲入画面，适合重点句', forceSingleWord: true },
  { id: 'editorial-emphasis', summary: '当前词强调，其余文字保持克制' }
]

export function isEditingCaptionEffect(value: unknown): value is EditingCaptionEffect {
  return typeof value === 'string' && EDITING_CAPTION_EFFECT_IDS.includes(value as EditingCaptionEffect)
}

export function getEditingCaptionEffect(value: unknown): EditingCaptionEffect {
  return isEditingCaptionEffect(value) ? value : 'none'
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

export function easeOutBack(value: number): number {
  const x = clamp01(value)
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

export type EditingCaptionWordEffectState = {
  active: boolean
  progress: number
  scale: number
  opacity: number
  translateY: number
  rotate: number
}

/** Pure timing shared by the DOM preview and the ASS effect mapping. */
export function getEditingCaptionWordEffectState(effect: EditingCaptionEffect, startSeconds: number, endSeconds: number, currentTime: number): EditingCaptionWordEffectState {
  const safeEnd = Math.max(startSeconds + 0.01, endSeconds)
  const active = currentTime >= startSeconds && currentTime < safeEnd
  const progress = easeOutBack((currentTime - startSeconds) / 0.22)
  if (effect === 'word-pop') return { active, progress, scale: active ? 0.86 + progress * 0.14 : 1, opacity: active ? 1 : 0.92, translateY: active ? (1 - progress) * 5 : 0, rotate: 0 }
  if (effect === 'kinetic-slam') return { active, progress, scale: active ? 0.72 + progress * 0.28 : 1, opacity: active ? 1 : 0.76, translateY: active ? Math.max(0, (1 - progress) * 18) : 0, rotate: active ? (1 - progress) * -4 : 0 }
  return { active, progress: clamp01(progress), scale: 1, opacity: 1, translateY: 0, rotate: 0 }
}

export function getEditingCaptionEffectAssPrefix(effect: EditingCaptionEffect): string {
  if (effect === 'word-pop') return '{\\fscx86\\fscy86\\t(0,220,\\fscx100\\fscy100)}'
  if (effect === 'kinetic-slam') return '{\\fscx72\\fscy72\\t(0,220,\\fscx100\\fscy100)}'
  return ''
}
