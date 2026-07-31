import { Palette } from 'lucide-react'
import { useState } from 'react'
import { getEditingFrame } from '../../../core/editing/frames'
import { BUILTIN_EDITING_THEMES, type EditingTheme, type EditingThemePresetId, type EditingThemeSettings } from '../../../core/editing/themes'

type Props = {
  title: string
  presetLabel: string
  presetNames: Record<EditingThemePresetId, string>
  savedLabel: string
  searchPlaceholder: string
  namePlaceholder: string
  saveLabel: string
  emptyLabel: string
  deleteLabel: string
  current: EditingThemeSettings
  savedThemes: readonly EditingTheme[]
  onApply: (settings: EditingThemeSettings) => void
  onSave: (name: string, settings: EditingThemeSettings) => void
  onDelete: (themeId: string) => void
}

function isSameTheme(left: EditingThemeSettings, right: EditingThemeSettings): boolean {
  return left.frameId === right.frameId && left.captionEffect === right.captionEffect && left.subtitlePresetId === right.subtitlePresetId && left.emphasisMode === right.emphasisMode && left.graphicStyle === right.graphicStyle && left.graphicPosition === right.graphicPosition
}

export function EditingThemeControl({ title, presetLabel, presetNames, savedLabel, searchPlaceholder, namePlaceholder, saveLabel, emptyLabel, deleteLabel, current, savedThemes, onApply, onSave, onDelete }: Props): React.ReactElement {
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleThemes = savedThemes.filter((theme) => !normalizedQuery || `${theme.name} ${theme.subtitlePresetId}`.toLocaleLowerCase().includes(normalizedQuery))
  const saveCurrent = (): void => {
    if (!name.trim()) return
    onSave(name, current)
    setName('')
  }
  return <details className="editing-theme-control" data-testid="editing-theme-control" onClick={(event) => event.stopPropagation()}>
    <summary className="editing-theme-summary"><Palette size={14} aria-hidden="true" /><span>{title}</span></summary>
    <div className="editing-theme-popover">
      <div className="editing-theme-section"><strong>{presetLabel}</strong><div className="editing-theme-preset-list">
        {BUILTIN_EDITING_THEMES.map((theme) => <button key={theme.id} className={`editing-theme-preset ${isSameTheme(current, theme) ? 'is-active' : ''}`} type="button" title={getEditingFrame(theme.frameId).summary} onClick={() => onApply(theme)} aria-pressed={isSameTheme(current, theme)} data-testid={`editing-theme-${theme.id}`}><span className={`editing-theme-preview is-${theme.frameId}`} data-testid={`editing-frame-preview-${theme.frameId}`}><i /><b /></span><span>{presetNames[theme.id]}</span></button>)}
      </div></div>
      <div className="editing-theme-section"><div className="editing-theme-heading"><strong>{savedLabel}</strong><small>{savedThemes.length}</small></div>
        {savedThemes.length > 0 ? <input className="editing-theme-search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} data-testid="editing-theme-search" /> : null}
        <div className="editing-theme-saved-list">{visibleThemes.map((theme) => <div className="editing-theme-saved-item" key={theme.id}><button className={`editing-theme-saved ${isSameTheme(current, theme) ? 'is-active' : ''}`} type="button" onClick={() => onApply(theme)} aria-pressed={isSameTheme(current, theme)} data-testid={`editing-theme-saved-${theme.id}`}>{theme.name}</button><button className="editing-theme-delete" type="button" onClick={() => onDelete(theme.id)} title={deleteLabel} aria-label={`${deleteLabel}: ${theme.name}`}>×</button></div>)}{savedThemes.length > 0 && visibleThemes.length === 0 ? <small className="editing-theme-empty">{emptyLabel}</small> : null}</div>
      </div>
      <div className="editing-theme-save"><input value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder={namePlaceholder} aria-label={namePlaceholder} data-testid="editing-theme-name" /><button type="button" onClick={saveCurrent} disabled={!name.trim()} data-testid="editing-theme-save">{saveLabel}</button></div>
    </div>
  </details>
}
