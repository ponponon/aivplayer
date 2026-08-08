import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const readSource = (path: string): string => readFileSync(join(projectRoot, path), 'utf8')

describe('evidence task desktop IPC contract', () => {
  it('exposes start, cancel, capability, and progress channels through preload', () => {
    const channels = readSource('src/shared/ipc-channels.ts')
    const ipc = readSource('src/desktop/ipc-evidence-task.ts')
    const draftIpc = readSource('src/desktop/ipc-evidence-draft.ts')
    const preload = readSource('src/preload/index.ts')
    const main = readSource('src/desktop/index.ts')

    expect(channels).toContain("EVIDENCE_TASK_START: 'evidence-task:start'")
    expect(channels).toContain("EVIDENCE_TASK_CANCEL: 'evidence-task:cancel'")
    expect(channels).toContain("EVIDENCE_TASK_CAPABILITIES: 'evidence-task:capabilities'")
    expect(channels).toContain("EVIDENCE_DRAFT_LIST: 'evidence-draft:list'")
    expect(channels).toContain("EVIDENCE_DRAFT_DELETE: 'evidence-draft:delete'")
    expect(channels).toContain("EVIDENCE_DRAFT_IMPORT: 'evidence-draft:import'")
    expect(ipc).toContain('getSourceFingerprint')
    expect(ipc).toContain('persistOcrResult')
    expect(ipc).toContain("persistenceStatus: 'skipped-stale'")
    expect(ipc).toContain('upsertEvidence')
    expect(ipc).toContain('evidenceTaskAbortControllers')
    expect(preload).toContain('startMediaEvidenceTask')
    expect(preload).toContain('onMediaEvidenceTaskProgress')
    expect(preload).toContain('listMediaEvidenceDrafts')
    expect(preload).toContain('deleteMediaEvidenceDraft')
    expect(preload).toContain('importMediaEvidenceDraft')
    expect(draftIpc).toContain('DRAFT_ID_PATTERN')
    expect(draftIpc).toContain('requiresOverwriteConfirmation')
    expect(draftIpc).toContain('writeAtomic')
    expect(draftIpc).toContain('normalizeMediaEvidenceDraftCues')
    expect(draftIpc).toContain('writeVtt(draft.cues)')
    expect(draftIpc).toContain('writeSrt(draft.cues)')
    expect(main).toContain('registerEvidenceTaskIpc()')
  })
})
