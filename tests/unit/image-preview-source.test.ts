import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('image editor preview source constraints', () => {
  it('keeps portrait images natural and contained inside the preview canvas', () => {
    const previewStyles = readSource('src/renderer/src/styles/player/media-preview-constraints.css')
    const previewComponent = readSource('src/renderer/src/app/image-preview.tsx')

    expect(previewStyles).toMatch(/\.media-preview-frame\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s)
    expect(previewStyles).toMatch(/\.media-preview-content\s*\{[^}]*width:\s*auto;[^}]*height:\s*auto;/s)
    expect(previewStyles).toMatch(/\.media-preview-content\s*\{[^}]*max-width:\s*100%;[^}]*max-height:\s*100%;/s)
    expect(previewComponent).toContain('image-preview-canvas media-preview-frame')
    expect(previewComponent).toContain('image-preview-media media-preview-content')
  })
})
