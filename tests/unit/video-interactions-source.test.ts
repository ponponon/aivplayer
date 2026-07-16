import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('video surface interaction source constraints', () => {
  it('separates single-click playback from double-click fullscreen', () => {
    const appSource = `${readSource('src/renderer/src/app/video-surface.tsx')}\n${readSource('src/renderer/src/app/playback-controls.tsx')}\n${readSource('src/renderer/src/app/use-playback-controls.ts')}\n${readSource('src/renderer/src/app/use-keyboard-shortcuts.ts')}\n${readSource('src/renderer/src/app/use-window-effects.ts')}`
    const playerCss = readSource('src/renderer/src/styles/player.css')

    expect(appSource).toContain('onClick={app.handleVideoClick}')
    expect(appSource).toContain('onDoubleClick={app.handleVideoDoubleClick}')
    expect(appSource).toContain('event.preventDefault()')
    expect(appSource).toContain('if (event.detail > 1)')
    expect(appSource).toContain('clearVideoClickTimer()')
    expect(appSource).toContain('void togglePlay()')
    expect(appSource).toContain('void toggleFullscreen()')
    expect(appSource).toContain('const { volume, muted } = event.currentTarget')
    expect(appSource).not.toContain('volume: event.currentTarget.volume')
    expect(appSource).toContain('app.isFullscreen ? <Minimize2 size={16} /> : <Fullscreen size={16} />')
    expect(appSource).toContain("if (event.key === 'Escape')")
    expect(appSource).toContain('void document.exitFullscreen()')
    expect(playerCss).toMatch(/\.video-surface:fullscreen\s*\{[^}]*object-fit:\s*contain;/s)
  })
})
