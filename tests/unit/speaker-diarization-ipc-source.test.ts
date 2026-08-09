import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('speaker diarization IPC surface', () => {
  it('registers status and run channels in desktop and preload layers', () => {
    const projectRoot = process.cwd()
    const desktopSource = readFileSync(join(projectRoot, 'src/desktop/ipc-speaker-diarization.ts'), 'utf8')
    const indexSource = readFileSync(join(projectRoot, 'src/desktop/index.ts'), 'utf8')
    const preloadSource = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')

    expect(desktopSource).toContain('SPEAKER_DIARIZATION_STATUS')
    expect(desktopSource).toContain('SPEAKER_DIARIZATION_RUN')
    expect(desktopSource).toContain('buildFfmpegAudioExtractArgs')
    expect(desktopSource).toContain('createSpeakerDiarizationEvidence')
    expect(desktopSource).toContain('replaceSpeakerEvidence')
    expect(desktopSource).toContain('evidencePersisted')
    expect(indexSource).toContain('registerSpeakerDiarizationIpc')
    expect(preloadSource).toContain('getSpeakerDiarizationStatus')
    expect(preloadSource).toContain('runSpeakerDiarization')
  })
})
