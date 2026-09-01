import { Check, ChevronDown } from 'lucide-react'
import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type AppSelectOptionElementProps = {
  value?: string | number
  children?: ReactNode
  disabled?: boolean
}

type AppSelectOption = {
  key: string
  value: string
  label: ReactNode
  disabled: boolean
}

export type AppSelectValue = string | number | ReadonlyArray<string | number>

export type AppSelectChangeTarget = {
  value: string
  selectedOptions: ReadonlyArray<{ value: string }>
}

export type AppSelectChangeEvent = {
  currentTarget: AppSelectChangeTarget
  target: AppSelectChangeTarget
}

export type AppSelectProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'defaultValue' | 'onChange' | 'type' | 'value' | 'role' | 'aria-controls' | 'aria-expanded' | 'aria-haspopup'> & {
  children: ReactNode
  value?: AppSelectValue
  defaultValue?: AppSelectValue
  onChange?: (event: AppSelectChangeEvent) => void
  multiple?: boolean
  size?: number
}

function normalizeValues(value: AppSelectValue | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (value == null) return []
  return [String(value)]
}

function readOptions(children: ReactNode): AppSelectOption[] {
  return Children.toArray(children).flatMap((child, index) => {
    if (!isValidElement<AppSelectOptionElementProps>(child)) return []

    const value = child.props.value == null ? '' : String(child.props.value)
    return [{
      key: String(child.key ?? `${value}-${index}`),
      value,
      label: child.props.children,
      disabled: child.props.disabled === true
    }]
  })
}

function findEnabledIndex(options: AppSelectOption[], start: number, direction: 1 | -1 = 1): number {
  if (options.length === 0) return -1

  let index = Math.min(Math.max(start, 0), options.length - 1)
  for (let attempts = 0; attempts < options.length; attempts += 1) {
    if (!options[index]?.disabled) return index
    index = (index + direction + options.length) % options.length
  }

  return -1
}

function toChangeTarget(values: string[]): AppSelectChangeTarget {
  const selectedOptions = values.map((value) => ({ value }))
  return {
    value: values[0] ?? '',
    selectedOptions
  }
}

export function AppSelect({
  children,
  value,
  defaultValue,
  onChange,
  multiple = false,
  size,
  className,
  disabled = false,
  ...buttonProps
}: AppSelectProps): ReactElement {
  const options = useMemo(() => readOptions(children), [children])
  const [uncontrolledValues, setUncontrolledValues] = useState<string[]>(() => normalizeValues(defaultValue))
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectId = useId().replace(/:/gu, '')
  const menuId = `${selectId}-menu`
  const currentValues = value === undefined
    ? (uncontrolledValues.length > 0 || multiple ? uncontrolledValues : options[0] ? [options[0].value] : [])
    : normalizeValues(value)
  const selectedValues = new Set(currentValues)
  const selectedOptions = options.filter((option) => selectedValues.has(option.value))
  const selectedIndex = findEnabledIndex(options, Math.max(0, options.findIndex((option) => selectedValues.has(option.value))))
  const selectedOption = selectedOptions[0] ?? options[selectedIndex] ?? null
  const triggerClassName = ['app-select', className].filter(Boolean).join(' ')

  const focusTrigger = (): void => {
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const closeMenu = (restoreFocus = false): void => {
    setIsOpen(false)
    setMenuStyle(null)
    if (restoreFocus) focusTrigger()
  }

  const openMenu = (index = selectedIndex >= 0 ? selectedIndex : 0): void => {
    const nextIndex = findEnabledIndex(options, index)
    setHighlightedIndex(nextIndex >= 0 ? nextIndex : 0)
    setIsOpen(true)
  }

  const emitChange = (nextValues: string[]): void => {
    if (value === undefined) setUncontrolledValues(nextValues)
    const target = toChangeTarget(nextValues)
    onChange?.({ currentTarget: target, target })
  }

  const selectOption = (option: AppSelectOption): void => {
    if (option.disabled) return

    if (multiple) {
      const nextSet = new Set(currentValues)
      if (nextSet.has(option.value)) nextSet.delete(option.value)
      else nextSet.add(option.value)
      const nextValues = options.filter((item) => nextSet.has(item.value)).map((item) => item.value)
      emitChange(nextValues)
      return
    }

    emitChange([option.value])
    closeMenu(true)
  }

  const moveHighlight = (direction: 1 | -1): void => {
    const nextIndex = findEnabledIndex(options, highlightedIndex + direction, direction)
    if (nextIndex < 0) return
    setHighlightedIndex(nextIndex)
    requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus())
  }

  useEffect(() => {
    if (!isOpen) return

    const focusFrame = requestAnimationFrame(() => optionRefs.current[highlightedIndex]?.focus())
    const updatePosition = (): void => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return

      const triggerRect = trigger.getBoundingClientRect()
      const menuRect = menu.getBoundingClientRect()
      const viewportPadding = 8
      const gap = 6
      const width = triggerRect.width
      const left = Math.max(viewportPadding, Math.min(triggerRect.left, window.innerWidth - width - viewportPadding))
      const fitsBelow = triggerRect.bottom + gap + menuRect.height <= window.innerHeight - viewportPadding
      const fitsAbove = triggerRect.top - gap - menuRect.height >= viewportPadding
      const top = fitsBelow || !fitsAbove
        ? Math.min(window.innerHeight - menuRect.height - viewportPadding, triggerRect.bottom + gap)
        : triggerRect.top - menuRect.height - gap

      setMenuStyle({
        position: 'fixed',
        top: Math.max(viewportPadding, top),
        left,
        width,
        visibility: 'visible'
      })
    }

    const positionFrame = requestAnimationFrame(() => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      setMenuStyle({ position: 'fixed', top: rect.bottom + 6, left: rect.left, width: rect.width, visibility: 'hidden' })
      requestAnimationFrame(updatePosition)
    })

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      cancelAnimationFrame(focusFrame)
      cancelAnimationFrame(positionFrame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [highlightedIndex, isOpen, options.length])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      closeMenu()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu(event.key === 'ArrowDown' ? selectedIndex : selectedIndex < 0 ? options.length - 1 : selectedIndex)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (isOpen) closeMenu()
      else openMenu()
      return
    }
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
    }
  }

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, option: AppSelectOption): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveHighlight(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveHighlight(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      const firstIndex = findEnabledIndex(options, 0)
      if (firstIndex >= 0) {
        setHighlightedIndex(firstIndex)
        optionRefs.current[firstIndex]?.focus()
      }
    } else if (event.key === 'End') {
      event.preventDefault()
      const lastIndex = findEnabledIndex(options, options.length - 1, -1)
      if (lastIndex >= 0) {
        setHighlightedIndex(lastIndex)
        optionRefs.current[lastIndex]?.focus()
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectOption(option)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
    } else if (event.key === 'Tab') {
      closeMenu()
    }
  }

  const triggerLabel = selectedOptions.length > 0
    ? selectedOptions
    : selectedOption
      ? [selectedOption]
      : []

  return (
    <>
      <button
        {...buttonProps}
        ref={triggerRef}
        className={triggerClassName}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        data-select-value={currentValues.join(',')}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="app-select-value">
          {triggerLabel.length > 0
            ? triggerLabel.map((option, index) => <span key={option.key}>{index > 0 ? '、' : null}{option.label}</span>)
            : '—'}
        </span>
        <ChevronDown className="app-select-chevron" size={14} aria-hidden="true" />
      </button>
      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              className="app-select-menu"
              id={menuId}
              role="listbox"
              aria-multiselectable={multiple || undefined}
              style={menuStyle ?? { position: 'fixed', visibility: 'hidden' }}
              data-select-size={size}
            >
              {options.map((option, index) => {
                const isSelected = selectedValues.has(option.value)
                const isHighlighted = highlightedIndex === index
                return (
                  <button
                    className={`app-select-option${isHighlighted ? ' is-highlighted' : ''}${isSelected ? ' is-selected' : ''}`}
                    key={option.key}
                    ref={(element) => { optionRefs.current[index] = element }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    disabled={option.disabled}
                    data-value={option.value}
                    onFocus={() => setHighlightedIndex(index)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectOption(option)}
                    onKeyDown={(event) => handleOptionKeyDown(event, option)}
                  >
                    <span className="app-select-option-label">{option.label}</span>
                    <Check className="app-select-option-check" size={14} aria-hidden="true" />
                  </button>
                )
              })}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
