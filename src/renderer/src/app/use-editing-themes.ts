import { useCallback, useState } from 'react'
import type { EditingTheme, EditingThemeSettings } from '../../../core/editing/themes'
import { createEditingTheme, normalizeEditingThemes, removeEditingTheme, upsertEditingTheme } from '../../../core/editing/themes'

const STORAGE_KEY = 'aivplayer.editing-themes.v1'

function readThemes(): EditingTheme[] {
  if (typeof window === 'undefined') return []
  try { return normalizeEditingThemes(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')) } catch { return [] }
}

function writeThemes(themes: readonly EditingTheme[]): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(themes)) } catch { /* Storage can be unavailable. */ }
}

export function useEditingThemes(): { themes: readonly EditingTheme[]; saveTheme: (name: string, settings: EditingThemeSettings) => void; deleteTheme: (themeId: string) => void } {
  const [themes, setThemes] = useState<EditingTheme[]>(readThemes)
  const saveTheme = useCallback((name: string, settings: EditingThemeSettings): void => {
    if (!name.trim()) return
    setThemes((current) => { const next = upsertEditingTheme(current, createEditingTheme(name, settings)); writeThemes(next); return next })
  }, [])
  const deleteTheme = useCallback((themeId: string): void => {
    setThemes((current) => { const next = removeEditingTheme(current, themeId); writeThemes(next); return next })
  }, [])
  return { themes, saveTheme, deleteTheme }
}
