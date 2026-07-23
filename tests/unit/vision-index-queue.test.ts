import { describe, expect, it } from 'vitest'
import type { VisionIndexProgress } from '../../src/shared/vision-types'
import { VisionIndexQueue } from '../../src/main/ai/vision-index-queue'

const completedProgress: VisionIndexProgress = {
  status: 'completed',
  totalVideos: 1,
  currentVideoIndex: 1,
  totalFrames: 0,
  processedFrames: 0,
  skippedVideos: 0,
  captionOnlyVideos: 0
}

async function waitForIdle(queue: VisionIndexQueue): Promise<void> {
  while (queue.isRunning) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('vision index queue', () => {
  it('deduplicates paths within a batch and drains paths added while running', async () => {
    const runs: string[][] = []
    const queue = new VisionIndexQueue(async (paths) => {
      runs.push(paths)
      return completedProgress
    })

    queue.enqueue(['/video/a.mp4', '/video/a.mp4'], 3, () => undefined)
    queue.enqueue(['/video/a.mp4', '/video/b.mp4'], 3, () => undefined)
    await waitForIdle(queue)

    expect(runs).toEqual([
      ['/video/a.mp4'],
      ['/video/a.mp4', '/video/b.mp4']
    ])
  })

  it('cancels the active runner and clears pending paths', async () => {
    const state: { releaseRunner?: () => void; signal?: AbortSignal } = {}
    const queue = new VisionIndexQueue((paths, _interval, runnerSignal) => {
      state.signal = runnerSignal
      return new Promise<VisionIndexProgress>((resolve) => {
        state.releaseRunner = () => resolve({ ...completedProgress, totalVideos: paths.length })
      })
    })

    queue.enqueue(['/video/a.mp4'], 3, () => undefined)
    await new Promise((resolve) => setTimeout(resolve, 0))
    queue.enqueue(['/video/b.mp4'], 3, () => undefined)

    expect(queue.cancel()).toBe(true)
    expect(state.signal?.aborted).toBe(true)
    state.releaseRunner?.()
    await waitForIdle(queue)
    expect(queue.isRunning).toBe(false)
  })
})
