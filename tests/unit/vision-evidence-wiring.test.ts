import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision evidence source wiring', () => {
  it('keeps generic evidence source IPC and preload contracts aligned', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const ipc = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    expect(channels).toContain("VISION_EVIDENCE_SOURCES: 'vision:evidence-sources'")
    expect(channels).toContain("VISION_EVIDENCE_AUDIT: 'vision:evidence-audit'")
    expect(channels).toContain("VISION_EVIDENCE_BATCH_CLEAR: 'vision:evidence-batch-clear'")
    expect(ipc).toContain('VISION_EVIDENCE_SOURCES')
    expect(ipc).toContain('VISION_EVIDENCE_AUDIT')
    expect(ipc).toContain('VISION_EVIDENCE_BATCH_CLEAR')
    expect(ipc).toContain('normalizeVisionEvidenceAuditStatuses')
    expect(ipc).toContain('normalizeVisionEvidenceClearTargets')
    expect(preload).toContain('listVisionEvidenceSources')
    expect(preload).toContain('auditVisionEvidenceSources')
    expect(preload).toContain('clearVisionEvidenceBatch')
  })
})
