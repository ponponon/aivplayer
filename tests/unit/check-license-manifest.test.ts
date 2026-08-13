import { describe, expect, it } from 'vitest'
import { checkLicenseManifest } from '../../scripts/check-license-manifest'

describe('license manifest', () => {
  it('matches the project license and installed runtime package metadata', async () => {
    const result = await checkLicenseManifest()

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.checkedPackages).toEqual([
      '@huggingface/transformers',
      '@lancedb/lancedb',
      'apache-arrow',
      'electron-updater',
      'lucide-react',
      'qrcode',
      'react',
      'react-dom',
      'electron'
    ])
  })
})
