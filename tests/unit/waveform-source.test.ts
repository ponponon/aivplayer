import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const readSource = (path: string): string => readFileSync(join(projectRoot, path), 'utf8')

describe('waveform integration', () => {
  it('keeps waveform IPC, cache and preload wiring visible', () => {
    const types = readSource('src/shared/media-base-types.ts')
    const channels = readSource('src/shared/ipc-channels.ts')
    const desktop = readSource('src/desktop/index.ts')
    const ipc = readSource('src/desktop/ipc-waveform.ts')
    const preload = readSource('src/preload/index.ts')
    const cache = readSource('src/core/media/waveform-cache.ts')
    const packageJson = JSON.parse(readSource('package.json')) as { scripts?: Record<string, string> }
    expect(types).toContain('MediaWaveformRequest')
    expect(types).toContain('MediaWaveformResult')
    expect(channels).toContain('EXTRACT_MEDIA_WAVEFORM')
    expect(desktop).toContain('registerWaveformIpc()')
    expect(ipc).toContain('showwavespic')
    expect(ipc).toContain('filter=peak')
    expect(preload).toContain('extractMediaWaveform')
    expect(cache).toContain('getWaveformCacheKey')
    expect(cache).toContain('rename(temporaryPath, filePath)')
    expect(packageJson.scripts?.['smoke:waveform']).toContain('smoke-waveform.ts')
    expect(packageJson.scripts?.['smoke:visual-sync']).toContain('smoke-visual-sync.ts')
  })

  it('keeps the waveform track rendered and linked to editor seeking', () => {
    const timeline = readSource('src/renderer/src/app/editing-timeline.tsx')
    const hook = readSource('src/renderer/src/app/use-editing-waveform.ts')
    const track = readSource('src/renderer/src/app/editing-waveform-track.tsx')
    const styles = readSource('src/renderer/src/styles/player.css')
    expect(timeline).toContain('getEditingWaveformSegments')
    expect(timeline).toContain('<EditingWaveformTrack')
    expect(hook).toContain('window.aiv.extractMediaWaveform')
    expect(track).toContain('data-testid="editing-waveform-track"')
    expect(track).toContain('onSeek(ratio * durationSeconds)')
    expect(styles).toContain("./player/editing-timeline-waveform.css")
    expect(readSource('scripts/smoke-waveform.ts')).toContain('editing-waveform-track')
    expect(readSource('scripts/smoke-visual-sync.ts')).toContain('editing-caption-sync')
  })
})
