import { existsSync } from 'node:fs'
import { shell } from 'electron'

type PathOpener = {
  openPath: (filePath: string) => Promise<string>
}

export async function openPathInDefaultApp(filePath: string, opener: PathOpener = shell): Promise<boolean> {
  if (!filePath || !existsSync(filePath)) {
    return false
  }

  return (await opener.openPath(filePath)) === ''
}
