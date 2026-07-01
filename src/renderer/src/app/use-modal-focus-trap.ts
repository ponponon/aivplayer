import { useLayoutEffect, useRef, type RefObject } from 'react'

const focusableSelector = [
  'button:not([disabled]):not([tabindex="-1"])',
  '[href]:not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    return element.getClientRects().length > 0
  })
}

function focusElement(element: HTMLElement): void {
  element.focus({ preventScroll: true })
}

export function useModalFocusTrap(
  enabled: boolean,
  containerRef: RefObject<HTMLElement | null>,
  initialFocusSelector?: string
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const frameRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (!enabled) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusInitial = (): void => {
      if (!container.isConnected) {
        return
      }

      const explicitTarget = initialFocusSelector
        ? container.querySelector<HTMLElement>(initialFocusSelector)
        : null
      const fallbackTarget = getFocusableElements(container)[0] ?? container
      focusElement(explicitTarget ?? fallbackTarget)
    }

    frameRef.current = window.requestAnimationFrame(focusInitial)

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') {
        return
      }

      const focusables = getFocusableElements(container)
      const activeElement = document.activeElement

      if (focusables.length === 0) {
        event.preventDefault()
        focusElement(container)
        return
      }

      const firstFocusable = focusables[0]
      const lastFocusable = focusables[focusables.length - 1]

      if (!activeElement || !(activeElement instanceof HTMLElement) || !container.contains(activeElement)) {
        event.preventDefault()
        focusElement(event.shiftKey ? lastFocusable : firstFocusable)
        return
      }

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault()
        focusElement(lastFocusable)
        return
      }

      if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault()
        focusElement(firstFocusable)
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)

      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }

      const previousFocus = previousFocusRef.current
      previousFocusRef.current = null

      if (previousFocus && previousFocus.isConnected && !container.contains(previousFocus)) {
        focusElement(previousFocus)
      }
    }
  }, [containerRef, enabled, initialFocusSelector])
}
