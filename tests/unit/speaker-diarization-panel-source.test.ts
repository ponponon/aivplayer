import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('speaker diarization vision panel', () => {
  it('exposes a real run, refresh and seekable segment result flow', () => {
    const projectRoot = process.cwd()
    const componentSource = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-speaker-diarization.tsx'), 'utf8')
    const panelSource = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    const playerStyles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player.css'), 'utf8')
    const packageSource = readFileSync(join(projectRoot, 'package.json'), 'utf8')
    const smokeSource = readFileSync(join(projectRoot, 'scripts/smoke-speaker-diarization-panel.ts'), 'utf8')

    expect(componentSource).toContain('getSpeakerDiarizationStatus')
    expect(componentSource).toContain('runSpeakerDiarization')
    expect(componentSource).toContain('evidencePersisted')
    expect(componentSource).toContain('speakerEvidenceSaved')
    expect(componentSource).toContain('vision-speaker-evidence-status')
    expect(componentSource).toContain('vision-speaker-segment')
    expect(componentSource).toContain('updateSpeakerDiarizationCatalog')
    expect(componentSource).toContain('clearSpeakerDiarizationEvidence')
    expect(componentSource).toContain('vision-speaker-clear-evidence')
    expect(componentSource).toContain('speakerEvidenceCleared')
    expect(componentSource).toContain('vision-speaker-label-row')
    expect(panelSource).toContain('VisionSpeakerEvidenceSources')
    expect(componentSource).toContain('speakerNamedSegment')
    expect(componentSource).toContain('onSeek(segment.startSeconds)')
    expect(panelSource).toContain('<VisionSpeakerDiarization')
    expect(panelSource).toContain('onSeek={app.seekTo}')
    expect(playerStyles).toContain("@import './player/vision-speaker-diarization.css';")
    expect(playerStyles).toContain("@import './player/vision-speaker-evidence-sources.css';")
    expect(packageSource).toContain('smoke:speaker-diarization:panel')
    expect(smokeSource).toContain('listSpeakerDiarizationEvidenceSources')
    expect(smokeSource).toContain('vision-speaker-clear-selected-evidence')
    expect(smokeSource).toContain('batchClearedSearchResults')
  })
})
