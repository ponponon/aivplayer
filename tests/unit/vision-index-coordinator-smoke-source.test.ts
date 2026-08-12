import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision index coordinator smoke', () => {
  it('keeps the host fixture aligned with serialized progress and task-center contracts', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-index-coordinator.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-index-coordinator']).toContain('smoke-vision-index-coordinator.ts')
    expect(smoke).toContain('manualCompletedBeforeAutomatic')
    expect(smoke).toContain('maxConcurrentJobs: 1')
    expect(smoke).toContain('onTaskCenterEvent')
    expect(smoke).toContain('secondStartedIndex <= firstCompletedIndex')
  })
})
