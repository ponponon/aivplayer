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
    expect(ipc).toContain('rename(temporaryPath, cachePath)')
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
    expect(styles).toContain("./player/editing-timeline-structure.css")
  })

  it('keeps a dedicated real-media smoke entry', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-structure-analysis.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:structure-analysis']).toContain('smoke-structure-analysis.ts')
    expect(smoke).toContain('analyzeMediaStructure')
    expect(smoke).toContain('black-structure.mp4')
    expect(smoke).toContain('editing-structure-analysis')
  })
})
