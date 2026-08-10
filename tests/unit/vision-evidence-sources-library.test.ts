import { appendFile, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from '@lancedb/lancedb'
import { afterEach, describe, expect, it } from 'vitest'
import { VisionLibrary } from '../../src/core/ai/vision-library'
import { createVisionSourceFingerprint } from '../../src/core/ai/vision-evidence'
import { VISION_MODEL_ID, VISION_MODEL_VARIANT, type VisionEvidence } from '../../src/shared/vision-types'
import type { VisionObjectDetectionModelStatus, VisionObjectDetectionResult } from '../../src/shared/vision-object-detection-types'

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
      box: evidenceType === 'object' ? { xmin: 10, ymin: 20, xmax: 80, ymax: 90 } : undefined,
      generatedAt: Number(id.slice(-1))
    })

    for (const evidence of [
      createEvidence('visual-1', 'visual'),
      createEvidence('ocr-2', 'ocr'),
      createEvidence('scene-3', 'scene'),
      createEvidence('entity-4', 'entity'),
      createEvidence('entity-5', 'entity'),
      createEvidence('object-7', 'object'),
      createEvidence('speaker-6', 'speaker')
    ]) await library.upsertEvidence(evidence)

    expect(await library.listEvidenceSources()).toEqual([{
      videoPath: '/media/one.mp4',
      fileName: 'one.mp4',
      sourceFingerprint: 'one-v1',
      evidenceCounts: { ocr: 1, scene: 1, entity: 2, object: 1, speaker: 1 },
      generatedAt: 7
    }])

    const cleared = await library.clearEvidenceBatch([{ videoPath: '/media/one.mp4', evidenceTypes: ['entity', 'object', 'speaker'] }])
    expect(cleared).toEqual({
      clearedSources: 1,
      clearedEvidenceCount: 4,
      clearedByType: { ocr: 0, scene: 0, entity: 2, object: 1, speaker: 1 }
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

  it('migrates an old evidence table before storing detection boxes', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'aivplayer-evidence-migration-'))
    temporaryDirectories.push(userDataPath)
    const databasePath = join(userDataPath, 'library', 'vision', 'lancedb')
    const database = await connect(databasePath)
    await database.createTable('video_evidence', [{
      id: 'visual-old',
      source_id: 'source-old',
      video_path: '/media/old.mp4',
      file_name: 'old.mp4',
      evidence_type: 'visual',
      start_seconds: 0,
      end_seconds: 1,
      text: '',
      frame_id: 'frame-old',
      thumbnail_path: '/thumb/old.jpg',
      confidence: 0,
      source_fingerprint: 'old-v1',
      model_id: 'test-model',
      model_variant: 'test',
      generated_at: 1
    }])

    const library = new VisionLibrary({ userDataPath, resourcePath: join(process.cwd(), 'resources'), env: process.env })
    await library.upsertEvidence({
      id: 'object-new',
      sourceId: 'source-old',
      videoPath: '/media/old.mp4',
      fileName: 'old.mp4',
      evidenceType: 'object',
      startSeconds: 0,
      endSeconds: 1,
      text: 'person',
      frameId: 'frame-old',
      thumbnailPath: '/thumb/old.jpg',
      confidence: 0.9,
      box: { xmin: 10, ymin: 20, xmax: 80, ymax: 90 },
      sourceFingerprint: 'old-v1',
      modelId: 'detector',
      modelVariant: 'v1',
      generatedAt: 2
    })

    const migratedTable = await (await connect(databasePath)).openTable('video_evidence')
    const rows = await migratedTable.query().select(['id', 'evidence_type', 'box_xmin', 'box_ymin', 'box_xmax', 'box_ymax']).toArray() as unknown as Array<Record<string, unknown>>
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'visual-old', evidence_type: 'visual', box_xmin: null, box_ymin: null, box_xmax: null, box_ymax: null }),
      expect.objectContaining({ id: 'object-new', evidence_type: 'object', box_xmin: 10, box_ymin: 20, box_xmax: 80, box_ymax: 90 })
    ]))
  })

  it('runs the optional object evidence stage against existing thumbnails', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'aivplayer-object-index-'))
    temporaryDirectories.push(userDataPath)
    const videoPath = join(userDataPath, 'demo.mp4')
    await writeFile(videoPath, 'indexed-video')
    const videoStat = await stat(videoPath)
    const database = await connect(join(userDataPath, 'library', 'vision', 'lancedb'))
    await database.createTable('video_sources', [{
      id: 'source-demo',
      video_path: videoPath,
      file_name: 'demo.mp4',
      file_size_bytes: videoStat.size,
      file_mtime_ms: videoStat.mtimeMs,
      sample_interval_seconds: 3,
      subtitle_path: '',
      subtitle_size_bytes: 0,
      subtitle_mtime_ms: 0,
      frame_count: 1,
      model_id: VISION_MODEL_ID,
      model_variant: VISION_MODEL_VARIANT,
      indexed_at_ms: 1
    }])
    await database.createTable('video_frames', [{
      id: 'frame-demo',
      video_path: videoPath,
      file_name: 'demo.mp4',
      timestamp_seconds: 1,
      thumbnail_path: '/thumb/demo.jpg',
      embedding: [0.1, 0.2],
      model_id: VISION_MODEL_ID,
      model_variant: VISION_MODEL_VARIANT,
      file_size_bytes: videoStat.size,
      file_mtime_ms: videoStat.mtimeMs
    }])

    const detectionResult: VisionObjectDetectionResult = {
      providerId: 'transformers-object-detection',
      modelId: 'detector-test',
      modelVersion: 'test-v1',
      imagePath: '/thumb/demo.jpg',
      threshold: 0.5,
      detections: [{ label: 'person', score: 0.9, box: { xmin: 1, ymin: 2, xmax: 30, ymax: 40 } }],
      generatedAt: 123
    }
    let prepared = 0
    const detectedImages: string[] = []
    const library = new VisionLibrary({
      userDataPath,
      resourcePath: join(process.cwd(), 'resources'),
      env: process.env,
      objectDetectionRuntime: {
        getStatus: () => ({ available: true, message: 'ready' } as VisionObjectDetectionModelStatus),
        prepare: async () => { prepared += 1 },
        detectImage: async (imagePath) => {
          detectedImages.push(imagePath)
          return detectionResult
        }
      }
    })
    const progressEvents: string[] = []
    const progress = await library.indexVideos([videoPath], 3, new AbortController().signal, (value) => { progressEvents.push(value.stage) }, { includeObjectEvidence: true })

    expect(prepared).toBe(1)
    expect(detectedImages).toEqual(['/thumb/demo.jpg'])
    expect(progress.status).toBe('completed')
    expect(progress.objectEvidenceCount).toBe(1)
    expect(progressEvents).toContain('object-evidence')
    const resultDatabase = await connect(join(userDataPath, 'library', 'vision', 'lancedb'))
    const resultTable = await resultDatabase.openTable('video_evidence')
    const rows = await resultTable.query().select(['evidence_type', 'text', 'confidence', 'box_xmin', 'box_ymin', 'box_xmax', 'box_ymax']).toArray() as unknown as Array<Record<string, unknown>>
    expect(rows).toEqual([expect.objectContaining({ evidence_type: 'object', text: 'person', confidence: 0.9, box_xmin: 1, box_ymin: 2, box_xmax: 30, box_ymax: 40 })])
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
