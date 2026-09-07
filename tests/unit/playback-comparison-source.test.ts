import { describe, expect, it } from 'vitest'
import { readSource } from './test-source-utils'

describe('playback comparison UI wiring', () => {
  it('keeps the comparison entry point, dual surfaces, and responsive layout connected', () => {
    const header = readSource('src/renderer/src/app/app-header.tsx')
    const stage = readSource('src/renderer/src/app/player-stage.tsx')
    const comparison = readSource('src/renderer/src/app/playback-comparison.tsx')
    const controls = readSource('src/renderer/src/app/playback-controls.tsx')
    const styles = readSource('src/renderer/src/styles/player.css')
    const smoke = readSource('scripts/smoke-playback-comparison.ts')

    expect(header).toContain('playback-comparison-toggle')
    expect(header).toContain('setIsComparisonMode(true)')
    expect(stage).toContain('<PlaybackComparison />')
    expect(comparison).toContain('playback-comparison-secondary')
    expect(comparison).toContain('clampComparisonTime')
    expect(comparison).toContain('onEnded={handleSecondaryEnded}')
    expect(comparison).toContain('playback-comparison-target')
    expect(controls).toContain('data-testid="playback-toggle"')
    expect(styles).toContain("@import './player/playback-comparison.css';")
    expect(styles).toContain('@media (max-width: 700px)')
    expect(smoke).toContain('synchronizedPlayback')
    expect(smoke).toContain('synchronizedSeek')
    expect(smoke).toContain('synchronizedPause')
  })
})
