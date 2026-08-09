import { describe, expect, it } from 'vitest'
import {
  createDramaMediaProvider,
  createDramaMediaProviders,
  toPublicDramaMediaProviderSettings,
  type DramaMediaProviderRegistrationMap
} from '../../src/core/drama/drama-media-provider-registry'

const outputDirectory = '/tmp/aivplayer-drama-generated'

describe('drama media provider registry', () => {
  it('selects the compatible adapter by media type and provider id', () => {
    const settings: DramaMediaProviderRegistrationMap = {
      image: registration('openai-images', 'https://image.example.test'),
      video: registration('ark-video', 'https://video.example.test/v1'),
      audio: registration('openai-tts', 'https://audio.example.test')
    }

    const providers = createDramaMediaProviders(settings, { outputDirectory })

    expect(providers.image?.id).toBe('openai-images')
    expect(providers.video?.id).toBe('ark-video')
    expect(providers.audio?.id).toBe('openai-tts')
  })

  it('uses the generic HTTP adapter for unknown provider ids and omits unconfigured entries', () => {
    const providers = createDramaMediaProviders({
      image: registration('custom-image', 'https://image.example.test'),
      video: registration(null, null),
      audio: registration('custom-audio', 'https://audio.example.test')
    }, { outputDirectory })

    expect(providers.image?.id).toBe('custom-image')
    expect(providers.video).toBeUndefined()
    expect(providers.audio?.id).toBe('custom-audio')
  })

  it('omits invalid endpoint entries without affecting valid media providers', () => {
    const providers = createDramaMediaProviders({
      image: registration('broken', 'file:///private/key'),
      video: registration('valid-video', 'https://video.example.test')
    }, { outputDirectory })

    expect(providers.image).toBeUndefined()
    expect(providers.video?.id).toBe('valid-video')
  })

  it('projects configuration without exposing the API key', () => {
    const publicSettings = toPublicDramaMediaProviderSettings(registration('provider', 'https://provider.example.test'))

    expect(publicSettings).toEqual({
      providerId: 'provider',
      apiBaseUrl: 'https://provider.example.test',
      model: 'model-1',
      costPerRequest: 0.04,
      apiKeyConfigured: true
    })
    expect(publicSettings).not.toHaveProperty('apiKey')
  })

  it('rejects an empty endpoint when creating a single provider', () => {
    expect(() => createDramaMediaProvider('image', registration('provider', null), { outputDirectory }))
      .toThrow('媒体 Provider 地址不能为空')
  })
})

function registration(providerId: string | null, apiBaseUrl: string | null) {
  return {
    providerId,
    apiBaseUrl,
    model: 'model-1',
    apiKey: 'fixture-key',
    costPerRequest: 0.04
  }
}
