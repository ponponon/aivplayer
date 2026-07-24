import { app, Menu } from 'electron'
import { readAppSettings, writeAppSettings } from '../core/app-settings'
import { APP_NAME, createApplicationMenuTemplate } from './app-menu'
import { getAppCopy } from '../shared/i18n'
import type { AppLocale } from '../shared/localization'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { desktopState } from './desktop-state'
import { promptForMediaFiles } from './media-dialogs'

export function getCurrentLocale(): AppLocale {
  return desktopState.currentAppSettings.ui.locale
}

export async function loadAppSettings(): Promise<void> {
  desktopState.currentAppSettings = await readAppSettings(app.getPath('userData'), app.getPath('videos'))
}

export async function saveAppSettings(settings: Parameters<typeof writeAppSettings>[1]): Promise<typeof desktopState.currentAppSettings> {
  desktopState.currentAppSettings = await writeAppSettings(app.getPath('userData'), settings, app.getPath('videos'))
  installApplicationMenu()
  return desktopState.currentAppSettings
}

export function installApplicationMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(createApplicationMenuTemplate(process.platform, getCurrentLocale(), {
    openFiles: () => { void promptForMediaFiles().then((files) => { if (files.length > 0) desktopState.mainWindow?.webContents.send(IPC_CHANNELS.MEDIA_FILES_OPENED, files) }) },
    openSettings: () => { desktopState.mainWindow?.webContents.send(IPC_CHANNELS.APP_MENU_OPEN_SETTINGS) }
  })))
}

export function getSettingsCopy(): ReturnType<typeof getAppCopy> {
  return getAppCopy(getCurrentLocale())
}

export { APP_NAME }
