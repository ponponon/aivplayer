import type { ReactElement } from 'react'

export type SettingsNumberInputProps = {
  value: number
  min: number
  max: number
  step?: number
  compact?: boolean
  disabled?: boolean
  ariaLabel?: string
  onChange: (value: number) => void
}

export function SettingsNumberInput({
  value,
  min,
  max,
  step = 1,
  compact = false,
  disabled = false,
  ariaLabel,
  onChange
}: SettingsNumberInputProps): ReactElement {
  const settingsNumberClassName = compact ? 'settings-number settings-number-compact' : 'settings-number'

  return (
    <input
      className={settingsNumberClassName}
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => {
        const nextValue = Number(event.currentTarget.value)
        if (Number.isFinite(nextValue)) {
          onChange(nextValue)
        }
      }}
    />
  )
}

export type SettingsTextInputProps = {
  value: string
  type?: 'text' | 'password'
  placeholder?: string
  autoComplete?: string
  spellCheck?: boolean
  ariaLabel?: string
  onChange: (value: string) => void
}

export function SettingsTextInput({
  value,
  type = 'text',
  placeholder,
  autoComplete,
  spellCheck = false,
  ariaLabel,
  onChange
}: SettingsTextInputProps): ReactElement {
  return (
    <input
      className="settings-text"
      type={type}
      value={value}
      placeholder={placeholder}
      autoComplete={autoComplete}
      spellCheck={spellCheck}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  )
}

export type SettingsTextareaProps = {
  value: string
  placeholder?: string
  ariaLabel?: string
  rows?: number
  onChange: (value: string) => void
}

export function SettingsTextarea({ value, placeholder, ariaLabel, rows = 4, onChange }: SettingsTextareaProps): ReactElement {
  return (
    <textarea
      className="settings-textarea"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      rows={rows}
      spellCheck={false}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  )
}
