import { shell } from 'electron'

type ExternalUrlOpener = {
  openExternal: (url: string) => Promise<void>
}

export function isSupportedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

export async function openUrlInDefaultBrowser(url: string, opener: ExternalUrlOpener = shell): Promise<boolean> {
  if (!isSupportedExternalUrl(url)) return false

  try {
    await opener.openExternal(url)
    return true
  } catch {
    return false
  }
}
