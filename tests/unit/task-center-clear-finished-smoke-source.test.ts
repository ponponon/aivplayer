import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('task center clear finished smoke', () => {
  it('keeps the host fixture aligned with clear, active, and restart contracts', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-task-center-clear-finished.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:task-center-clear-finished']).toContain('smoke-task-center-clear-finished.ts')
    expect(smoke).toContain("getByRole('button', { name: '清除已结束' })")
    expect(smoke).toContain('Active task was removed by clear-finished')
    expect(smoke).toContain('New terminal event was lost after clear')
    expect(smoke).toContain('Old cleared task returned after restart')
  })
})
