import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision export recovery smoke', () => {
  it('keeps the host smoke entry and recovery fixtures aligned', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-search-export-recovery.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-search-export-recovery']).toContain('smoke-vision-search-export-recovery.ts')
    expect(smoke).toContain("'queued', 'smoke-queued-results.json'")
    expect(smoke).toContain("'running', 'smoke-running-results.json'")
    expect(smoke).toContain('task-center-retry')
    expect(smoke).toContain('verified checkpoint marker')
    expect(smoke).toContain('vision-search-exports.json')
  })
})
