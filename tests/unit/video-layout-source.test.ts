import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('video layout source constraints', () => {
  it('keeps the video element proportional and centered inside the frame', () => {
    const playerCss = readSource('src/renderer/src/styles/player.css')
    const appSource = readSource('src/renderer/src/app/video-surface.tsx')

    expect(playerCss).toMatch(/\.video-frame\s*\{[^}]*place-items:\s*center;/s)
    expect(playerCss).toMatch(
      /\.video-surface\s*\{[^}]*width:\s*auto;[^}]*max-width:\s*100%;[^}]*height:\s*auto;[^}]*max-height:\s*100%;/s
    )
    expect(playerCss).toMatch(/\.video-surface\s*\{[^}]*object-fit:\s*contain;/s)
    expect(appSource).toContain('aspectRatio: `${state.videoWidth} / ${state.videoHeight}`')
  })
})
