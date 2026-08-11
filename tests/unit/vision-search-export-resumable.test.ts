import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeVisionSearchResultsExportResumable } from '../../src/core/ai/vision-search-export-resumable'
import { isVisionSearchExportAbortError } from '../../src/core/ai/vision-search-export'
import type { VisionSearchResult } from '../../src/shared/vision-types'

function result(index: number): VisionSearchResult {
  return { id: `frame-${index}`, sourceId: `source-${index}`, frameId: `frame-${index}`, videoPath: `/media/${index}.mp4`, fileName: `${index}.mp4`, thumbnailPath: `/thumb/${index}.jpg`, timestampSeconds: index, score: 1 - index / 100, modelId: 'model', modelVariant: 'variant' }
}

describe('resumable vision search export', () => {
  it('reuses verified parts after cancellation and atomically finishes output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aivplayer-export-resume-'))
    try {
      const partsDirectory = join(root, 'parts')
      const outputPath = join(root, 'results.json')
      const assemblyPath = join(root, 'results.assembling.json')
      const results = Array.from({ length: 5 }, (_, index) => result(index))
      const controller = new AbortController()
      const firstHashes: Record<string, string> = {}
      let thrown: unknown
      try {
        await writeVisionSearchResultsExportResumable(results, 'json', { outputPath, partsDirectory, assemblyPath, chunkSize: 2, signal: controller.signal, onPartComplete: ({ partIndex, hash }) => {
          firstHashes[String(partIndex)] = hash
          if (partIndex === 0) controller.abort()
        } })
      } catch (error) {
        thrown = error
      }
      expect(isVisionSearchExportAbortError(thrown)).toBe(true)
      expect(await readdir(partsDirectory)).toEqual(['000000.part'])

      const reused: number[] = []
      const completed = await writeVisionSearchResultsExportResumable(results, 'json', { outputPath, partsDirectory, assemblyPath, chunkSize: 2, completedParts: firstHashes, onPartComplete: ({ partIndex, reused: wasReused }) => { if (wasReused) reused.push(partIndex) } })
      expect(reused).toEqual([0])
      expect(completed.partCount).toBe(3)
      expect(JSON.parse(await readFile(outputPath, 'utf8')).results).toEqual(results)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
