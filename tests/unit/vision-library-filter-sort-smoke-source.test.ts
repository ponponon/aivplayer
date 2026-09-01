import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision library filter sort smoke', () => {
  it('keeps host coverage aligned with metadata search, favorite filter, sort modes, and restart projection', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-library-filter-sort.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-library-filter-sort']).toContain('smoke-vision-library-filter-sort.ts')
    expect(smoke).toContain("getByRole('textbox'")
    expect(smoke).toContain("selectAppOption(firstSession.page, sort, 'name')")
    expect(smoke).toContain("selectAppOption(firstSession.page, sort, 'frames')")
    expect(smoke).toContain("tags: ['重启标签']")
    expect(smoke).toContain('restartSidecarProjection')
  })
})
