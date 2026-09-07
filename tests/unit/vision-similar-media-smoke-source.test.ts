import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision similar media smoke source', () => {
  it('keeps the real Electron smoke focused on the user-visible candidate report', () => {
    const script = readFileSync(join(projectRoot, 'scripts/smoke-vision-similar-media.ts'), 'utf8')
    const packageJson = readFileSync(join(projectRoot, 'package.json'), 'utf8')
    expect(packageJson).toContain('smoke:vision-similar-media')
    expect(script).toContain('video_sources')
    expect(script).toContain('video_frames')
    expect(script).toContain('vision-similar-scan')
    expect(script).toContain('vision-similar-report')
    expect(script).toContain('groupCount !== 1 || matchCount !== 2')
    expect(script).toContain('视觉相似度')
  })
})
