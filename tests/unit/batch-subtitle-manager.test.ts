import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AsrRuntime } from '../../src/main/ai/asr-runtime'
import { BatchSubtitleManager } from '../../src/main/ai/batch-subtitle-manager'
import type { BatchSubtitleJob, MediaFile } from '../../src/shared/media-types'

function createFile(name: string): MediaFile {
  return {
    id: name,
    name,
    path: `/videos/${name}`,
    url: `media://${name}`,
    extension: 'mp4'
  }
}

async function waitForJob(
  manager: BatchSubtitleManager,
  predicate: (job: BatchSubtitleJob) => boolean
): Promise<BatchSubtitleJob> {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= 2_000) {
    const job = await manager.getCurrent()
    if (job && predicate(job)) {
      return job
    }

    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  throw new Error('Timed out waiting for batch task')
}

describe('batch subtitle manager', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-batch-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('processes files serially and continues after an individual failure', async () => {
    const calls: string[] = []
    let active = 0
    let maxActive = 0
    const runtime = {
      generateSubtitle: async (request: { mediaPath: string }, onProgress?: (progress: { percent: number; stage: 'transcribing'; message: string }) => void) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        calls.push(`asr:${request.mediaPath}`)
        onProgress?.({ stage: 'transcribing', percent: 0.5, message: 'transcribing' })
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1

        if (request.mediaPath.endsWith('bad.mp4')) {
          return { success: false, message: 'ASR failed' }
        }

        return {
          success: true,
          message: 'generated',
          subtitlePath: `${request.mediaPath}.vtt`,
          subtitleSrtPath: `${request.mediaPath}.srt`,
          subtitleLanguage: 'en',
          generationStats: { elapsedMs: 5, subtitleCueCount: 1, cacheHit: false }
        }
      },
      translateSubtitle: async (request: { subtitlePath: string }, options?: { onProgress?: (progress: { percent: number; stage: 'translating'; message: string }) => void }) => {
        calls.push(`translate:${request.subtitlePath}`)
        options?.onProgress?.({ stage: 'translating', percent: 1, message: 'translated' })
        return {
          success: true,
          message: 'translated',
          subtitlePath: `${request.subtitlePath}.zh.vtt`,
          translationStats: { elapsedMs: 3, subtitleCueCount: 1, translationBatchCount: 1, cacheHit: false }
        }
      }
    } as unknown as AsrRuntime

    const manager = new BatchSubtitleManager({
      runtime,
      stateFilePath: join(tempDirectory, 'batch.json'),
      emit: () => undefined
    })

    await manager.start({
      rootPath: '/videos',
      files: [createFile('01-good.mp4'), createFile('02-bad.mp4'), createFile('03-good.mp4')],
      targetLanguage: 'zh',
      onlyMissing: false
    })

    const job = await waitForJob(manager, (currentJob) => currentJob.status === 'completed')

    expect(maxActive).toBe(1)
    expect(calls).toEqual([
      'asr:/videos/01-good.mp4',
      'translate:/videos/01-good.mp4.vtt',
      'asr:/videos/02-bad.mp4',
      'asr:/videos/03-good.mp4',
      'translate:/videos/03-good.mp4.vtt'
    ])
    expect(job.summary).toMatchObject({ total: 3, completed: 2, failed: 1 })
    expect(job.items.map((item) => item.status)).toEqual(['completed', 'failed', 'completed'])
  })

  it('retries only failed items and persists the latest task state', async () => {
    let shouldFail = true
    const runtime = {
      generateSubtitle: async (request: { mediaPath: string }) => {
        if (shouldFail) {
          shouldFail = false
          return { success: false, message: 'temporary ASR error' }
        }

        return {
          success: true,
          message: 'generated',
          subtitlePath: `${request.mediaPath}.vtt`,
          subtitleLanguage: 'zh',
          generationStats: { elapsedMs: 2, subtitleCueCount: 1, cacheHit: false }
        }
      },
      translateSubtitle: async () => {
        throw new Error('translation should be skipped for matching language')
      }
    } as unknown as AsrRuntime

    const manager = new BatchSubtitleManager({
      runtime,
      stateFilePath: join(tempDirectory, 'batch.json'),
      emit: () => undefined
    })

    await manager.start({ rootPath: '/videos', files: [createFile('only.mp4')], targetLanguage: 'zh', onlyMissing: false })
    await waitForJob(manager, (job) => job.status === 'completed' && job.summary.failed === 1)

    await manager.retryFailed()
    const persisted = await waitForJob(manager, (job) => job.status === 'completed' && job.summary.failed === 0)

    expect(persisted.status).toBe('completed')
    expect(persisted.summary.completed).toBe(1)
    expect(persisted.items[0]?.attempts).toBe(2)
  })

  it('keeps ASR single-threaded while allowing configured translation concurrency', async () => {
    let activeAsr = 0
    let maxActiveAsr = 0
    let activeTranslations = 0
    let maxActiveTranslations = 0
    const runtime = {
      generateSubtitle: async (request: { mediaPath: string }) => {
        activeAsr += 1
        maxActiveAsr = Math.max(maxActiveAsr, activeAsr)
        await new Promise((resolve) => setTimeout(resolve, 10))
        activeAsr -= 1
        return {
          success: true,
          message: 'generated',
          subtitlePath: `${request.mediaPath}.vtt`,
          subtitleLanguage: 'en',
          generationStats: { elapsedMs: 10, subtitleCueCount: 1, cacheHit: false }
        }
      },
      translateSubtitle: async (request: { subtitlePath: string }) => {
        activeTranslations += 1
        maxActiveTranslations = Math.max(maxActiveTranslations, activeTranslations)
        await new Promise((resolve) => setTimeout(resolve, 15))
        activeTranslations -= 1
        return {
          success: true,
          message: `translated ${request.subtitlePath}`,
          subtitlePath: `${request.subtitlePath}.zh.vtt`,
          translationStats: { elapsedMs: 15, subtitleCueCount: 1, translationBatchCount: 1, cacheHit: false }
        }
      }
    } as unknown as AsrRuntime

    const manager = new BatchSubtitleManager({
      runtime,
      stateFilePath: join(tempDirectory, 'batch.json'),
      emit: () => undefined
    })

    await manager.start({
      rootPath: '/videos',
      files: [createFile('01.mp4'), createFile('02.mp4'), createFile('03.mp4')],
      targetLanguage: 'zh',
      onlyMissing: false,
      maxConcurrent: 2
    })

    const job = await waitForJob(manager, (currentJob) => currentJob.status === 'completed')

    expect(job.maxConcurrent).toBe(2)
    expect(maxActiveAsr).toBe(1)
    expect(maxActiveTranslations).toBe(2)
  })

  it('skips existing source and translated caches and writes a structured log', async () => {
    const runtime = {
      resolveSubtitleCache: async () => ({
        success: true,
        message: 'cache hit',
        subtitlePath: '/cache/video.vtt',
        subtitleSrtPath: '/cache/video.srt',
        subtitleLanguage: 'en'
      }),
      resolveTranslatedSubtitleCache: async () => ({
        success: true,
        message: 'translation cache hit',
        subtitlePath: '/cache/video.zh.vtt',
        subtitleSrtPath: '/cache/video.zh.srt'
      }),
      generateSubtitle: async () => {
        throw new Error('ASR should not run for a cached item')
      },
      translateSubtitle: async () => {
        throw new Error('translation should not run for a cached item')
      }
    } as unknown as AsrRuntime
    const logDirectory = join(tempDirectory, 'logs')
    const manager = new BatchSubtitleManager({
      runtime,
      stateFilePath: join(tempDirectory, 'batch.json'),
      logDirectoryPath: logDirectory,
      emit: () => undefined
    })

    await manager.start({ rootPath: '/videos', files: [createFile('cached.mp4')], targetLanguage: 'zh' })
    const job = await waitForJob(manager, (currentJob) => currentJob.status === 'completed')
    const log = await readFile(join(logDirectory, `${job.id}.jsonl`), 'utf8')

    expect(job.items[0]).toMatchObject({ status: 'completed', cacheHit: true, asrElapsedMs: 0, translationElapsedMs: 0 })
    expect(log).toContain('"event":"task-started"')
    expect(log).toContain('"event":"file-completed"')
  })
})
