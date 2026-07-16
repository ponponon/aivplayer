import { createContext, useContext, type PropsWithChildren } from 'react'
import { useAppController } from './use-app-controller'

export type AppController = ReturnType<typeof useAppController>
const AppContext = createContext<AppController | null>(null)

export function AppProvider({ children }: PropsWithChildren): React.ReactElement {
  const controller = useAppController()
  return <AppContext.Provider value={controller}>{children}</AppContext.Provider>
}

export function useAppContext(): AppController {
  const context = useContext(AppContext)
  if (!context) throw new Error('App context is unavailable')
  return context
}
