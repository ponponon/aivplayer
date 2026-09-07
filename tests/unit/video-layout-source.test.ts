import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('video layout source constraints', () => {
  it('fills the video frame while preserving the media aspect ratio', () => {
    const playerCss = readSource('src/renderer/src/styles/player.css')
    const appSource = readSource('src/renderer/src/app/video-surface.tsx')

    expect(playerCss).toMatch(/\.video-frame\s*\{[^}]*place-items:\s*center;/s)
    expect(playerCss).toMatch(
      /\.video-surface\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s
    )
    expect(playerCss).toMatch(/\.video-surface\s*\{[^}]*object-fit:\s*contain;/s)
    expect(playerCss).toMatch(
      /\.stage:fullscreen\s+\.video-surface\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*max-width:\s*none;[^}]*max-height:\s*none;[^}]*object-fit:\s*contain;/s
    )
    expect(appSource).toContain('aspectRatio: `${state.videoWidth} / ${state.videoHeight}`')
    expect(appSource).toContain('getEditingPersonMatteOutlinePixels')
    expect(appSource).toContain('drop-shadow(0 0 ${personMatteOutlinePixels}px ${personMatteSettings.outlineColor})')
    expect(appSource).toContain('onPersonMatteTrackProgress')
    expect(appSource).toContain('data-testid="editing-person-matte-track-progress"')
    expect(appSource).toContain('createPersonMattePreviewMask')
    expect(appSource).toContain('personMattePreviewFrameUrl')
  })
})
