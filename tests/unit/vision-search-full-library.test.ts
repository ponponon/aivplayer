import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { VisionLibrary } from '../../src/core/ai/vision-library'

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
  })
})
