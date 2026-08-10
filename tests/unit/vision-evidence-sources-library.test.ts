import { appendFile, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from '@lancedb/lancedb'
import { afterEach, describe, expect, it } from 'vitest'
import { VisionLibrary } from '../../src/core/ai/vision-library'
import { createVisionSourceFingerprint } from '../../src/core/ai/vision-evidence'
import type { VisionEvidence } from '../../src/shared/vision-types'

describe('vision evidence source persistence', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  })

  it('clears only selected derived rows and preserves base evidence', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'aivplayer-evidence-sources-'))
    temporaryDirectories.push(userDataPath)
    const library = new VisionLibrary({ userDataPath, resourcePath: join(process.cwd(), 'resources'), env: process.env })
    const createEvidence = (id: string, evidenceType: VisionEvidence['evidenceType']): VisionEvidence => ({
      id,
      sourceId: 'source-one',
      videoPath: '/media/one.mp4',
      fileName: 'one.mp4',
      evidenceType,
      startSeconds: 0,
      endSeconds: 1,
      sourceFingerprint: 'one-v1',
      modelId: 'test-model',
      modelVariant: 'test',
      generatedAt: Number(id.slice(-1))
    })

    for (const evidence of [
      createEvidence('visual-1', 'visual'),
      createEvidence('ocr-2', 'ocr'),
      createEvidence('scene-3', 'scene'),
      createEvidence('entity-4', 'entity'),
      createEvidence('entity-5', 'entity'),
      createEvidence('speaker-6', 'speaker')
    ]) await library.upsertEvidence(evidence)

    expect(await library.listEvidenceSources()).toEqual([{
      videoPath: '/media/one.mp4',
      fileName: 'one.mp4',
      sourceFingerprint: 'one-v1',
      evidenceCounts: { ocr: 1, scene: 1, entity: 2, speaker: 1 },
      generatedAt: 6
    }])

    const cleared = await library.clearEvidenceBatch([{ videoPath: '/media/one.mp4', evidenceTypes: ['entity', 'speaker'] }])
    expect(cleared).toEqual({
      clearedSources: 1,
      clearedEvidenceCount: 3,
      clearedByType: { ocr: 0, scene: 0, entity: 2, speaker: 1 }
    })

    const database = await connect(join(userDataPath, 'library', 'vision', 'lancedb'))
    const rows = await (await database.openTable('video_evidence')).query().toArray() as unknown as Array<{ evidence_type: string }>
    expect(rows.map((row) => row.evidence_type).sort()).toEqual(['ocr', 'scene', 'visual'])
    expect(await library.listEvidenceSources()).toEqual([{
      videoPath: '/media/one.mp4',
      fileName: 'one.mp4',
      sourceFingerprint: 'one-v1',
      evidenceCounts: { ocr: 1, scene: 1, entity: 0, speaker: 0 },
      generatedAt: 3
    }])
  })

  it('audits media changes and missing files without deleting evidence', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'aivplayer-evidence-audit-'))
    temporaryDirectories.push(userDataPath)
    const videoPath = join(userDataPath, 'one.mp4')
    await writeFile(videoPath, 'initial-media')
    const initialStat = await stat(videoPath)
    const library = new VisionLibrary({ userDataPath, resourcePath: join(process.cwd(), 'resources'), env: process.env })
    await library.upsertEvidence({
      id: 'ocr-1',
      sourceId: 'source-one',
      videoPath,
      fileName: 'one.mp4',
      evidenceType: 'ocr',
      startSeconds: 0,
      endSeconds: 1,
      sourceFingerprint: createVisionSourceFingerprint(videoPath, initialStat.size, initialStat.mtimeMs),
      modelId: 'test-model',
      modelVariant: 'test',
      generatedAt: 1
    })

    expect((await library.auditEvidenceSources())[0]).toMatchObject({ auditStatus: 'current', videoPath })
    await appendFile(videoPath, '-changed')
    expect((await library.auditEvidenceSources())[0]).toMatchObject({ auditStatus: 'changed', videoPath })
    await rm(videoPath)
    expect((await library.auditEvidenceSources())[0]).toMatchObject({ auditStatus: 'missing', videoPath })
    expect(await library.listEvidenceSources()).toHaveLength(1)
  })
})
