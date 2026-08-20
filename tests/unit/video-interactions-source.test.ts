import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('video surface interaction source constraints', () => {
  it('separates single-click playback from double-click fullscreen', () => {
    const appSource = `${readSource('src/renderer/src/app/video-surface.tsx')}\n${readSource('src/renderer/src/app/playback-controls.tsx')}\n${readSource('src/renderer/src/app/use-playback-controls.ts')}\n${readSource('src/renderer/src/app/use-keyboard-shortcuts.ts')}\n${readSource('src/renderer/src/app/use-window-effects.ts')}\n${readSource('src/renderer/src/app/clip-editor-preview.tsx')}`
    const playerCss = readSource('src/renderer/src/styles/player.css')

    expect(appSource).toContain('onClick={app.handleVideoClick}')
    expect(appSource).toContain('onDoubleClick={app.handleVideoDoubleClick}')
    expect(appSource).toContain('event.preventDefault()')
    expect(appSource).toContain('if (event.detail > 1)')
    expect(appSource).toContain('clearVideoClickTimer()')
    expect(appSource).toContain('void togglePlay()')
    expect(appSource).toContain('void toggleFullscreen()')
    expect(appSource).toContain('syncPlaybackState')
    expect(appSource).toContain("key={mediaUrl || 'empty-media'}")
    expect(appSource).toContain('const isCurrentVideo = (video: HTMLVideoElement): boolean => video === app.videoRef.current')
    expect(appSource).toContain('if (!syncCurrentVideoState(video)) return')
    expect(appSource).toContain('app.handlePlaybackEnded(video)')
    expect(appSource).toContain('syncPlayerPlayingState(model.setState, video, () => model.videoRef.current)')
    expect(appSource).toContain("key={mediaUrl || 'empty-preview-media'}")
    expect(appSource).toContain('if (isCurrentPreviewVideo(event.currentTarget)) syncBooleanPlayingState(setIsPlaying, event.currentTarget, () => videoRef.current)')
    expect(appSource).toContain('setIsPlaying(false)')
    expect(appSource).toContain('const { volume, muted } = video')
    expect(appSource).not.toContain('volume: event.currentTarget.volume')
    expect(appSource).toContain('app.isFullscreen ? <Minimize2 size={16} /> : <Fullscreen size={16} />')
    expect(appSource).toContain("if (event.key === 'Escape')")
    expect(appSource).toContain('void document.exitFullscreen()')
    expect(playerCss).toMatch(/\.video-surface:fullscreen\s*\{[^}]*object-fit:\s*contain;/s)
  })
})
