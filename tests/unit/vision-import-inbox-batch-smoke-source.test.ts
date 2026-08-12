import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision import inbox batch smoke', () => {
  it('keeps host coverage aligned with queue, ignore, retry, and restart persistence', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-import-inbox-batch.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-import-inbox-batch']).toContain('smoke-vision-import-inbox-batch.ts')
    expect(smoke).toContain("getByRole('button', { name: '批量入队', exact: true })")
    expect(smoke).toContain("getByRole('button', { name: '批量忽略', exact: true })")
    expect(smoke).toContain("getByRole('button', { name: '批量重试', exact: true })")
    expect(smoke).toContain('restartRestored')
  })
})
