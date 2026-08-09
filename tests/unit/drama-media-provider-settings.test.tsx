import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DramaMediaProviderSettingsPanel } from '../../src/renderer/src/app/drama-media-provider-settings'
import type { DramaGenerationMediaType, DramaMediaProviderSettings } from '../../src/shared/drama-types'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'

const mediaSettings: Record<DramaGenerationMediaType, DramaMediaProviderSettings> = {
  image: { providerId: 'openai-images', apiBaseUrl: 'https://image.example.test', model: 'gpt-image-1', costPerRequest: 0.04, apiKeyConfigured: true },
  video: { providerId: 'ark-video', apiBaseUrl: 'https://video.example.test', model: 'seedance', costPerRequest: null, apiKeyConfigured: false },
  audio: { providerId: 'openai-tts', apiBaseUrl: 'https://audio.example.test', model: 'gpt-4o-mini-tts', costPerRequest: 0.02, apiKeyConfigured: true }
}

describe('drama media provider settings panel', () => {
  it('renders one independently labelled card for each media type without exposing keys', () => {
    const html = renderToStaticMarkup(<DramaMediaProviderSettingsPanel
      settings={mediaSettings}
      copy={zhCN.drama}
      busy={false}
      onSave={() => undefined}
    />)

    expect(html).toContain('data-testid="drama-media-provider-settings"')
    expect(html.match(/class="drama-media-provider-card"/gu)?.length).toBe(3)
    expect(html).toContain('openai-images')
    expect(html).toContain('ark-video')
    expect(html).toContain('openai-tts')
    expect(html).toContain('type="password"')
    expect(html).not.toContain('apiKey')
    expect(html).toContain('已配置（留空保持不变）')
  })

  it('disables every editable control while a save is running', () => {
    const html = renderToStaticMarkup(<DramaMediaProviderSettingsPanel
      settings={mediaSettings}
      copy={zhCN.drama}
      busy
      onSave={() => undefined}
    />)

    expect(html.match(/disabled=""/gu)?.length).toBe(18)
  })
})
