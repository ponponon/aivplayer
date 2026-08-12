import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('subtitle QA repair smoke', () => {
  it('keeps the host fixture aligned with repair, history, and export contracts', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-subtitle-qa-repair.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:subtitle-qa-repair']).toContain('smoke-subtitle-qa-repair.ts')
    expect(smoke).toContain("data-testid=\"subtitle-qa-repair\"")
    expect(smoke).toContain("data-testid=\"editing-undo\"")
    expect(smoke).toContain("data-testid=\"editing-redo\"")
    expect(smoke).toContain('qa-repaired.srt')
    expect(smoke).toContain('exportedDurations')
  })
})
