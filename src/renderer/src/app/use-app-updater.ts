import { useCallback, useEffect, useState } from 'react'
import { createInitialAppUpdateState, type AppUpdateState } from '../../../shared/app-update-types'

export function useAppUpdater(): {
  state: AppUpdateState
  check: () => Promise<AppUpdateState>
  install: () => Promise<void>
} {
  const [state, setState] = useState<AppUpdateState>(() => createInitialAppUpdateState())

  useEffect(() => {
    let active = true
    const removeStateListener = window.aiv.onAppUpdateStateChanged((nextState) => {
      if (active) setState(nextState)
    })
    void window.aiv.getAppUpdateState().then((nextState) => {
      if (active) setState(nextState)
    })
    return () => {
      active = false
      removeStateListener()
    }
  }, [])

  const check = useCallback((): Promise<AppUpdateState> => window.aiv.checkForAppUpdate(), [])
  const install = useCallback(async (): Promise<void> => {
    await window.aiv.installAppUpdate()
  }, [])

  return { state, check, install }
}
