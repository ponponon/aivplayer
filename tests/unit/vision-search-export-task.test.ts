import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isVisionSearchExportAbortError, writeVisionSearchResultsExportInChunks } from '../../src/core/ai/vision-search-export'
import type { VisionSearchResult } from '../../src/shared/vision-types'

function result(index: number): VisionSearchResult {
  return {
    id: `frame-${index}`,
    sourceId: `source-${index}`,
    frameId: `frame-${index}`,
    videoPath: `/media/video-${index}.mp4`,
    fileName: `video-${index}.mp4`,
    thumbnailPath: `/tmp/thumb-${index}.jpg`,
    timestampSeconds: index,
    score: 1 - index / 1_000,
    modelId: 'model',
    modelVariant: 'variant'
  }
}

describe('vision search export task writer', () => {
  it('writes valid JSON and CSV in chunks', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.tmp-vision-export-'))
    try {
      const results = [result(0), result(1), result(2)]
      const jsonPath = join(directory, 'results.json')
      const csvPath = join(directory, 'results.csv')
      const progress: number[] = []
      await writeVisionSearchResultsExportInChunks(jsonPath, results, 'json', undefined, (value) => progress.push(value.writtenCount), 2)
      await writeVisionSearchResultsExportInChunks(csvPath, results, 'csv', undefined, undefined, 2)

      expect(JSON.parse(await readFile(jsonPath, 'utf8'))).toMatchObject({ exportVersion: 1, results })
      expect(await readFile(csvPath, 'utf8')).toContain('index,evidence_id,evidence_type')
      expect(await readFile(csvPath, 'utf8')).toContain('1,,,source-0,frame-0')
      expect(progress).toEqual([0, 2, 3])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('stops between chunks when cancelled', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.tmp-vision-export-'))
    try {
      const controller = new AbortController()
      const outputPath = join(directory, 'cancelled.json')
      let thrown: unknown
      try {
        await writeVisionSearchResultsExportInChunks(outputPath, Array.from({ length: 3 }, (_, index) => result(index)), 'json', controller.signal, (value) => {
          if (value.writtenCount > 0) controller.abort()
        }, 1)
      } catch (error) {
        thrown = error
      }
      expect(isVisionSearchExportAbortError(thrown)).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
