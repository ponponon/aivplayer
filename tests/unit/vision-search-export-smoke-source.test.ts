import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision search export smoke', () => {
  it('keeps the host smoke entry aligned with JSON, CSV, and selection contracts', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-search-export.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-search-export']).toContain('smoke-vision-search-export.ts')
    expect(smoke).toContain('exportVersion')
    expect(smoke).toContain('导出 JSON')
    expect(smoke).toContain('导出 CSV')
    expect(smoke).toContain('csvSelectedCount')
  })
})
