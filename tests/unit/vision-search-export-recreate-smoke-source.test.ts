import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision export recreate smoke', () => {
  it('keeps the host smoke entry and failure-task fixture aligned', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-search-export-recreate.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-search-export-recreate']).toContain('smoke-vision-search-export-recreate.ts')
    expect(smoke).toContain('task-center-recreate')
    expect(smoke).toContain('searchRevision')
    expect(smoke).toContain('partsDirectory')
    expect(smoke).toContain('vision-search-exports.json')
  })
})
