import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('media import inbox pipeline smoke', () => {
  it('keeps the host fixture aligned with scan, failure, task-center, and restart contracts', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-media-import-inbox-pipeline.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:media-import-inbox-pipeline']).toContain('smoke-media-import-inbox-pipeline.ts')
    expect(smoke).toContain('bad-inbox.mp4')
    expect(smoke).toContain("pipeline.metadata !== 'failed'")
    expect(smoke).toContain("restoredItem.status !== 'failed' && restoredItem.status !== 'missing'")
    expect(smoke).toContain("kind !== 'media-import'")
    expect(smoke).toContain('restartRestored')
  })
})
