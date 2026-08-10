import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from '@lancedb/lancedb'
import { afterEach, describe, expect, it } from 'vitest'
import { VisionLibrary } from '../../src/core/ai/vision-library'
import { VISION_MODEL_ID, VISION_MODEL_VARIANT } from '../../src/shared/vision-types'
import { isVisionSearchRevisionUnavailableError } from '../../src/shared/vision-search-revision'

describe('vision full-library search', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  })

  it('returns more than the interactive 100-result window with deterministic lexical ordering', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'aivplayer-full-search-'))
    temporaryDirectories.push(userDataPath)
    const library = new VisionLibrary({ userDataPath, resourcePath: join(process.cwd(), 'resources'), env: process.env })
    for (let index = 0; index < 120; index += 1) {
      await library.upsertEvidence({
        id: `ocr-${String(index).padStart(3, '0')}`,
        sourceId: `source-${index}`,
        videoPath: `/media/${index}.mp4`,
        fileName: `${index}.mp4`,
        evidenceType: 'ocr',
        startSeconds: 0,
        endSeconds: 1,
        text: 'person',
        frameId: `frame-${index}`,
        thumbnailPath: `/thumb/${index}.jpg`,
        sourceFingerprint: `fingerprint-${index}`,
        modelId: 'test-model',
        modelVariant: 'test-variant',
        generatedAt: index
      })
    }

    const runtime = (library as unknown as { model: { getTextEmbedding: () => Promise<number[]> } }).model
    runtime.getTextEmbedding = async () => { throw new Error('offline test model') }
    const first = await library.searchTextAll('person')
    const second = await library.searchTextAll('person')

    expect(first).toHaveLength(120)
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id))
    expect(first[0]?.id).toBe('ocr-000')
    expect(first.at(-1)?.id).toBe('ocr-119')

    const controller = new AbortController()
    controller.abort()
    await expect(library.searchTextAll('person', 'hybrid', undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('scans and deterministically sorts every visual frame when the query is visual', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'aivplayer-full-visual-search-'))
    temporaryDirectories.push(userDataPath)
    const database = await connect(join(userDataPath, 'library', 'vision', 'lancedb'))
    await database.createTable('video_frames', [
      { id: 'frame-c', video_path: '/media/c.mp4', file_name: 'c.mp4', timestamp_seconds: 1, thumbnail_path: '/thumb/c.jpg', embedding: [1, 0], model_id: VISION_MODEL_ID, model_variant: VISION_MODEL_VARIANT, file_size_bytes: 1, file_mtime_ms: 1 },
      { id: 'frame-b', video_path: '/media/b.mp4', file_name: 'b.mp4', timestamp_seconds: 1, thumbnail_path: '/thumb/b.jpg', embedding: [0.2, 0.98], model_id: VISION_MODEL_ID, model_variant: VISION_MODEL_VARIANT, file_size_bytes: 1, file_mtime_ms: 1 },
      { id: 'frame-a', video_path: '/media/a.mp4', file_name: 'a.mp4', timestamp_seconds: 1, thumbnail_path: '/thumb/a.jpg', embedding: [1, 0], model_id: VISION_MODEL_ID, model_variant: VISION_MODEL_VARIANT, file_size_bytes: 1, file_mtime_ms: 1 }
    ])
    const library = new VisionLibrary({ userDataPath, resourcePath: join(process.cwd(), 'resources'), env: process.env })
    const runtime = (library as unknown as { model: { getTextEmbedding: () => Promise<number[]> } }).model
    runtime.getTextEmbedding = async () => [1, 0]

    const results = await library.searchTextAll('unused query', 'visual')

    expect(results.map((item) => item.id)).toEqual(['frame-a', 'frame-c', 'frame-b'])
  })

  it('reads lexical results from a pinned LanceDB revision', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'aivplayer-full-search-revision-'))
    temporaryDirectories.push(userDataPath)
    const library = new VisionLibrary({ userDataPath, resourcePath: join(process.cwd(), 'resources'), env: process.env })
    await library.upsertEvidence({
      id: 'ocr-v1', sourceId: 'source-v1', videoPath: '/media/v1.mp4', fileName: 'v1.mp4', evidenceType: 'ocr',
      startSeconds: 0, endSeconds: 1, text: 'person', frameId: 'frame-v1', thumbnailPath: '/thumb/v1.jpg',
      sourceFingerprint: 'v1', modelId: 'test-model', modelVariant: 'test', generatedAt: 1
    })
    const revision = await library.getSearchRevision()
    await library.upsertEvidence({
      id: 'ocr-v2', sourceId: 'source-v2', videoPath: '/media/v2.mp4', fileName: 'v2.mp4', evidenceType: 'ocr',
      startSeconds: 0, endSeconds: 1, text: 'person', frameId: 'frame-v2', thumbnailPath: '/thumb/v2.jpg',
      sourceFingerprint: 'v2', modelId: 'test-model', modelVariant: 'test', generatedAt: 2
    })

    const runtime = (library as unknown as { model: { getTextEmbedding: () => Promise<number[]> } }).model
    runtime.getTextEmbedding = async () => { throw new Error('offline test model') }
    const currentResults = await library.searchTextAll('person')
    const pinnedResults = await library.searchTextAll('person', 'hybrid', undefined, undefined, revision)

    expect(currentResults.map((item) => item.id)).toEqual(['ocr-v1', 'ocr-v2'])
    expect(pinnedResults.map((item) => item.id)).toEqual(['ocr-v1'])
    expect(revision.tables.video_evidence).toEqual(expect.any(Number))
  })

  it('reports the table and version when a pinned revision is unavailable', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'aivplayer-full-search-unavailable-'))
    temporaryDirectories.push(userDataPath)
    const library = new VisionLibrary({ userDataPath, resourcePath: join(process.cwd(), 'resources'), env: process.env })
    await library.upsertEvidence({
      id: 'ocr-before-cleanup', sourceId: 'source-before-cleanup', videoPath: '/media/before-cleanup.mp4', fileName: 'before-cleanup.mp4', evidenceType: 'ocr',
      startSeconds: 0, endSeconds: 1, text: 'person', frameId: 'frame-before-cleanup', thumbnailPath: '/thumb/before-cleanup.jpg',
      sourceFingerprint: 'before-cleanup', modelId: 'test-model', modelVariant: 'test', generatedAt: 1
    })
    const revision = await library.getSearchRevision()
    const unavailableVersion = (revision.tables.video_evidence ?? 0) + 999_999
    const unavailableRevision = {
      ...revision,
      tables: { ...revision.tables, video_evidence: unavailableVersion }
    }
    const runtime = (library as unknown as { model: { getTextEmbedding: () => Promise<number[]> } }).model
    runtime.getTextEmbedding = async () => { throw new Error('offline test model') }

    let caught: unknown
    try {
      await library.searchTextAll('person', 'hybrid', undefined, undefined, unavailableRevision)
    } catch (error) {
      caught = error
    }
    expect(isVisionSearchRevisionUnavailableError(caught)).toBe(true)
    if (isVisionSearchRevisionUnavailableError(caught)) {
      expect(caught.tableName).toBe('video_evidence')
      expect(caught.version).toBe(unavailableVersion)
    }
  })
})
