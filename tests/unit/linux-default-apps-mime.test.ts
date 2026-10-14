import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// js-yaml 未附带类型声明，通过 createRequire 加载以避免 TS7016。
const require = createRequire(import.meta.url)
const { load } = require('js-yaml') as { load: (source: string) => unknown }

const projectRoot = process.cwd()

// GNOME 设置的“默认应用”下拉不是按 video/mp4 等通用类型查应用，而是按单个代表 mime
// 查询候选列表（gnome-control-center panels/applications/cc-default-apps-page.blp：
// video_row 用 video/x-ogm+ogg，photos_row 用 image/jpeg，music_row 用 audio/x-vorbis+ogg）。
// 打包声明的 MimeType 若不含对应代表 mime，应用就不会出现在该下拉里。
const GNOME_VIDEO_REPRESENTATIVE_MIME = 'video/x-ogm+ogg'

function readBuilderFileAssociations(): Array<{ ext?: string; mimeType?: string }> {
  const config = load(readFileSync(join(projectRoot, 'electron-builder.yml'), 'utf8')) as {
    fileAssociations?: Array<{ ext?: string; mimeType?: string }>
  }
  return config.fileAssociations ?? []
}

function readFlatpakMimeTypeLine(): string {
  const desktop = readFileSync(join(projectRoot, 'flatpak/cn.quniv.aivplayer.desktop'), 'utf8')
  const line = desktop.split('\n').find((entry) => entry.startsWith('MimeType='))
  if (!line) {
    throw new Error('flatpak/cn.quniv.aivplayer.desktop 缺少 MimeType 行')
  }
  return line
}

describe('Linux desktop MIME associations', () => {
  it('declares the representative MIME GNOME Settings uses for the Video row', () => {
    const associations = readBuilderFileAssociations()

    expect(associations.map((entry) => entry.mimeType)).toContain(GNOME_VIDEO_REPRESENTATIVE_MIME)
    expect(associations.map((entry) => entry.ext)).toContain('ogm')
  })

  it('keeps the flatpak desktop entry in sync with the Video row MIME', () => {
    expect(readFlatpakMimeTypeLine()).toContain(GNOME_VIDEO_REPRESENTATIVE_MIME)
  })
})
