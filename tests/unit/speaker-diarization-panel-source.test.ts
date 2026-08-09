import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('speaker diarization vision panel', () => {
  it('exposes a real run, refresh and seekable segment result flow', () => {
    const projectRoot = process.cwd()
    const componentSource = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-speaker-diarization.tsx'), 'utf8')
    const panelSource = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    const playerStyles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player.css'), 'utf8')

    expect(componentSource).toContain('getSpeakerDiarizationStatus')
    expect(componentSource).toContain('runSpeakerDiarization')
    expect(componentSource).toContain('vision-speaker-segment')
    expect(componentSource).toContain('onSeek(segment.startSeconds)')
    expect(panelSource).toContain('<VisionSpeakerDiarization')
    expect(panelSource).toContain('onSeek={app.seekTo}')
    expect(playerStyles).toContain("@import './player/vision-speaker-diarization.css';")
  })
})
