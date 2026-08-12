import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision library pagination smoke', () => {
  it('keeps the host fixture aligned with the source pagination contract', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-vision-library-pagination.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:vision-library-pagination']).toContain('smoke-vision-library-pagination.ts')
    expect(smoke).toContain("createTable('video_sources'")
    expect(smoke).toContain('sourceCount = 101')
    expect(smoke).toContain('vision-library-load-more')
    expect(smoke).toContain('duplicateNames')
    expect(smoke).toContain('Renderer errors during vision library pagination smoke')
  })
})
