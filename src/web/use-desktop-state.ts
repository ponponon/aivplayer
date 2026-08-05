import { useEffect, useState } from 'react'
import type { WebDesktopState } from '../shared/web-types'
import { readJson } from './web-ui'

type DesktopStateResponse = { state: WebDesktopState | null; allowRemoteControl: boolean }

export function useDesktopState(authenticated: boolean): { desktopState: WebDesktopState | null; allowRemoteControl: boolean } {
  const [desktopState, setDesktopState] = useState<WebDesktopState | null>(null)
  const [allowRemoteControl, setAllowRemoteControl] = useState(false)

  useEffect(() => {
    if (!authenticated) return
    let active = true
    const poll = (): void => {
      void readJson<DesktopStateResponse>('/api/v1/desktop/state').then((result) => {
        if (!active) return
        setDesktopState(result.state)
        setAllowRemoteControl(result.allowRemoteControl)
      }).catch(() => undefined)
    }
    poll()
    const timer = window.setInterval(poll, 1000)
    return () => { active = false; window.clearInterval(timer) }
  }, [authenticated])

  return { desktopState, allowRemoteControl }
}
