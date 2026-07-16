import { AppProvider } from './app-context'
import { AppShell } from './app-shell'

export function App(): React.ReactElement {
  return <AppProvider><AppShell /></AppProvider>
}
