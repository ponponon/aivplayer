import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision entity catalog batch smoke', () => {
  it('keeps host coverage aligned with hide, show, merge, and restart persistence', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-entity-catalog-batch.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-entity-catalog-batch']).toContain('smoke-vision-entity-catalog-batch.ts')
    expect(smoke).toContain("getByRole('button', { name: '批量隐藏' })")
    expect(smoke).toContain("getByRole('button', { name: '批量显示' })")
    expect(smoke).toContain("getByRole('button', { name: '批量合并' })")
    expect(smoke).toContain('restartRestored')
  })
})
