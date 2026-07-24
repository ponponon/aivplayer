import { describe, expect, it, vi } from 'vitest'
import { APP_NAME, createApplicationMenuTemplate } from '../../src/desktop/app-menu'

describe('application menu', () => {
  it('uses AIVPlayer as the macOS app menu label', () => {
    const template = createApplicationMenuTemplate('darwin')

    expect(APP_NAME).toBe('AIVPlayer')
    expect(template[0]?.label).toBe('AIVPlayer')
  })

  it.each([
    ['zh-CN', '关于 AIVPlayer', '文件', '编辑', '显示', '窗口'],
    ['en-US', 'About AIVPlayer', 'File', 'Edit', 'View', 'Window'],
    ['ja-JP', 'AIVPlayer について', 'ファイル', '編集', '表示', 'ウインドウ'],
    ['ko-KR', 'AIVPlayer 정보', '파일', '편집', '보기', '윈도우']
  ] as const)('localizes the macOS menu for %s', (locale, about, file, edit, view, window) => {
    const template = createApplicationMenuTemplate('darwin', locale)
    const appSubmenu = template[0]?.submenu

    if (!Array.isArray(appSubmenu)) {
      throw new Error('expected application submenu')
    }

    expect(appSubmenu[0]).toMatchObject({ label: about })
    expect(template.map((item) => item.label)).toEqual(['AIVPlayer', file, edit, view, window])
  })

  it('connects application menu actions to the main process', () => {
    const openFiles = vi.fn()
    const openSettings = vi.fn()
    const template = createApplicationMenuTemplate('darwin', 'en-US', { openFiles, openSettings })
    const appSubmenu = template[0]?.submenu
    const fileSubmenu = template[1]?.submenu

    if (!Array.isArray(appSubmenu) || !Array.isArray(fileSubmenu)) {
      throw new Error('expected application and file submenus')
    }

    appSubmenu[1]?.click?.({} as never, {} as never, {} as never)
    fileSubmenu[0]?.click?.({} as never, {} as never, {} as never)

    expect(openSettings).toHaveBeenCalledOnce()
    expect(openFiles).toHaveBeenCalledOnce()
  })
})
