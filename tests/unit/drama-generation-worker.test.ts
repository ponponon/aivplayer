import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DramaGenerationProviderError, DramaGenerationWorker } from '../../src/core/drama/drama-generation-worker'
import { DramaStore } from '../../src/core/drama/drama-store'

describe('drama generation worker', () => {
  let tempDirectory: string
  let store: DramaStore

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-drama-worker-'))
    store = new DramaStore(tempDirectory)
  })

  afterEach(async () => {
    store.close()
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('consumes image and audio channels concurrently and retries a transient provider error', async () => {
    const project = store.createProject({ title: 'Worker 并发' })
    const imageTask = store.createGenerationTask(project.id, { mediaType: 'image', prompt: '角色肖像', maxAttempts: 2 })
    const audioTask = store.createGenerationTask(project.id, { mediaType: 'audio', prompt: '雨声', maxAttempts: 1 })
    const events: string[] = []
    let imageAttempts = 0
    const worker = new DramaGenerationWorker(store, {
      retryDelayMs: 0,
      providers: {
        image: {
          id: 'fake-image',
          async generate({ task }) {
            events.push(`image:start:${task.attempt}`)
            imageAttempts += 1
            if (imageAttempts === 1) throw new Error('temporary image error')
            await delay(10)
            events.push('image:done')
            return { resultPath: '/tmp/character.png', cost: 0.04 }
          }
        },
        audio: {
          id: 'fake-audio',
          async generate() {
            events.push('audio:start')
            await delay(10)
            events.push('audio:done')
            return { resultPath: '/tmp/rain.wav' }
          }
        }
      },
      concurrency: { image: 1, audio: 1 }
    })

    await worker.runProject(project.id)

    expect(store.getGenerationTask(project.id, imageTask.id)).toMatchObject({ status: 'completed', attempt: 2, providerId: 'fake-image', resultPath: '/tmp/character.png', actualCost: 0.04 })
    expect(store.getGenerationTask(project.id, audioTask.id)).toMatchObject({ status: 'completed', attempt: 1, providerId: 'fake-audio', resultPath: '/tmp/rain.wav' })
    expect(events).toContain('audio:start')
    expect(events).toContain('image:start:2')
  })

  it('marks non-retryable provider errors as failed without consuming the retry budget', async () => {
    const project = store.createProject({ title: 'Worker 失败' })
    const task = store.createGenerationTask(project.id, { mediaType: 'video', prompt: '镜头', maxAttempts: 3 })
    const worker = new DramaGenerationWorker(store, {
      retryDelayMs: 0,
      providers: { video: { id: 'fake-video', async generate() { throw new DramaGenerationProviderError('服务未配置', false) } } }
    })

    await worker.runProject(project.id)

    expect(store.getGenerationTask(project.id, task.id)).toMatchObject({ status: 'failed', attempt: 1, maxAttempts: 3, error: '服务未配置' })
  })

  it('persists provider progress and stops cleanly during retry backoff', async () => {
    const project = store.createProject({ title: 'Worker 进度' })
    const progressTask = store.createGenerationTask(project.id, { mediaType: 'image', prompt: '进度测试', maxAttempts: 1 })
    const retryTask = store.createGenerationTask(project.id, { mediaType: 'video', prompt: '退避测试', maxAttempts: 2 })
    const updates: Array<{ id: string; progress: number; message: string }> = []
    let retryAttempts = 0
    const worker = new DramaGenerationWorker(store, {
      retryDelayMs: 1000,
      providers: {
        image: {
          id: 'progress-image',
          async generate({ onProgress }) {
            onProgress?.(0.45, '已完成准备')
            return { resultPath: '/tmp/progress.png' }
          }
        },
        video: {
          id: 'retry-video',
          async generate() {
            retryAttempts += 1
            throw new Error('稍后重试')
          }
        }
      },
      onTask: (task) => updates.push({ id: task.id, progress: task.progress, message: task.message })
    })

    const running = worker.runProject(project.id)
    await waitFor(() => store.getGenerationTask(project.id, retryTask.id)?.status === 'queued' && retryAttempts === 1)
    worker.stop(project.id)
    await running

    expect(store.getGenerationTask(project.id, progressTask.id)).toMatchObject({ status: 'completed', progress: 1 })
    expect(updates).toContainEqual({ id: progressTask.id, progress: 0.45, message: '已完成准备' })
    expect(store.getGenerationTask(project.id, retryTask.id)).toMatchObject({ status: 'queued', attempt: 1, message: '等待恢复' })
  })

  it('cancels an active task and leaves no result path', async () => {
    const project = store.createProject({ title: 'Worker 取消' })
    const task = store.createGenerationTask(project.id, { mediaType: 'image', prompt: '取消测试', maxAttempts: 2 })
    const worker = new DramaGenerationWorker(store, {
      providers: {
        image: {
          id: 'slow-image',
          generate: () => new Promise((resolve) => {
            setTimeout(() => resolve({ resultPath: '/tmp/late-result.png' }), 20)
          })
        }
      }
    })
    const running = worker.runProject(project.id)
    await waitFor(() => store.getGenerationTask(project.id, task.id)?.status === 'running')
    worker.cancelTask(project.id, task.id)
    await running

    expect(store.getGenerationTask(project.id, task.id)).toMatchObject({ status: 'cancelled', resultPath: undefined })
  })
})

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return
    await delay(1)
  }
  throw new Error('等待 Worker 状态超时')
}
