import type { MenuItemConstructorOptions } from 'electron'
import { DEFAULT_APP_LOCALE, type AppLocale } from '../shared/localization'
import { getAppCopy } from '../shared/i18n'

export const APP_NAME = 'AIVPlayer'

export type ApplicationMenuActions = {
  openFiles?: () => void
  openSettings?: () => void
}

export function createApplicationMenuTemplate(
  platform: NodeJS.Platform = process.platform,
  locale: AppLocale = DEFAULT_APP_LOCALE,
  actions: ApplicationMenuActions = {}
): MenuItemConstructorOptions[] {
  const isMac = platform === 'darwin'
  const menu = getAppCopy(locale).menu
  const fileMenu: MenuItemConstructorOptions = {
    label: menu.file,
    submenu: [
      { label: menu.openFiles, accelerator: 'CommandOrControl+O', click: actions.openFiles },
      { type: 'separator' },
      isMac ? { role: 'close', label: menu.close } : { role: 'quit', label: menu.quit }
    ]
  }
  const editMenu: MenuItemConstructorOptions = {
    label: menu.edit,
    submenu: [
      { role: 'undo', label: menu.undo },
      { role: 'redo', label: menu.redo },
      { type: 'separator' },
      { role: 'cut', label: menu.cut },
      { role: 'copy', label: menu.copy },
      { role: 'paste', label: menu.paste },
      { role: 'selectAll', label: menu.selectAll }
    ]
  }
  const viewMenu: MenuItemConstructorOptions = {
    label: menu.view,
    submenu: [
      { role: 'reload', label: menu.reload },
      { role: 'forceReload', label: menu.forceReload },
      { role: 'toggleDevTools', label: menu.toggleDevTools },
      { type: 'separator' },
      { role: 'resetZoom', label: menu.resetZoom },
      { role: 'zoomIn', label: menu.zoomIn },
      { role: 'zoomOut', label: menu.zoomOut },
      { type: 'separator' },
      { role: 'togglefullscreen', label: menu.toggleFullscreen }
    ]
  }
  const windowMenu: MenuItemConstructorOptions = {
    label: menu.window,
    submenu: isMac
      ? [
          { role: 'minimize', label: menu.minimize },
          { role: 'zoom', label: menu.zoom },
          { type: 'separator' },
          { role: 'front', label: menu.front }
        ]
      : [{ role: 'minimize', label: menu.minimize }, { role: 'close', label: menu.close }]
  }

  if (!isMac) {
    return [fileMenu, editMenu, viewMenu, windowMenu]
  }

  return [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: menu.about },
        { label: menu.settings, accelerator: 'CommandOrControl+,', click: actions.openSettings },
        { type: 'separator' },
        { role: 'services', label: menu.services },
        { type: 'separator' },
        { role: 'hide', label: menu.hide },
        { role: 'hideOthers', label: menu.hideOthers },
        { role: 'unhide', label: menu.showAll },
        { type: 'separator' },
        { role: 'quit', label: menu.quit }
      ]
    },
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu
  ]
}
