import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultAppSettings } from '../../src/shared/app-settings'
import { readAppSettings, writeAppSettings } from '../../src/main/app-settings'

describe('app settings', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-app-settings-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('returns defaults when the settings file does not exist', async () => {
    await expect(readAppSettings(tempDirectory)).resolves.toEqual(createDefaultAppSettings())
  })

  it('persists and reloads app settings', async () => {
    const settings = createDefaultAppSettings()
    settings.ui.defaultPanelMode = 'info'
    settings.ui.lastSettingsSectionId = 'subtitles'
    settings.asr.preferredModelSourceId = 'huggingface'
    settings.capture.saveDirectoryPath = tempDirectory
    settings.capture.copyToClipboard = false
    settings.capture.imageFormat = 'png'
    settings.capture.fileNaming = 'timestamp'
    settings.capture.gifFrameRate = 12
    settings.capture.gifResolution = '720p'
    settings.capture.clipExportLengthSeconds = 60
    settings.capture.clipExportMode = 'burn-subtitle'
    settings.playback.rememberVolume = false
    settings.playback.autoHideControlDeck = false
    settings.playback.controlDeckAutoHideSeconds = 7
    settings.playback.showTotalPlaybackTime = true
    settings.playback.lastVolume = 0.42
    settings.playback.lastMuted = true
    settings.playback.lastPlaybackRate = 1.5

    await writeAppSettings(tempDirectory, settings)

    await expect(readAppSettings(tempDirectory)).resolves.toEqual(settings)
  })

  it('sanitizes unsupported asr and ui settings', async () => {
    const settings = createDefaultAppSettings()
    settings.ui.defaultPanelMode = 'info'
    settings.playback.rememberVolume = false
    settings.playback.lastVolume = 0.42
    settings.playback.lastMuted = true
    settings.playback.lastPlaybackRate = 1.5

    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          ui: {
            defaultPanelMode: 'info'
          },
          playback: {
            rememberVolume: settings.playback.rememberVolume,
            lastVolume: settings.playback.lastVolume,
            lastMuted: settings.playback.lastMuted,
            lastPlaybackRate: settings.playback.lastPlaybackRate
          },
          asr: {
            preferredModelSourceId: 'not-a-source'
          }
        },
        null,
        2
      )}\n`
    )

    await expect(readAppSettings(tempDirectory)).resolves.toEqual({
      ...settings,
      ui: {
        defaultPanelMode: 'info',
        lastSettingsSectionId: 'general',
        locale: 'zh-CN'
      },
      capture: {
        saveDirectoryPath: null,
        copyToClipboard: true,
        imageFormat: 'jpg',
        fileNaming: 'sequential',
        gifFrameRate: 10,
        gifResolution: '360p',
        clipExportLengthSeconds: 30,
        clipExportMode: 'video'
      },
      asr: {
        preferredModelSourceId: 'modelscope',
        defaultSubtitleLanguage: 'auto',
        autoLoadCachedSubtitles: true
      }
    })
  })

  it('falls back to defaults when the settings file is invalid', async () => {
    await writeFile(join(tempDirectory, 'app-settings.json'), '{broken json')

    await expect(readAppSettings(tempDirectory)).resolves.toEqual(createDefaultAppSettings())
  })
})
