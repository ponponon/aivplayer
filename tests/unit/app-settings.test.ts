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
    settings.playback.rememberVolume = false
    settings.playback.lastVolume = 0.42
    settings.playback.lastMuted = true
    settings.playback.lastPlaybackRate = 1.5

    await writeAppSettings(tempDirectory, settings)

    await expect(readAppSettings(tempDirectory)).resolves.toEqual(settings)
  })

  it('falls back to defaults when the settings file is invalid', async () => {
    await writeFile(join(tempDirectory, 'app-settings.json'), '{broken json')

    await expect(readAppSettings(tempDirectory)).resolves.toEqual(createDefaultAppSettings())
  })
})

