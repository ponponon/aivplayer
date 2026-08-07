import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('evidence task Electron smoke contract', () => {
  it('keeps the real IPC, persistence and stale-source assertions wired into npm scripts', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const smoke = readFileSync(join(projectRoot, 'scripts/smoke-evidence-task.ts'), 'utf8')
    expect(packageJson.scripts?.['smoke:evidence-task']).toContain('smoke-evidence-task.ts')
    expect(smoke).toContain('startMediaEvidenceTask')
    expect(smoke).toContain('startOcrFromUi')
    expect(smoke).toContain('searchOcrAndLocate')
    expect(smoke).toContain('data-evidence-type="ocr"')
    expect(smoke).toContain("fill('0.5')")
    expect(smoke).toContain("fill('1.5')")
    expect(smoke).toContain('vision-ocr-start-button')
    expect(smoke).toContain('persistenceStatus')
    expect(smoke).toContain("'skipped-stale'")
    expect(smoke).toContain('video_evidence')
    expect(smoke).toContain('smoke-visual-evidence')
  })
})
