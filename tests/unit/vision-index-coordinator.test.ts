import { describe, expect, it } from 'vitest'
import { createVisionIndexAbortError, VisionIndexCoordinator } from '../../src/core/ai/vision-index-coordinator'
import type { VisionIndexProgress } from '../../src/shared/vision-types'

const completed: VisionIndexProgress = {
  status: 'completed',
  stage: 'completed',
  totalVideos: 1,
  currentVideoIndex: 1,
  totalFrames: 0,
  processedFrames: 0,
  skippedVideos: 0,
  captionOnlyVideos: 0
}

describe('vision index coordinator', () => {
  it('serializes direct, automatic and inbox callers', async () => {
    const started: string[] = []
    let running = 0
    let maxRunning = 0
    const releases = new Map<string, () => void>()
    const coordinator = new VisionIndexCoordinator(async (paths) => {
      const path = paths[0] ?? ''
      started.push(path)
      running += 1
      maxRunning = Math.max(maxRunning, running)
      await new Promise<void>((resolve) => releases.set(path, resolve))
      running -= 1
      return completed
    })

    const first = coordinator.run(['/first.mp4'], 3, new AbortController().signal, () => undefined)
    const second = coordinator.run(['/second.mp4'], 3, new AbortController().signal, () => undefined)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(started).toEqual(['/first.mp4'])
    expect(maxRunning).toBe(1)

    releases.get('/first.mp4')?.()
    await first
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(started).toEqual(['/first.mp4', '/second.mp4'])
    releases.get('/second.mp4')?.()
    await second
    expect(maxRunning).toBe(1)
    expect(coordinator.isRunning).toBe(false)
  })

  it('cancels active and waiting jobs without allowing a later write', async () => {
    const coordinator = new VisionIndexCoordinator((_paths, _interval, signal) => new Promise<VisionIndexProgress>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(createVisionIndexAbortError()), { once: true })
    }))
    const first = coordinator.run(['/first.mp4'], 3, new AbortController().signal, () => undefined)
    const second = coordinator.run(['/second.mp4'], 3, new AbortController().signal, () => undefined)

    expect(coordinator.cancel()).toBe(true)
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await expect(second).rejects.toMatchObject({ name: 'AbortError' })
    expect(coordinator.isRunning).toBe(false)
  })

  it('passes optional scene evidence settings through the serialized runner', async () => {
    let received: boolean | undefined
    const coordinator = new VisionIndexCoordinator(async (_paths, _interval, _signal, _onProgress, options) => {
      received = options?.includeSceneEvidence
      return completed
    })

    await coordinator.run(['/scene.mp4'], 3, new AbortController().signal, () => undefined, { includeSceneEvidence: true })

    expect(received).toBe(true)
  })
})
