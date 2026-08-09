import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MediaImportInboxStore } from '../../src/core/media/media-import-inbox'
import { MediaImportInboxProcessor } from '../../src/core/media/media-import-inbox-processor'
import type { MediaImportInboxFile, MediaImportInboxPipelineProgress } from '../../src/shared/media-import-inbox'
import type { MediaProbeMetadata } from '../../src/shared/media-types'
import type { VisionIndexProgress } from '../../src/shared/vision-types'

const completedProgress: VisionIndexProgress = {
  status: 'completed',
  stage: 'completed',
  totalVideos: 1,
  currentVideoIndex: 1,
  totalFrames: 2,
  processedFrames: 2,
  skippedVideos: 0,
  captionOnlyVideos: 0,
  message: '索引完成'
}

const metadata: MediaProbeMetadata = {
  fileSizeBytes: 20,
  durationSeconds: 12,
  overallBitrateKbps: 500,
  video: null,
  audio: null,
  chapters: [],
  probeSource: null,
  details: null
}

function createFile(path: string): MediaImportInboxFile {
  return { path, fileName: 'movie.mp4', directoryPath: join(path, '..'), sizeBytes: 20, mtimeMs: 1_700_000_000_000 }
}

async function waitForIdle(processor: MediaImportInboxProcessor): Promise<void> {
  while (processor.isRunning) await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('media import inbox processor', () => {
  it('runs metadata, subtitle and vision stages before marking an item ready', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-media-inbox-processor-'))
    try {
      const store = new MediaImportInboxStore(directory)
      const [item] = store.reconcile([createFile(join(directory, 'movie.mp4'))], [directory], 100)
      store.transition(item.id, 'queued', undefined, 110)
      const progress: MediaImportInboxPipelineProgress[] = []
      const processor = new MediaImportInboxProcessor({
        store,
        getMediaMetadata: async () => metadata,
        resolveSubtitle: async () => null,
        runVisionIndex: async (_path, _signal, onProgress) => {
          onProgress({ ...completedProgress, status: 'indexing', stage: 'frames', message: '正在抽帧' })
          return completedProgress
        },
        onProgress: (next) => progress.push(next),
        now: () => 200
      })

      expect(processor.enqueue(item.id)).toBe(true)
      await waitForIdle(processor)

      const result = store.listItems()[0]
      expect(result.status).toBe('ready')
      expect(result.pipeline).toEqual({ metadata: 'ready', subtitle: 'skipped', vision: 'ready' })
      expect(progress.map((next) => `${next.stage}:${next.status}`)).toEqual([
        'metadata:processing',
        'metadata:ready',
        'subtitle:processing',
        'subtitle:skipped',
        'vision:processing',
        'vision:processing',
        'vision:ready'
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('persists a retryable failure when the visual index runner fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-media-inbox-processor-failure-'))
    try {
      const store = new MediaImportInboxStore(directory)
      const [item] = store.reconcile([createFile(join(directory, 'movie.mp4'))], [directory], 100)
      store.transition(item.id, 'queued', undefined, 110)
      const processor = new MediaImportInboxProcessor({
        store,
        getMediaMetadata: async () => metadata,
        resolveSubtitle: async () => ({ status: 'invalid', path: '/tmp/movie.vtt', revision: 1, reason: 'no-cues' }),
        runVisionIndex: async () => { throw new Error('视觉模型未就绪') },
        now: () => 200
      })

      expect(processor.enqueue(item.id)).toBe(true)
      await waitForIdle(processor)

      const result = store.listItems()[0]
      expect(result.status).toBe('failed')
      expect(result.pipeline).toEqual({ metadata: 'ready', subtitle: 'failed', vision: 'failed' })
      expect(result.lastError).toBe('视觉模型未就绪')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
