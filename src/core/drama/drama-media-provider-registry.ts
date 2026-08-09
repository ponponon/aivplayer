import type { DramaGenerationMediaType, DramaMediaProviderSettings, DramaGenerationProvider } from '../../shared/drama-types'
import { createArkVideoProvider } from './drama-ark-video-provider'
import { createHttpDramaMediaProvider } from './drama-media-provider'
import { createOpenAICompatibleAudioProvider } from './drama-openai-audio-provider'
import { createOpenAICompatibleImageProvider } from './drama-openai-image-provider'

const MEDIA_TYPES: readonly DramaGenerationMediaType[] = ['image', 'video', 'audio']

export type DramaMediaProviderRegistration = {
  providerId: string | null
  apiBaseUrl: string | null
  model: string | null
  apiKey: string | null
  costPerRequest: number | null
}

export type DramaMediaProviderRegistrationMap = Record<DramaGenerationMediaType, DramaMediaProviderRegistration>

export type DramaMediaProviderRegistryOptions = {
  outputDirectory: string
}

/**
 * Builds only the configured media providers. Invalid entries are omitted so
 * one broken media endpoint cannot prevent the other media queues from being
 * initialized; the Worker will report the missing provider as a task failure.
 */
export function createDramaMediaProviders(
  settings: Partial<DramaMediaProviderRegistrationMap>,
  options: DramaMediaProviderRegistryOptions
): Partial<Record<DramaGenerationMediaType, DramaGenerationProvider>> {
  const providers: Partial<Record<DramaGenerationMediaType, DramaGenerationProvider>> = {}
  for (const mediaType of MEDIA_TYPES) {
    const registration = settings[mediaType]
    if (!registration?.apiBaseUrl) continue
    try {
      providers[mediaType] = createDramaMediaProvider(mediaType, registration, options)
    } catch {
      // Settings are user input. Keep provider creation fail-closed and let
      // the generation Worker expose a retryable configuration failure.
    }
  }
  return providers
}

export function createDramaMediaProvider(
  mediaType: DramaGenerationMediaType,
  registration: DramaMediaProviderRegistration,
  options: DramaMediaProviderRegistryOptions
): DramaGenerationProvider {
  if (!registration.apiBaseUrl) throw new Error('媒体 Provider 地址不能为空')
  const common = {
    providerId: registration.providerId?.trim() || 'http-json',
    baseUrl: registration.apiBaseUrl,
    apiKey: registration.apiKey,
    model: registration.model,
    costPerRequest: registration.costPerRequest,
    outputDirectory: options.outputDirectory
  }

  if (mediaType === 'image' && registration.providerId === 'openai-images') {
    return createOpenAICompatibleImageProvider(common)
  }
  if (mediaType === 'audio' && registration.providerId === 'openai-tts') {
    return createOpenAICompatibleAudioProvider(common)
  }
  if (mediaType === 'video' && registration.providerId === 'ark-video') {
    return createArkVideoProvider(common)
  }
  return createHttpDramaMediaProvider({ ...common, mediaType })
}

export function toPublicDramaMediaProviderSettings(
  registration: DramaMediaProviderRegistration
): DramaMediaProviderSettings {
  return {
    providerId: registration.providerId,
    apiBaseUrl: registration.apiBaseUrl,
    model: registration.model,
    costPerRequest: registration.costPerRequest,
    apiKeyConfigured: Boolean(registration.apiKey)
  }
}
