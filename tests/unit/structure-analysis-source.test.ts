import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('structure analysis integration', () => {
  it('keeps the FFmpeg analysis cache and IPC registration wired', () => {
    const ipc = readFileSync(join(projectRoot, 'src/desktop/ipc-structure-analysis.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/index.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    expect(ipc).toContain('blackdetect')
    expect(ipc).toContain('media-analysis')
    expect(ipc).toContain('sourceFingerprint')
    expect(ipc).toContain('rename(temporaryPath, target.cachePath)')
    expect(desktop).toContain('registerStructureAnalysisIpc()')
    expect(preload).toContain('analyzeMediaStructure')
  })

  it('keeps the editor review UI and source-range seeking visible', () => {
    const timeline = readFileSync(join(projectRoot, 'src/renderer/src/app/editing-timeline.tsx'), 'utf8')
    const component = readFileSync(join(projectRoot, 'src/renderer/src/app/editing-structure-analysis.tsx'), 'utf8')
    const styles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player.css'), 'utf8')
    expect(timeline).toContain('EditingStructureAnalysis')
    expect(timeline).toContain('sourceRangeToEditedRanges')
    expect(timeline).toContain('window.aiv.analyzeMediaStructure')
    expect(component).toContain('editing-structure-analysis')
    expect(component).toContain('editing-structure-item')
    expect(component).toContain('onIgnore')
    expect(component).toContain('onRestore')
    expect(component).toContain('data-segment-id')
    expect(timeline).toContain('structureCorrectionsByFingerprint')
    expect(styles).toContain("./player/editing-timeline-structure.css")
  })

  it('keeps playback skip and per-media correction actions wired', () => {
    const controls = readFileSync(join(projectRoot, 'src/renderer/src/app/playback-controls.tsx'), 'utf8')
    const analysisHook = readFileSync(join(projectRoot, 'src/renderer/src/app/use-playback-structure-analysis.ts'), 'utf8')
    const actionsHook = readFileSync(join(projectRoot, 'src/renderer/src/app/use-playback-structure-actions.ts'), 'utf8')
    expect(controls).toContain('playback-structure-skip')
    expect(controls).toContain('usePlaybackStructureAnalysis')
    expect(analysisHook).toContain('activeSegment')
    expect(analysisHook).toContain("segment.kind === 'black'")
    expect(actionsHook).toContain('structureCorrectionsByFingerprint')
    expect(actionsHook).toContain('restorePlaybackStructureSegment')
  })

  it('never runs a whole-file black scan just from opening media', () => {
    const analysisHook = readFileSync(join(projectRoot, 'src/renderer/src/app/use-playback-structure-analysis.ts'), 'utf8')
    const controls = readFileSync(join(projectRoot, 'src/renderer/src/app/playback-controls.tsx'), 'utf8')
    // Opening a file may only probe the cache; the full FFmpeg pass is user-triggered.
    expect(analysisHook).toContain('cacheOnly: true')
    expect(analysisHook).toContain('requestAnalysis')
    expect(analysisHook).toContain('cancelMediaStructureAnalysis')
    expect(analysisHook.indexOf('cacheOnly: true')).toBeLessThan(analysisHook.indexOf('const requestAnalysis'))
    expect(controls).toContain('playback-structure-scan')
    expect(controls).toContain('structureScan.onAnalyze')
  })

  it('bounds the analysis cost and lets the main process abort it', () => {
    const ipc = readFileSync(join(projectRoot, 'src/desktop/ipc-structure-analysis.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/index.ts'), 'utf8')
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    expect(ipc).toContain('STRUCTURE_ANALYSIS_DECODER_THREADS')
    expect(ipc).toContain("'-threads'")
    expect(ipc).toContain('AbortController')
    expect(ipc).toContain('cancelAllStructureAnalyses')
    expect(ipc).toContain('CANCEL_MEDIA_STRUCTURE_ANALYSIS')
    expect(channels).toContain("'media:cancel-structure-analysis'")
    expect(desktop).toContain('cancelAllStructureAnalyses()')
  })

  it('keeps a dedicated real-media smoke entry', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-structure-analysis.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:structure-analysis']).toContain('smoke-structure-analysis.ts')
    expect(smoke).toContain('analyzeMediaStructure')
    expect(smoke).toContain('black-structure.mp4')
    expect(smoke).toContain('editing-structure-analysis')
    expect(smoke).toContain('playback-structure-skip')
    expect(smoke).toContain('structureCorrectionsByFingerprint')
  })
})
