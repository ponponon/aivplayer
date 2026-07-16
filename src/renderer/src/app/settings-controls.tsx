import { FolderOpen } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { SettingsNumberInput } from './settings-inputs'

export function formatPathLabel(pathValue: string | null, fallback: string): string {
  return pathValue && pathValue.length > 0 ? pathValue : fallback
}

export type SettingsFieldProps = {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
}

export function SettingsField({ title, description, children }: SettingsFieldProps): ReactElement {
  return (
    <div className="settings-field">
      <div className="settings-field-copy">
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </div>
      {children}
    </div>
  )
}

export type SettingsToggleProps = {
  title: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}

export function SettingsToggle({ title, description, checked, onChange }: SettingsToggleProps): ReactElement {
  return (
    <label className="setting-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span>
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  )
}

export type SettingsFolderPickerProps = {
  pathValue: string | null
  fallback: string
  selectLabel: ReactNode
  clearLabel?: ReactNode
  onPickFolder: () => Promise<string | null>
  onChange: (pathValue: string | null) => void
}

export function SettingsFolderPicker({
  pathValue,
  fallback,
  selectLabel,
  clearLabel,
  onPickFolder,
  onChange
}: SettingsFolderPickerProps): ReactElement {
  return (
    <div className="settings-inline-row">
      <div className="settings-path-value" title={pathValue ?? ''}>
        {formatPathLabel(pathValue, fallback)}
      </div>
      <button
        className="settings-secondary-button"
        type="button"
        onClick={async () => {
          const folderPath = await onPickFolder()
          if (folderPath) {
            onChange(folderPath)
          }
        }}
      >
        <FolderOpen size={14} />
        {selectLabel}
      </button>
      {clearLabel ? (
        <button className="settings-secondary-button" type="button" onClick={() => onChange(null)} disabled={!pathValue}>
          {clearLabel}
        </button>
      ) : null}
    </div>
  )
}

export type SettingsToggleValueRowProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  checkboxAriaLabel: string
  valueAriaLabel: string
  unit: ReactNode
}

export function SettingsToggleValueRow({
  checked,
  onCheckedChange,
  value,
  onValueChange,
  min,
  max,
  checkboxAriaLabel,
  valueAriaLabel,
  unit
}: SettingsToggleValueRowProps): ReactElement {
  return (
    <div className="settings-inline-row">
      <input
        className="settings-checkbox"
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
        aria-label={checkboxAriaLabel}
      />
      <SettingsNumberInput
        min={min}
        max={max}
        value={value}
        compact
        disabled={!checked}
        ariaLabel={valueAriaLabel}
        onChange={onValueChange}
      />
      <span className="settings-inline-unit">{unit}</span>
    </div>
  )
}

export type SettingsSelectOption<TValue extends string> = {
  value: TValue
  label: string
}

export type SettingsSelectProps<TValue extends string> = {
  value: TValue
  options: ReadonlyArray<SettingsSelectOption<TValue>>
  onChange: (value: TValue) => void
}

export function SettingsSelect<TValue extends string>({
  value,
  options,
  onChange
}: SettingsSelectProps<TValue>): ReactElement {
  return (
    <select className="settings-select" value={value} onChange={(event) => onChange(event.currentTarget.value as TValue)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
