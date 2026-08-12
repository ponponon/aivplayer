import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision scene evidence smoke', () => {
  it('keeps the host fixture aligned with stage, source aggregation, and search contracts', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-scene-evidence.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-scene-evidence']).toContain('smoke-vision-scene-evidence.ts')
    expect(smoke).toContain('includeSceneEvidence: true')
    expect(smoke).toContain("stage === 'scene-evidence'")
    expect(smoke).toContain('listVisionEvidenceSources')
    expect(smoke).toContain("query: 'scene segment'")
    expect(smoke).toContain('boundedRange')
  })
})
