import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision full export smoke', () => {
  it('keeps the host smoke entry aligned with full-window and task-center contracts', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-search-full-export.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-search-full-export']).toContain('smoke-vision-search-full-export.ts')
    expect(smoke).toContain('fixtureCount = 120')
    expect(smoke).toContain('taskCompleted')
    expect(smoke).toContain('selectedCount')
    expect(smoke).toContain('nth(1)')
  })
})
