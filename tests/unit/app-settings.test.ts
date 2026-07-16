import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createAppSettingsSectionPatcher,
  createDefaultAppSettings,
  updateAppSettingsSection
} from '../../src/shared/app-settings'
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
    settings.asr.translationBaseUrl = 'https://example.test/v1/chat/completions'
    settings.asr.translationModel = 'translation-model'
    settings.asr.translationApiKey = 'secret-key'
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
    settings.subtitles.fontSizePx = 22
    settings.subtitles.lineHeight = 'relaxed'
    settings.subtitles.displayMode = 'bilingual'
    settings.subtitles.targetLanguage = 'zh'
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
        autoLoadCachedSubtitles: true,
        translationBaseUrl: null,
        translationModel: null,
        translationApiKey: null,
        translationGlossary: null
      }
    })
  })

  it('enables video surface gestures when upgrading legacy settings', async () => {
    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      `${JSON.stringify(
        {
          schemaVersion: 10,
          playback: {
            singleClickPause: false
          }
        },
        null,
        2
      )}\n`
    )

    await expect(readAppSettings(tempDirectory)).resolves.toMatchObject({
      schemaVersion: 12,
      playback: {
        singleClickPause: true
      }
    })
  })

  it('normalizes translation glossary entries before persisting them', async () => {
    const settings = createDefaultAppSettings()
    settings.asr.translationGlossary = ' Technology = 技术\n\ninvalid line\nAIVPlayer= AIV 播放器 '

    const persisted = await writeAppSettings(tempDirectory, settings)

    expect(persisted.asr.translationGlossary).toBe('Technology=技术\nAIVPlayer=AIV 播放器')
    await expect(readAppSettings(tempDirectory)).resolves.toMatchObject({
      asr: {
        translationGlossary: 'Technology=技术\nAIVPlayer=AIV 播放器'
      }
    })
  })

  it('sanitizes unsupported subtitle display settings', async () => {
    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          subtitles: {
            fontSizePx: 999,
            lineHeight: 'giant',
            displayMode: 'ghost',
            targetLanguage: 'not-a-language'
          }
        },
        null,
        2
      )}\n`
    )

    const settings = await readAppSettings(tempDirectory)

    expect(settings.subtitles).toEqual({
      fontSizePx: 28,
      lineHeight: 'normal',
      displayMode: 'source',
      targetLanguage: 'zh'
    })
  })

  it('sanitizes auto subtitle target language back to the translation default', async () => {
    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          subtitles: {
            fontSizePx: 18,
            lineHeight: 'normal',
            displayMode: 'translation',
            targetLanguage: 'auto'
          }
        },
        null,
        2
      )}\n`
    )

    await expect(readAppSettings(tempDirectory)).resolves.toMatchObject({
      subtitles: {
        fontSizePx: 18,
        lineHeight: 'normal',
        displayMode: 'translation',
        targetLanguage: 'zh'
      }
    })
  })

  it('clamps subtitle font size settings', async () => {
    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          subtitles: {
            fontSizePx: 11.4,
            lineHeight: 'compact',
            displayMode: 'translation',
            targetLanguage: 'en'
          }
        },
        null,
        2
      )}\n`
    )

    await expect(readAppSettings(tempDirectory)).resolves.toMatchObject({
      subtitles: {
        fontSizePx: 12,
        lineHeight: 'compact',
        displayMode: 'translation',
        targetLanguage: 'en'
      }
    })
  })

  it('encrypts and decrypts the translation API key when a secret codec is available', async () => {
    const secretCodec = {
      encryptString: (value: string) => Buffer.from(`cipher:${value}`, 'utf8').toString('base64'),
      decryptString: (value: string) => Buffer.from(value, 'base64').toString('utf8').replace(/^cipher:/, '')
    }

    const settings = createDefaultAppSettings()
    settings.asr.translationBaseUrl = 'https://example.test/v1/chat/completions'
    settings.asr.translationModel = 'translation-model'
    settings.asr.translationApiKey = 'secret-key'
    settings.capture.saveDirectoryPath = tempDirectory

    await writeAppSettings(tempDirectory, settings, tempDirectory, secretCodec)

    const rawContent = await readFile(join(tempDirectory, 'app-settings.json'), 'utf8')
    expect(rawContent).not.toContain('secret-key')
    expect(rawContent).toContain('safe:')

    await expect(readAppSettings(tempDirectory, tempDirectory, secretCodec)).resolves.toEqual(settings)
  })

  it.each([
    ['startup', 'general'],
    ['playback', 'interface'],
    ['asr', 'subtitles']
  ])('maps legacy settings section id %s to %s', async (legacySectionId, expectedSectionId) => {
    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          ui: {
            lastSettingsSectionId: legacySectionId
          }
        },
        null,
        2
      )}\n`
    )

    const settings = await readAppSettings(tempDirectory)
    expect(settings.ui.lastSettingsSectionId).toBe(expectedSectionId)
  })

  it('falls back to defaults when the settings file is invalid', async () => {
    await writeFile(join(tempDirectory, 'app-settings.json'), '{broken json')

    await expect(readAppSettings(tempDirectory)).resolves.toEqual(createDefaultAppSettings())
  })

  it('merges section patches without mutating unrelated sections', () => {
    const current = createDefaultAppSettings()
    const next = updateAppSettingsSection(current, 'ui', {
      defaultPanelMode: 'info'
    })

    expect(next).not.toBe(current)
    expect(next.ui.defaultPanelMode).toBe('info')
    expect(next.ui.locale).toBe(current.ui.locale)
    expect(next.media).toBe(current.media)
    expect(next.capture).toBe(current.capture)
    expect(next.playback).toBe(current.playback)
    expect(next.asr).toBe(current.asr)
  })

  it('supports updater callbacks for deep section merges', () => {
    const current = createDefaultAppSettings()
    current.playback.lastProgressByPath = {
      '/existing/video.mp4': 12
    }

    const next = updateAppSettingsSection(current, 'playback', (playback) => ({
      ...playback,
      lastProgressByPath: {
        ...playback.lastProgressByPath,
        '/new/video.mp4': 42
      }
    }))

    expect(next.playback.lastProgressByPath).toEqual({
      '/existing/video.mp4': 12,
      '/new/video.mp4': 42
    })
    expect(current.playback.lastProgressByPath).toEqual({
      '/existing/video.mp4': 12
    })
    expect(next.ui).toBe(current.ui)
    expect(next.media).toBe(current.media)
  })

  it('creates reusable section patchers from a generic change handler', () => {
    const updates: Array<(current: ReturnType<typeof createDefaultAppSettings>) => ReturnType<typeof createDefaultAppSettings>> = []
    const patch = createAppSettingsSectionPatcher((updater) => {
      updates.push(updater)
    })

    patch('capture', {
      gifFrameRate: 24
    })
    patch('playback', (playback) => ({
      ...playback,
      lastMuted: true
    }))

    const current = createDefaultAppSettings()
    const nextCapture = updates[0](current)
    const nextPlayback = updates[1](current)

    expect(nextCapture.capture.gifFrameRate).toBe(24)
    expect(nextCapture.ui).toBe(current.ui)
    expect(nextPlayback.playback.lastMuted).toBe(true)
    expect(nextPlayback.capture).toBe(current.capture)
  })

  it('sanitizes capture fallbacks and playback progress maps', async () => {
    const settings = createDefaultAppSettings()
    settings.capture.saveDirectoryPath = '/missing/capture-path'
    settings.playback.lastProgressByPath = {
      '/existing/video.mp4': 12,
      'relative/video.mp4': 18,
      '/existing/negative.mp4': -1
    }

    const expected = createDefaultAppSettings()
    expected.capture.saveDirectoryPath = tempDirectory
    expected.playback.lastProgressByPath = {
      '/existing/video.mp4': 12
    }

    await writeAppSettings(tempDirectory, settings, tempDirectory)

    await expect(readAppSettings(tempDirectory, tempDirectory)).resolves.toEqual(expected)
  })
})
