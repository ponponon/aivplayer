import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision import inbox batch clear smoke', () => {
  it('keeps the host fixture aligned with the terminal-state clear contract', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-import-inbox-batch-clear.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-import-inbox-batch-clear']).toContain('smoke-vision-import-inbox-batch-clear.ts')
    expect(smoke).toContain("action: 'clear'")
    expect(smoke).toContain('illegalBatch')
    expect(smoke).toContain('mediaPreserved')
    expect(smoke).toContain('not restored after restart')
  })
})
