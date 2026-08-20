import { useCallback, useEffect, useState } from 'react'
import { createInitialAppUpdateState, type AppUpdateState } from '../../../shared/app-update-types'

export function useAppUpdater(): {
  state: AppUpdateState
  check: () => Promise<AppUpdateState>
  download: () => Promise<AppUpdateState>
  install: () => Promise<void>
  dismiss: () => Promise<AppUpdateState>
  skip: (version: string) => Promise<AppUpdateState>
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
  const download = useCallback((): Promise<AppUpdateState> => window.aiv.downloadAppUpdate(), [])
  const install = useCallback(async (): Promise<void> => {
    await window.aiv.installAppUpdate()
  }, [])
  const dismiss = useCallback((): Promise<AppUpdateState> => window.aiv.dismissAppUpdate(), [])
  const skip = useCallback((version: string): Promise<AppUpdateState> => window.aiv.skipAppUpdate(version), [])

  return { state, check, download, install, dismiss, skip }
}
