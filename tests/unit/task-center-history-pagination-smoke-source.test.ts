import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('task center history pagination smoke', () => {
  it('keeps the host fixture aligned with history and live-event contracts', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-task-center-history-pagination.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:task-center-history-pagination']).toContain('smoke-task-center-history-pagination.ts')
    expect(smoke).toContain('taskCount = 13')
    expect(smoke).toContain("selectAppOption(page, taskCenter.locator('.app-select[aria-label=\"筛选状态\"]'), 'failed')")
    expect(smoke).toContain("send('task-center:event'")
    expect(smoke).toContain('Live task event was lost under filter')
  })
})
