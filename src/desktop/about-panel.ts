import { APP_RELEASE_DATE } from '../shared/app-release'
import { APP_NAME } from './app-menu'

type AboutPanelCopy = {
  releaseDateLabel: string
}

export function createAboutPanelOptions(copy: AboutPanelCopy, releaseDate = APP_RELEASE_DATE): {
  applicationName: string
  copyright: string
} {
  return {
    applicationName: APP_NAME,
    copyright: `${copy.releaseDateLabel} ${releaseDate}\nCopyright © 2026 ponponon`
  }
}
