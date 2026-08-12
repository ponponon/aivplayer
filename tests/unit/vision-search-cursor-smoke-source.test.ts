import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision search cursor smoke', () => {
  it('keeps the host smoke entry aligned with snapshot and cross-kind contracts', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-search-cursor.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-search-cursor']).toContain('smoke-vision-search-cursor.ts')
    expect(smoke).toContain('Vision cursor snapshot was not stable')
    expect(smoke).toContain('crossKindRejected')
    expect(smoke).toContain('游标已过期或无效')
  })
})
