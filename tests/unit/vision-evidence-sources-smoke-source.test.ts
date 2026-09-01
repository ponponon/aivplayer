import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision evidence sources smoke', () => {
  it('keeps host coverage aligned with audit filtering, derived cleanup, and base evidence preservation', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-evidence-sources.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-evidence-sources']).toContain('smoke-vision-evidence-sources.ts')
    expect(smoke).toContain("selectAppOption(session.page, panel.getByTestId('vision-evidence-audit-filter'), 'missing')")
    expect(smoke).toContain('baseVisualPreserved')
    expect(smoke).toContain('vision-evidence-clear-selected')
  })
})
