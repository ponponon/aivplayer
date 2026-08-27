import { describe, expect, it } from 'vitest'
import {
  MANAGED_AI_PROVIDER_ID,
  createCustomAiProvider,
  createManagedAiProvider,
  isAiProviderConfigured,
  resolveActiveAiProvider
} from '../../src/shared/ai-providers'

describe('ai providers', () => {
  it('falls back to the managed provider when the active id is missing', () => {
    const providers = [createManagedAiProvider(), createCustomAiProvider('custom-1')]
    expect(resolveActiveAiProvider(providers, 'missing-id').id).toBe(MANAGED_AI_PROVIDER_ID)
    expect(resolveActiveAiProvider(providers, null).id).toBe(MANAGED_AI_PROVIDER_ID)
    expect(resolveActiveAiProvider(null, 'custom-1').id).toBe(MANAGED_AI_PROVIDER_ID)
  })

  it('resolves the active custom provider', () => {
    const providers = [createManagedAiProvider(), { ...createCustomAiProvider('custom-1'), model: 'my-model' }]
    expect(resolveActiveAiProvider(providers, 'custom-1').model).toBe('my-model')
  })

  it('treats the managed provider as always configured and custom as configured only with all fields', () => {
    expect(isAiProviderConfigured(createManagedAiProvider())).toBe(true)
    expect(isAiProviderConfigured(null)).toBe(false)
    expect(isAiProviderConfigured(createCustomAiProvider('c'))).toBe(false)
    expect(
      isAiProviderConfigured({ ...createCustomAiProvider('c'), baseUrl: 'https://x/v1/chat/completions', model: 'm', apiKey: 'k' })
    ).toBe(true)
  })
})
