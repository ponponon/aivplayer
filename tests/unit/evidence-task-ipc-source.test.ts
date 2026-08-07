import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const readSource = (path: string): string => readFileSync(join(projectRoot, path), 'utf8')

describe('evidence task desktop IPC contract', () => {
  it('exposes start, cancel, capability, and progress channels through preload', () => {
    const channels = readSource('src/shared/ipc-channels.ts')
    const ipc = readSource('src/desktop/ipc-evidence-task.ts')
    const preload = readSource('src/preload/index.ts')
    const main = readSource('src/desktop/index.ts')

    expect(channels).toContain("EVIDENCE_TASK_START: 'evidence-task:start'")
    expect(channels).toContain("EVIDENCE_TASK_CANCEL: 'evidence-task:cancel'")
    expect(channels).toContain("EVIDENCE_TASK_CAPABILITIES: 'evidence-task:capabilities'")
    expect(ipc).toContain('getSourceFingerprint')
    expect(ipc).toContain('evidenceTaskAbortControllers')
    expect(preload).toContain('startMediaEvidenceTask')
    expect(preload).toContain('onMediaEvidenceTaskProgress')
    expect(main).toContain('registerEvidenceTaskIpc()')
  })
})
