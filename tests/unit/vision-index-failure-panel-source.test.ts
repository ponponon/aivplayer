import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = join(__dirname, '../..')

describe('vision index failure panel wiring', () => {
  it('loads failures on startup and exposes single and batch retry actions', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')

    expect(panel).toContain('listVisionIndexFailures')
    expect(panel).toContain('retryVisionIndexFailure')
    expect(panel).toContain('retryVisionIndexFailures')
    expect(panel).toContain('<VisionIndexFailures')
    expect(panel).toContain('refreshFailures()')
    expect(panel).toContain("next.status === 'error'")
  })
})
