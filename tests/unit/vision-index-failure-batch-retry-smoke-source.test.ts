import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision index failure batch retry smoke', () => {
  it('keeps the host fixture aligned with retry and configuration isolation contracts', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-index-failure-batch-retry.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-index-failure-batch-retry']).toContain('smoke-vision-index-failure-batch-retry.ts')
    expect(smoke).toContain('includeSceneEvidence: true')
    expect(smoke).toContain('includeObjectEvidence: true')
    expect(smoke).toContain('configurationIsolated')
    expect(smoke).toContain('restartRestored')
  })
})
