import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision export cancellation smoke', () => {
  it('keeps the host smoke entry aligned with task-center and atomic-output contracts', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-search-export-cancel.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-search-export-cancel']).toContain('smoke-vision-search-export-cancel.ts')
    expect(smoke).toContain('task-center-cancel')
    expect(smoke).toContain("task?.status !== 'cancelled'")
    expect(smoke).toContain('assemblyPresent')
  })
})
