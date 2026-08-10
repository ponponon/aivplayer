import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('drama generation Electron Smoke', () => {
  it('keeps the local fixture, queue and restart assertions wired', () => {
    const projectRoot = process.cwd()
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-drama-generation.ts'), 'utf8')

    expect(packageJson.scripts?.['smoke:drama-generation']).toContain('smoke-drama-generation.ts')
    expect(smoke).toContain("window.aiv.runDramaGenerationQueue")
    expect(smoke).toContain("window.aiv.getTaskCenterEvents")
    expect(smoke).toContain('resultUrl')
    expect(smoke).toContain('重启恢复异常')
    expect(smoke).toContain("server.listen(0, '127.0.0.1'")
    expect(smoke).not.toContain('AIVPLAYER_DRAMA_API_KEY')
  })
})
