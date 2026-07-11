import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('dialog smoke source constraints', () => {
  it('exposes the clip export and media details smoke scripts from package scripts', () => {
    const packageJson = JSON.parse(readSource('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['smoke:clip-export-dialog']).toBe(
      'node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/smoke-clip-export-dialog.ts'
    )
    expect(packageJson.scripts?.['smoke:media-details-dialog']).toBe(
      'node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/smoke-media-details-dialog.ts'
    )
    expect(packageJson.scripts?.['smoke:dialogs:all']).toBe(
      'npm run smoke:clip-export-dialog && npm run smoke:media-details-dialog'
    )
    expect(packageJson.scripts?.['smoke:subtitle-settings']).toBe(
      'node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/smoke-subtitle-settings.ts'
    )
    expect(packageJson.scripts?.['smoke:asr:player']).toBe(
      'node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/smoke-asr-real-player.ts'
    )
    expect(packageJson.scripts?.['smoke:translation']).toBe(
      'node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/smoke-translation.ts'
    )
    expect(packageJson.scripts?.['smoke:translation:player']).toBe(
      'node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/smoke-translation-player.ts'
    )
    expect(packageJson.scripts?.['smoke:all']).toBe(
      'npm run smoke:settings-dialog:all && npm run smoke:dialogs:all && npm run smoke:subtitle-settings && npm run smoke:translation && npm run smoke:translation:player && npm run smoke:open-video'
    )
  })

  it('uses stable selectors in the clip export smoke script', () => {
    const smokeScript = readSource('scripts/smoke-clip-export-dialog.ts')

    expect(smokeScript).toContain("aivplayer-smoke-clip-export-home-")
    expect(smokeScript).toContain("page.locator('.panel-switcher [role=\"tab\"]').nth(1).click()")
    expect(smokeScript).toContain("page.locator('.subtitle-actions-summary').click()")
    expect(smokeScript).toContain("page.locator('.subtitle-actions[open]').waitFor")
    expect(smokeScript).toContain("page.locator('.subtitle-actions-menu [role=\"menuitem\"]').first().click()")
    expect(smokeScript).toContain("page.locator('.clip-export-dialog').waitFor")
    expect(smokeScript).toContain("page.screenshot({ path: screenshotPath, fullPage: false })")
  })

  it('uses stable selectors in the media details smoke script', () => {
    const smokeScript = readSource('scripts/smoke-media-details-dialog.ts')

    expect(smokeScript).toContain("aivplayer-smoke-media-details-home-")
    expect(smokeScript).toContain("page.locator('.panel-switcher [role=\"tab\"]').nth(2).click()")
    expect(smokeScript).toContain("page.waitForFunction(() => {")
    expect(smokeScript).toContain("page.locator('.info-card-more-button').click()")
    expect(smokeScript).toContain("page.locator('.media-details-dialog').waitFor")
    expect(smokeScript).toContain("page.screenshot({ path: screenshotPath, fullPage: false })")
  })

  it('uses stable selectors in the subtitle settings smoke script', () => {
    const smokeScript = readSource('scripts/smoke-subtitle-settings.ts')

    expect(smokeScript).toContain("aivplayer-smoke-subtitle-settings-home-")
    expect(smokeScript).toContain("page.locator('[data-settings-tab=\"subtitles\"]').click()")
    expect(smokeScript).toContain("document.querySelector('.settings-dialog')")
    expect(smokeScript).toContain("window.aiv.setAppSettings")
    expect(smokeScript).toContain('page.evaluate(async ({ settings, glossary })')
    expect(smokeScript).toContain('settings: expectedSubtitleSettings, glossary: expectedTranslationGlossary')
    expect(smokeScript).toContain("document.querySelector('#settings-section-subtitles')")
    expect(smokeScript).toContain("persistedSettings.subtitles.fontSizePx !== 21")
    expect(smokeScript).toContain("persistedSettings.subtitles.lineHeight !== 'relaxed'")
    expect(smokeScript).toContain("persistedSettings.subtitles.displayMode !== 'source'")
    expect(smokeScript).toContain("persistedSettings.subtitles.targetLanguage !== 'zh'")
    expect(smokeScript).toContain('expectedTranslationGlossary')
    expect(smokeScript).toContain("subtitleSection?.querySelector('.settings-textarea')")
    expect(smokeScript).toContain('persistedSettings.asr.translationGlossary')
    expect(smokeScript).toContain("subtitleSection.querySelectorAll('.settings-number')")
    expect(smokeScript).toContain("subtitleSection.querySelectorAll('.settings-select')")
    expect(smokeScript).toContain("dialogState.subtitleSectionNumberValues.includes('21')")
    expect(smokeScript).toContain("dialogState.subtitleSectionSelectValues.includes('relaxed')")
    expect(smokeScript).toContain("dialogState.subtitleSectionSelectValues.includes('source')")
    expect(smokeScript).toContain("dialogState.subtitleSectionSelectValues.includes('zh')")
    expect(smokeScript).toContain("page.screenshot({ path: screenshotPath, fullPage: false })")
  })

  it('uses the real model directory and generated subtitle artifacts in the ASR smoke script', () => {
    const smokeScript = readSource('scripts/smoke-asr-real-player.ts')

    expect(smokeScript).toContain('AIVPLAYER_ASR_MODEL_DIR')
    expect(smokeScript).toContain("page.getByRole('button', { name: '生成字幕', exact: true }).click()")
    expect(smokeScript).toContain("page.locator('.asr-result.success', { hasText: '字幕生成完成，VTT 已挂载，SRT 已导出。' })")
    expect(smokeScript).toContain("fileName.endsWith('.vtt')")
    expect(smokeScript).toContain("fileName.endsWith('.srt')")
    expect(smokeScript).toContain("fileName.endsWith('.json')")
  })

  it('uses locale copy instead of hardcoded button labels in the open video smoke script', () => {
    const smokeScript = readSource('scripts/smoke-open-video.ts')

    expect(smokeScript).toContain("getAppCopy(appSettings.ui.locale)")
    expect(smokeScript).toContain("copy.panels.playlistTitle")
    expect(smokeScript).toContain("copy.panels.asrTitle")
    expect(smokeScript).toContain("copy.modelView.downloadRecommended")
    expect(smokeScript).toContain("copy.modelView.redownload")
    expect(smokeScript).toContain("copy.downloadDialog.title")
    expect(smokeScript).toContain("copy.downloadDialog.sourceAria('ModelScope')")
    expect(smokeScript).toContain("copy.downloadDialog.sourceAria('Hugging Face')")
    expect(smokeScript).not.toContain('播放列表')
    expect(smokeScript).not.toContain('ASR subtitles')
    expect(smokeScript).not.toContain('Download recommended model')
    expect(smokeScript).not.toContain('Redownload / change source')
    expect(smokeScript).not.toContain('下载推荐模型')
    expect(smokeScript).not.toContain('重新下载 / 更换来源')
    expect(smokeScript).not.toContain('推奨モデルをダウンロード')
    expect(smokeScript).not.toContain('추천 모델 다운로드')
  })

  it('covers translation progress and cancellation through a local mock service', () => {
    const smokeScript = readSource('scripts/smoke-translation.ts')

    expect(smokeScript).toContain('createServer')
    expect(smokeScript).toContain('window.aiv.translateAsrSubtitle')
    expect(smokeScript).toContain('window.aiv.onAsrJobProgress')
    expect(smokeScript).toContain('window.aiv.cancelAsrTranslation')
    expect(smokeScript).toContain('mock-model')
    expect(smokeScript).toContain('canceledResult.canceled')
  })

  it('covers the player subtitle cache, translation overlay, and restore flow', () => {
    const smokeScript = readSource('scripts/smoke-translation-player.ts')

    expect(smokeScript).toContain('getWhisperSubtitleOutputPaths')
    expect(smokeScript).toContain('AIVPLAYER_SMOKE_TRANSLATION_API_KEY')
    expect(smokeScript).toContain('AIVPLAYER_SMOKE_TRANSLATION_BASE_URL')
    expect(smokeScript).toContain('AIVPLAYER_SMOKE_TRANSLATION_GLOSSARY')
    expect(smokeScript).toContain("mode: 'mock' | 'real'")
    expect(smokeScript).toContain('video.video-surface')
    expect(smokeScript).toContain("page.getByRole('button', { name: '翻译为中文' })")
    expect(smokeScript).toContain("page.getByRole('button', { name: '取消翻译' })")
    expect(smokeScript).toContain("page.getByRole('button', { name: '英语', exact: true })")
    expect(smokeScript).toContain("page.getByRole('button', { name: '中文', exact: true })")
    expect(smokeScript).toContain("page.locator('.subtitle-display-trigger')")
    expect(smokeScript).toContain("page.getByRole('button', { name: '18px', exact: true })")
    expect(smokeScript).toContain("subtitleDisplaySettings.subtitles.lineHeight !== 'relaxed'")
    expect(smokeScript).toContain('Target language quick switch')
    expect(smokeScript).toContain("page.getByText('译文已就绪'")
    expect(smokeScript).toContain('displayMode !== \'translation\'')
    expect(smokeScript).toContain('Translated overlay')
    expect(smokeScript).toContain('Glossary overlay')
    expect(smokeScript).toContain('Restored overlay')
  })
})
