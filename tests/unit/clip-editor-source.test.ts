import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('clip editor preview source constraints', () => {
  it('keeps preview video dimensions natural inside the preview canvas', () => {
    const previewStyles = readSource('src/renderer/src/styles/player/clip-editor-preview.css')

    expect(previewStyles).toMatch(/\.clip-editor-preview-frame\s*\{[^}]*place-items:\s*center;/s)
    expect(previewStyles).toMatch(/\.clip-editor-preview-video\s*\{[^}]*width:\s*auto;[^}]*height:\s*auto;/s)
    expect(previewStyles).toMatch(/\.clip-editor-preview-video\s*\{[^}]*max-width:\s*100%;[^}]*max-height:\s*100%;/s)
  })
})
