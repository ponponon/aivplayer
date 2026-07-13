import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('video surface interaction source constraints', () => {
  it('separates single-click playback from double-click fullscreen', () => {
    const appSource = readSource('src/renderer/src/app/App.tsx')
    const playerCss = readSource('src/renderer/src/styles/player.css')

    expect(appSource).toContain('onClick={handleVideoClick}')
    expect(appSource).toContain('onDoubleClick={handleVideoDoubleClick}')
    expect(appSource).toContain('event.preventDefault()')
    expect(appSource).toContain('if (event.detail > 1)')
    expect(appSource).toContain('clearVideoClickTimer()')
    expect(appSource).toContain('void togglePlay()')
    expect(appSource).toContain('void toggleFullscreen()')
    expect(appSource).toContain("if (event.key === 'Escape')")
    expect(appSource).toContain('void document.exitFullscreen()')
    expect(playerCss).toMatch(/\.video-surface:fullscreen\s*\{[^}]*object-fit:\s*contain;/s)
  })
})
