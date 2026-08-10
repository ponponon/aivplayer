import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('speaker diarization settings UI', () => {
  it('uses the shared settings field and localizes every supported locale', () => {
    const projectRoot = process.cwd()
    const videoSource = readFileSync(join(projectRoot, 'src/renderer/src/app/settings-sections/video.tsx'), 'utf8')
    const settingsCss = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/settings-fields.css'), 'utf8')

    expect(videoSource).toContain('SpeakerDiarizationStatusField')
    expect(videoSource).toContain('SettingsField')
    expect(videoSource).toContain('getSpeakerDiarizationStatus')
    expect(videoSource).toContain('settings-speaker-diarization-refresh')
    expect(videoSource).toContain('SettingsFolderPicker')
    expect(videoSource).toContain('speakerModelDirectory')
    expect(settingsCss).toContain('.settings-speaker-status')
    expect(settingsCss).toContain('.settings-speaker-model-directory')
    expect(settingsCss).toContain('.settings-speaker-message.is-success')

    for (const locale of ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']) {
      const source = readFileSync(join(projectRoot, `src/shared/i18n/locales/${locale}.ts`), 'utf8')
      expect(source).toContain('speakerDiarization: {')
      expect(source).toContain('modelMissing:')
      expect(source).toContain('selectModelFolder:')
      expect(source).toContain('refreshing:')
    }
  })
})
