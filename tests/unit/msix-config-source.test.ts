import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('MSIX build source constraints', () => {
  it('generates an unsigned Store package with Partner Center identity', () => {
    const generatorSource = readSource('scripts/generate-msix-builder-config.mjs')

    expect(generatorSource).toContain('MSIX_IDENTITY_NAME')
    expect(generatorSource).toContain('MSIX_PUBLISHER')
    expect(generatorSource).toContain('MSIX_PUBLISHER_DISPLAY_NAME')
    expect(generatorSource).toContain("output: 'release-msix'")
    expect(generatorSource).toContain("target: ['appx']")
    expect(generatorSource).toContain('signExecutable: false')
    expect(generatorSource).toContain('electronUpdaterAware: false')
  })
})
