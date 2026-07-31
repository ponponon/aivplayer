import type { SubtitleEmphasisMode, SubtitlePresetId } from '../../shared/subtitle-presets'
import type { EditingCaptionEffect, EditingGraphicPosition, EditingGraphicStyle } from '../../shared/editing-types'
import { getEditingCaptionEffect, isEditingCaptionEffect } from './caption-effects'
import { DEFAULT_EDITING_FRAME_ID, isEditingFrameId, type EditingFrameId } from './frames'

export const EDITING_THEME_LIMIT = 24
export type EditingThemePresetId = 'clean' | 'warm' | 'mint' | 'cinema' | 'gold'
export type EditingThemeSettings = { frameId: EditingFrameId; captionEffect: EditingCaptionEffect; subtitlePresetId: SubtitlePresetId; emphasisMode: SubtitleEmphasisMode; graphicStyle: EditingGraphicStyle; graphicPosition: EditingGraphicPosition }
export type EditingTheme = EditingThemeSettings & { id: string; name: string; createdAt: number; updatedAt: number }

export const BUILTIN_EDITING_THEMES: readonly (EditingThemeSettings & { id: EditingThemePresetId })[] = [
  { id: 'clean', frameId: 'clean', captionEffect: 'none', subtitlePresetId: 'clean', emphasisMode: 'none', graphicStyle: 'title', graphicPosition: 'center' },
  { id: 'warm', frameId: 'warm', captionEffect: 'word-pop', subtitlePresetId: 'yellow', emphasisMode: 'keywords', graphicStyle: 'label', graphicPosition: 'bottom-left' },
  { id: 'mint', frameId: 'mint', captionEffect: 'pill-karaoke', subtitlePresetId: 'mint', emphasisMode: 'words', graphicStyle: 'label', graphicPosition: 'bottom-right' },
  { id: 'cinema', frameId: 'cinema', captionEffect: 'editorial-emphasis', subtitlePresetId: 'navy', emphasisMode: 'none', graphicStyle: 'title', graphicPosition: 'top-right' },
  { id: 'gold', frameId: 'gold', captionEffect: 'kinetic-slam', subtitlePresetId: 'serif-gold', emphasisMode: 'words', graphicStyle: 'title', graphicPosition: 'center' }
]

function themeSignature(theme: EditingThemeSettings): string {
  return [theme.frameId, theme.captionEffect, theme.subtitlePresetId, theme.emphasisMode, theme.graphicStyle, theme.graphicPosition].join('|')
}

export function createEditingTheme(name: string, settings: EditingThemeSettings, now = Date.now()): EditingTheme {
  return { id: `theme-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name: name.trim().slice(0, 32), ...settings, createdAt: now, updatedAt: now }
}

export function upsertEditingTheme(themes: readonly EditingTheme[], theme: EditingTheme): EditingTheme[] {
  const existing = themes.find((candidate) => themeSignature(candidate) === themeSignature(theme))
  if (existing) return themes.map((candidate) => candidate.id === existing.id ? { ...candidate, name: theme.name, updatedAt: theme.updatedAt } : candidate)
  return [theme, ...themes].slice(0, EDITING_THEME_LIMIT)
}

export function removeEditingTheme(themes: readonly EditingTheme[], themeId: string): EditingTheme[] {
  return themes.filter((theme) => theme.id !== themeId)
}

export function normalizeEditingThemes(value: unknown): EditingTheme[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): EditingTheme[] => {
    if (!item || typeof item !== 'object') return []
    const theme = item as Partial<EditingTheme>
    if (typeof theme.id !== 'string' || typeof theme.name !== 'string' || !['clean', 'yellow', 'mint', 'navy', 'serif-gold'].includes(theme.subtitlePresetId ?? '') || !['none', 'keywords', 'words'].includes(theme.emphasisMode ?? '') || !['title', 'label'].includes(theme.graphicStyle ?? '') || !['center', 'top', 'top-left', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'].includes(theme.graphicPosition ?? '') || typeof theme.createdAt !== 'number' || typeof theme.updatedAt !== 'number') return []
    const frameId = isEditingFrameId(theme.frameId) ? theme.frameId : DEFAULT_EDITING_FRAME_ID
    const captionEffect = isEditingCaptionEffect(theme.captionEffect) ? theme.captionEffect : getEditingCaptionEffect(undefined)
    return [{ ...theme, frameId, captionEffect } as EditingTheme]
  }).slice(0, EDITING_THEME_LIMIT)
}
