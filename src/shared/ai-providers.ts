import type { TranslationServiceMode } from './translation-service'

export const MANAGED_AI_PROVIDER_ID = 'managed'
export const MAX_AI_PROVIDER_PROFILES = 20
export const MAX_AI_PROVIDER_TRANSLATION_PROMPT_LENGTH = 12_000

export function normalizeAiProviderTranslationPrompt(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const prompt = value.trim()
  return prompt ? prompt.slice(0, MAX_AI_PROVIDER_TRANSLATION_PROMPT_LENGTH) : null
}

export type AiProviderProfile = {
  id: string
  name: string
  kind: TranslationServiceMode
  baseUrl: string | null
  model: string | null
  apiKey: string | null
  translationPrompt?: string | null
}

export function createManagedAiProvider(): AiProviderProfile {
  return { id: MANAGED_AI_PROVIDER_ID, name: '', kind: 'managed', baseUrl: null, model: null, apiKey: null }
}

export function createCustomAiProvider(id: string): AiProviderProfile {
  return { id, name: '', kind: 'custom', baseUrl: null, model: null, apiKey: null, translationPrompt: null }
}

export function resolveActiveAiProvider(
  providers: readonly AiProviderProfile[] | null | undefined,
  activeProviderId: string | null | undefined
): AiProviderProfile {
  const list = Array.isArray(providers) ? providers : []
  return (
    list.find((provider) => provider.id === activeProviderId) ??
    list.find((provider) => provider.id === MANAGED_AI_PROVIDER_ID) ??
    createManagedAiProvider()
  )
}

export function isAiProviderConfigured(provider: AiProviderProfile | null | undefined): boolean {
  if (!provider) return false
  if (provider.kind === 'managed') return true
  return Boolean(provider.baseUrl?.trim() && provider.model?.trim() && provider.apiKey?.trim())
}
