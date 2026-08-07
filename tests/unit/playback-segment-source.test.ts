import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('playback marker and segment wiring', () => {
  it('keeps persisted segment actions and timeline rendering visible', () => {
    const controls = readFileSync(join(projectRoot, 'src/renderer/src/app/playback-controls.tsx'), 'utf8')
    const actions = readFileSync(join(projectRoot, 'src/renderer/src/app/use-playback-bookmark-actions.ts'), 'utf8')
    const settings = readFileSync(join(projectRoot, 'src/shared/app-settings.ts'), 'utf8')
    const trickplay = readFileSync(join(projectRoot, 'src/renderer/src/app/use-playback-trickplay.ts'), 'utf8')
    const cache = readFileSync(join(projectRoot, 'src/core/media/filmstrip-cache.ts'), 'utf8')
    const filmstripIpc = readFileSync(join(projectRoot, 'src/desktop/ipc-filmstrip.ts'), 'utf8')
    const timelineStyles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/playback-timeline.css'), 'utf8')
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-playback-segments.ts'), 'utf8')
    expect(controls).toContain('createPlaybackSegment')
    expect(controls).toContain('timeline-segment-marker')
    expect(controls).toContain('segmentMenu')
    expect(actions).toContain('segmentsByFingerprint')
    expect(actions).toContain('removePlaybackSegment')
    expect(settings).toContain('segmentsByFingerprint')
    expect(trickplay).toContain('getPlaybackTrickplayTimestamps')
    expect(trickplay).toContain('findNearestPlaybackTrickplayFrame')
    expect(cache).toContain('getFilmstripCacheKey')
    expect(cache).toContain('manifest.json')
    expect(filmstripIpc).toContain('resolveFilmstripCache')
    expect(timelineStyles).toContain('timeline-trickplay-preview')
    expect(packageJson.scripts?.['smoke:playback-segments']).toContain('smoke-playback-segments.ts')
    expect(packageJson.scripts?.['smoke:all']).toContain('smoke:playback-segments')
    expect(packageJson.scripts?.['smoke:all']).toContain('smoke:vision-clip-inbox')
    expect(smoke).toContain('timeline-segment-marker')
    expect(smoke).toContain('Smoke segment')
    expect(smoke).toContain('generatedFrameCount')
    expect(smoke).toContain('timeline-trickplay-preview')
  })
})
