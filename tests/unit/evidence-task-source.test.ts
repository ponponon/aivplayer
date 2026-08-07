import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const readSource = (path: string): string => readFileSync(join(projectRoot, path), 'utf8')

describe('OCR and TTS task contract', () => {
  it('keeps OCR evidence and TTS audio as separate derived artifacts', () => {
    const types = readSource('src/shared/evidence-task-types.ts')
    const task = readSource('src/core/ai/evidence-task.ts')
    expect(types).toContain("MediaEvidenceTaskKind = 'ocr' | 'tts'")
    expect(types).toContain("artifactType: 'ocr-evidence'")
    expect(types).toContain("artifactType: 'tts-audio'")
    expect(task).toContain('toVisionOcrEvidence')
    expect(task).toContain('sourceFingerprint')
    expect(task).toContain("? 'retrying' : 'failed'")
    expect(task).toContain("status: 'cancelled'")
  })
})
