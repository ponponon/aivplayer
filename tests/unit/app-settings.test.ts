import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createAppSettingsSectionPatcher,
  createDefaultAppSettings,
  updateAppSettingsSection
} from '../../src/shared/app-settings'
import { readAppSettings, readGpuAccelerationPreferenceSync, writeAppSettings } from '../../src/core/app-settings'
import { MANAGED_AI_PROVIDER_ID, createCustomAiProvider, createManagedAiProvider } from '../../src/shared/ai-providers'

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

  it('reads the GPU preference synchronously for pre-ready startup', async () => {
    expect(readGpuAccelerationPreferenceSync(tempDirectory)).toBe(true)

    const settings = createDefaultAppSettings()
    settings.playback.gpuAcceleration = false
    await writeAppSettings(tempDirectory, settings)
    expect(readGpuAccelerationPreferenceSync(tempDirectory)).toBe(false)

    await writeFile(join(tempDirectory, 'app-settings.json'), '{broken json')
    expect(readGpuAccelerationPreferenceSync(tempDirectory)).toBe(true)
  })

  it('persists and reloads app settings', async () => {
    const settings = createDefaultAppSettings()
    settings.ui.theme = 'light'
    settings.ui.defaultPanelMode = 'info'
    settings.ui.lastSettingsSectionId = 'subtitles'
    settings.ui.sidePanelWidth = 360
    settings.asr.preferredModelSourceId = 'huggingface'
    settings.ai.providers = [
      createManagedAiProvider(),
      { ...createCustomAiProvider('custom-1'), name: '自定义', baseUrl: 'https://example.test/v1/chat/completions', model: 'translation-model', apiKey: 'secret-key' }
    ]
    settings.ai.activeProviderId = 'custom-1'
    settings.tts.executablePath = '/usr/local/bin/custom-say'
    settings.tts.voice = 'Tingting'
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
    settings.vision.libraryDirectories = [join(tempDirectory, 'library-one'), join(tempDirectory, 'library-two')]
    settings.vision.speakerModelDirectory = join(tempDirectory, 'speaker-model')
    settings.vision.objectDetectionModelDirectory = join(tempDirectory, 'object-detection-model')
    settings.media.importInboxDirectories = [join(tempDirectory, 'inbox-one'), join(tempDirectory, 'inbox-two')]
    settings.media.importInboxWriteSidecars = false
    settings.playback.lastVolume = 0.42
    settings.playback.lastMuted = true
    settings.playback.lastPlaybackRate = 1.5
    settings.playback.endAction = 'stop'
    settings.playback.repeatMode = 'all'
    settings.playback.order = 'shuffle'
    settings.playback.profilesByFingerprint['media-fingerprint'] = { positionSeconds: 42, durationSeconds: 600, volume: 0.42, muted: true, playbackRate: 1.5, updatedAt: 123 }
    settings.playback.bookmarksByFingerprint['media-fingerprint'] = [{ id: 'bookmark-1', timeSeconds: 42, name: '重点', createdAt: 123 }]
    settings.playback.segmentsByFingerprint['media-fingerprint'] = [{ id: 'segment-1', startSeconds: 10, endSeconds: 30, name: '开场', color: 'cyan', createdAt: 123 }]
    settings.playback.structureCorrectionsByFingerprint['media-fingerprint'] = [{ segmentId: 'structure-black-0-2000', kind: 'black', startSeconds: 0, endSeconds: 2, action: 'ignore', updatedAt: 123 }]
    settings.playback.history = [{
      path: `${tempDirectory}/history.mp4`,
      name: 'history.mp4',
      extension: 'mp4',
      lastPlayedAt: 123,
      durationSeconds: 600
    }]

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
        locale: 'zh-CN',
        theme: 'dark',
        sidePanelWidth: 280,
        autoUpdate: true
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
            preferredModelSourceId: 'r2',
        defaultSubtitleLanguage: 'auto',
        autoLoadCachedSubtitles: true,
        translationGlossary: null
      }
    })
  })

  it('migrates legacy custom translation settings into a custom provider profile', async () => {
    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      JSON.stringify({
        schemaVersion: 29,
        asr: {
          translationServiceMode: 'custom',
          translationBaseUrl: 'https://example.test/v1/chat/completions',
          translationModel: 'custom-model',
          translationApiKey: 'custom-key',
          translationGlossary: 'Technology=技术'
        }
      })
    )

    const settings = await readAppSettings(tempDirectory)

    expect(settings.schemaVersion).toBe(30)
    expect(settings.ai.providers).toHaveLength(2)
    expect(settings.ai.providers[0]).toEqual({ id: MANAGED_AI_PROVIDER_ID, name: '', kind: 'managed', baseUrl: null, model: null, apiKey: null })
    const migrated = settings.ai.providers[1]
    expect(migrated.kind).toBe('custom')
    expect(migrated.baseUrl).toBe('https://example.test/v1/chat/completions')
    expect(migrated.model).toBe('custom-model')
    expect(migrated.apiKey).toBe('custom-key')
    expect(settings.ai.activeProviderId).toBe(migrated.id)
    expect(settings.asr.translationGlossary).toBe('Technology=技术')
  })

  it('decrypts a legacy encrypted custom translation key while migrating it into a provider profile', async () => {
    const secretCodec = {
      encryptString: (value: string) => Buffer.from(`cipher:${value}`, 'utf8').toString('base64'),
      decryptString: (value: string) => Buffer.from(value, 'base64').toString('utf8').replace(/^cipher:/, '')
    }
    const legacyEncrypted = `safe:${secretCodec.encryptString('legacy-custom-key')}`
    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      JSON.stringify({
        schemaVersion: 29,
        asr: {
          translationServiceMode: 'custom',
          translationBaseUrl: 'https://example.test/v1/chat/completions',
          translationModel: 'custom-model',
          translationApiKey: legacyEncrypted
        }
      })
    )

    const settings = await readAppSettings(tempDirectory, null, secretCodec)
    const migrated = settings.ai.providers.find((provider) => provider.kind === 'custom')

    expect(migrated?.apiKey).toBe('legacy-custom-key')

    const persisted = await writeAppSettings(tempDirectory, settings, null, secretCodec)
    const customAfterWrite = persisted.ai.providers.find((provider) => provider.kind === 'custom')
    expect(customAfterWrite?.apiKey).toBe('legacy-custom-key')

    const rawContent = await readFile(join(tempDirectory, 'app-settings.json'), 'utf8')
    expect(rawContent).toContain(`safe:${secretCodec.encryptString('legacy-custom-key')}`)
    expect(rawContent).not.toContain('safe:safe:')
  })

  it('migrates legacy managed translation settings and falls back for invalid active ids', async () => {
    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      JSON.stringify({
        schemaVersion: 29,
        asr: { translationServiceMode: 'managed' },
        ai: { activeProviderId: 'gone' }
      })
    )

    const settings = await readAppSettings(tempDirectory)

    expect(settings.ai.providers).toEqual([
      { id: MANAGED_AI_PROVIDER_ID, name: '', kind: 'managed', baseUrl: null, model: null, apiKey: null }
    ])
    expect(settings.ai.activeProviderId).toBe(MANAGED_AI_PROVIDER_ID)
  })

  it('activates the managed provider and ignores leftover custom fields when legacy mode is managed', async () => {
    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      JSON.stringify({
        schemaVersion: 29,
        asr: {
          translationServiceMode: 'managed',
          translationBaseUrl: 'https://stale.test/v1/chat/completions',
          translationModel: 'stale-model',
          translationApiKey: 'stale-key'
        }
      })
    )

    const settings = await readAppSettings(tempDirectory)

    expect(settings.ai.providers).toEqual([
      { id: MANAGED_AI_PROVIDER_ID, name: '', kind: 'managed', baseUrl: null, model: null, apiKey: null }
    ])
    expect(settings.ai.activeProviderId).toBe(MANAGED_AI_PROVIDER_ID)
  })

  it('forces managed provider secret fields back to null and keeps glossary untouched', async () => {
    await writeFile(
      join(tempDirectory, 'app-settings.json'),
      JSON.stringify({
        schemaVersion: 30,
        ai: {
          providers: [
            { id: MANAGED_AI_PROVIDER_ID, name: 'hack', kind: 'managed', baseUrl: 'https://evil.test', model: 'm', apiKey: 'k' },
            { id: MANAGED_AI_PROVIDER_ID, name: 'dup', kind: 'managed', baseUrl: null, model: null, apiKey: null }
          ],
          activeProviderId: MANAGED_AI_PROVIDER_ID
        },
        asr: { translationGlossary: 'AIVPlayer=AIV 播放器' }
      })
    )

    const settings = await readAppSettings(tempDirectory)

    expect(settings.ai.providers).toEqual([
      { id: MANAGED_AI_PROVIDER_ID, name: '', kind: 'managed', baseUrl: null, model: null, apiKey: null }
    ])
    expect(settings.asr.translationGlossary).toBe('AIVPlayer=AIV 播放器')
  })

  it('keeps the speaker model directory absolute and falls back for invalid values', async () => {
    const settings = createDefaultAppSettings()
    settings.vision.speakerModelDirectory = join(tempDirectory, 'speaker-model')
    await writeAppSettings(tempDirectory, settings)
    await expect(readAppSettings(tempDirectory)).resolves.toMatchObject({ vision: { speakerModelDirectory: settings.vision.speakerModelDirectory } })

    await writeFile(join(tempDirectory, 'app-settings.json'), JSON.stringify({ vision: { libraryDirectories: [], speakerModelDirectory: 'relative-model' } }))
    await expect(readAppSettings(tempDirectory)).resolves.toMatchObject({ vision: { libraryDirectories: [], speakerModelDirectory: null } })
  })

  it('keeps the object detection model directory absolute and falls back for invalid values', async () => {
    const settings = createDefaultAppSettings()
    settings.vision.objectDetectionModelDirectory = join(tempDirectory, 'object-detection-model')
    await writeAppSettings(tempDirectory, settings)
    await expect(readAppSettings(tempDirectory)).resolves.toMatchObject({ vision: { objectDetectionModelDirectory: settings.vision.objectDetectionModelDirectory } })

    await writeFile(join(tempDirectory, 'app-settings.json'), JSON.stringify({ vision: { libraryDirectories: [], objectDetectionModelDirectory: 'relative-model' } }))
    await expect(readAppSettings(tempDirectory)).resolves.toMatchObject({ vision: { libraryDirectories: [], objectDetectionModelDirectory: null } })
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
      schemaVersion: 30,
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
      targetLanguage: 'zh',
      presetId: 'clean',
      emphasisMode: 'words',
      keywords: ''
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
    settings.ai.providers = [
      createManagedAiProvider(),
      { ...createCustomAiProvider('custom-1'), name: '自定义', baseUrl: 'https://example.test/v1/chat/completions', model: 'translation-model', apiKey: 'secret-key' }
    ]
    settings.ai.activeProviderId = 'custom-1'
    settings.drama.apiBaseUrl = 'https://example.test/v1/chat/completions'
    settings.drama.model = 'drama-model'
    settings.drama.apiKey = 'drama-secret-key'
    settings.drama.media.image.providerId = 'fal'
    settings.drama.media.image.apiBaseUrl = 'https://example.test/image'
    settings.drama.media.image.model = 'image-model'
    settings.drama.media.image.apiKey = 'image-secret-key'
    settings.drama.media.image.costPerRequest = 0.04
    settings.capture.saveDirectoryPath = tempDirectory

    await writeAppSettings(tempDirectory, settings, tempDirectory, secretCodec)

    const rawContent = await readFile(join(tempDirectory, 'app-settings.json'), 'utf8')
    expect(rawContent).not.toContain('secret-key')
    expect(rawContent).not.toContain('drama-secret-key')
    expect(rawContent).not.toContain('image-secret-key')
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

  it('sanitizes playback history paths, ordering, duplicates, and size', async () => {
    const settings = createDefaultAppSettings()
    settings.playback.history = [
      { path: '/videos/older.mp4', name: 'older.mp4', extension: 'MP4', lastPlayedAt: 100, durationSeconds: 600 },
      { path: '/videos/newer.mkv', name: 'newer.mkv', extension: 'MKV', lastPlayedAt: 200, durationSeconds: 900 },
      { path: '/videos/older.mp4', name: 'duplicate.mp4', extension: 'mp4', lastPlayedAt: 300, durationSeconds: 700 },
      { path: 'relative.mp4', name: 'relative.mp4', extension: 'mp4', lastPlayedAt: 400, durationSeconds: 400 },
      { path: '/videos/invalid.mp4', name: 'invalid.mp4', extension: 'mp4', lastPlayedAt: 0, durationSeconds: 300 }
    ]

    const persisted = await writeAppSettings(tempDirectory, settings)

    expect(persisted.playback.history).toEqual([
      { path: '/videos/newer.mkv', name: 'newer.mkv', extension: 'mkv', lastPlayedAt: 200, durationSeconds: 900 },
      { path: '/videos/older.mp4', name: 'older.mp4', extension: 'mp4', lastPlayedAt: 100, durationSeconds: 600 }
    ])
    await expect(readAppSettings(tempDirectory)).resolves.toMatchObject({ playback: { history: persisted.playback.history } })
  })
})
