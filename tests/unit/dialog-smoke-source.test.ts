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
    expect(packageJson.scripts?.['smoke:all']).toBe(
      'npm run smoke:settings-dialog:all && npm run smoke:dialogs:all && npm run smoke:open-video'
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
})
