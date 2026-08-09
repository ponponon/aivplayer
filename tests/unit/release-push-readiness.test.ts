import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const scriptPath = join(projectRoot, 'scripts/check-release-push-readiness.mjs')

describe('release push readiness', () => {
  it('keeps the internal plan and remote write boundary in the guard', async () => {
    const source = await readFile(scriptPath, 'utf8')
    expect(source).toContain('OPEN_SOURCE_INSPIRATION_PLAN.md')
    expect(source).toContain("['status', '--porcelain=v1'")
    expect(source).toContain('SECRET_PATTERNS')
    expect(source).not.toContain("['push'")
    expect(source).not.toContain('workflow run')
  })
})
