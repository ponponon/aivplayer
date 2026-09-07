import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision duplicate media smoke source', () => {
  it('keeps the real Electron smoke focused on the user-visible duplicate report', () => {
    const script = readFileSync(join(projectRoot, 'scripts/smoke-vision-duplicate-media.ts'), 'utf8')
    const packageJson = readFileSync(join(projectRoot, 'package.json'), 'utf8')
    expect(packageJson).toContain('smoke:vision-duplicate-media')
    expect(script).toContain('video_sources')
    expect(script).toContain('vision-duplicate-scan')
    expect(script).toContain('vision-duplicate-report')
    expect(script).toContain('groupCount !== 1 || duplicateSourceCount !== 2')
  })
})
