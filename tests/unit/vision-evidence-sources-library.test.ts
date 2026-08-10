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
      evidenceCounts: { ocr: 1, scene: 1, entity: 2, object: 0, speaker: 1 },
      generatedAt: 6
    }])

    const cleared = await library.clearEvidenceBatch([{ videoPath: '/media/one.mp4', evidenceTypes: ['entity', 'speaker'] }])
    expect(cleared).toEqual({
      clearedSources: 1,
      clearedEvidenceCount: 3,
      clearedByType: { ocr: 0, scene: 0, entity: 2, object: 0, speaker: 1 }
    })

    const database = await connect(join(userDataPath, 'library', 'vision', 'lancedb'))
    const rows = await (await database.openTable('video_evidence')).query().toArray() as unknown as Array<{ evidence_type: string }>
    expect(rows.map((row) => row.evidence_type).sort()).toEqual(['ocr', 'scene', 'visual'])
    expect(await library.listEvidenceSources()).toEqual([{
      videoPath: '/media/one.mp4',
      fileName: 'one.mp4',
      sourceFingerprint: 'one-v1',
      evidenceCounts: { ocr: 1, scene: 1, entity: 0, object: 0, speaker: 0 },
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

    expect((await library.auditEvidenceSources()).sources[0]).toMatchObject({ auditStatus: 'current', videoPath })
    await appendFile(videoPath, '-changed')
    expect((await library.auditEvidenceSources()).sources[0]).toMatchObject({ auditStatus: 'changed', videoPath })
    await rm(videoPath)
    expect((await library.auditEvidenceSources()).sources[0]).toMatchObject({ auditStatus: 'missing', videoPath })
    expect(await library.listEvidenceSources()).toHaveLength(1)
  })

  it('continues auditing beyond one source page when a status filter is active', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'aivplayer-evidence-audit-page-'))
    temporaryDirectories.push(userDataPath)
    const library = new VisionLibrary({ userDataPath, resourcePath: join(process.cwd(), 'resources'), env: process.env })
    await library.upsertEvidence({
      id: 'ocr-0',
      sourceId: 'source-0',
      videoPath: '/missing/0.mp4',
      fileName: '0.mp4',
      evidenceType: 'ocr',
      startSeconds: 0,
      endSeconds: 1,
      sourceFingerprint: 'missing-0',
      modelId: 'test-model',
      modelVariant: 'test',
      generatedAt: 500
    })
    const database = await connect(join(userDataPath, 'library', 'vision', 'lancedb'))
    const table = await database.openTable('video_evidence')
    await table.add(Array.from({ length: 500 }, (_, index) => ({
      id: `ocr-${index + 1}`,
      source_id: `source-${index + 1}`,
      video_path: `/missing/${index + 1}.mp4`,
      file_name: `${index + 1}.mp4`,
      evidence_type: 'ocr',
      start_seconds: 0,
      end_seconds: 1,
      text: '',
      frame_id: '',
      thumbnail_path: '',
      confidence: null,
      source_fingerprint: `missing-${index + 1}`,
      model_id: 'test-model',
      model_variant: 'test',
      generated_at: 499 - index
    })))

    const page = await library.auditEvidenceSources(1, 500, undefined, ['missing'])
    expect(page).toMatchObject({ offset: 500, limit: 1, hasMore: false })
    expect(page.sources).toHaveLength(1)
    expect(page.sources[0]).toMatchObject({ videoPath: '/missing/500.mp4', auditStatus: 'missing' })
  })
})
