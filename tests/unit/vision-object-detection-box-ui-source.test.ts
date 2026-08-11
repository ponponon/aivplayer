import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = join(import.meta.dirname, '../..')

describe('vision object detection box thumbnail UI', () => {
  it('projects box coordinates from the loaded thumbnail dimensions', () => {
    const source = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-result-thumbnail.tsx'), 'utf8')
    expect(source).toContain('naturalWidth')
    expect(source).toContain('projectVisionObjectDetectionBox')
    expect(source).toContain('vision-result-box')
  })

  it('keeps the overlay decorative and uses the existing result thumbnail surface', () => {
    const resultSource = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-search-results.tsx'), 'utf8')
    const styleSource = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')
    expect(resultSource).toContain('<VisionResultThumbnail')
    expect(resultSource).toContain("box={result.evidenceType === 'object' ? result.box : undefined}")
    expect(styleSource).toContain('.vision-result-thumbnail')
    expect(styleSource).toContain('.vision-result-box')
    expect(styleSource).toContain('pointer-events: none')
  })
})
