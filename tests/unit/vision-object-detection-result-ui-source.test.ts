import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('vision object detection result UI surface', () => {
  it('keeps detection action, IPC call and explainable box result visible', () => {
    const projectRoot = process.cwd()
    const panelSource = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    const resultsSource = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-search-results.tsx'), 'utf8')
    const resultSource = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-object-detection-result.tsx'), 'utf8')
    const styleSource = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')

    expect(panelSource).toContain('runVisionObjectDetection')
    expect(panelSource).toContain('objectDetectionThumbnailUrl')
    expect(panelSource).toContain('VisionObjectDetectionResultView')
    expect(resultsSource).toContain('vision-object-detection-action')
    expect(resultsSource).toContain('onDetectObjects')
    expect(resultsSource).toContain('objectDetectionBox')
    expect(resultSource).toContain('objectDetectionScore')
    expect(resultSource).toContain('objectDetectionBox')
    expect(resultSource).toContain('boxes={result.detections.map')
    expect(styleSource).toContain('.vision-object-detection-result')
    expect(styleSource).toContain('.vision-object-detection-preview')
  })
})
