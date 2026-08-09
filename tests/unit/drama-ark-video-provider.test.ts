import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createArkVideoProvider } from '../../src/core/drama/drama-ark-video-provider'
import type { DramaGenerationTask } from '../../src/shared/drama-types'

describe('ark video provider', () => {
  let outputDirectory: string

  beforeEach(async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-ark-video-'))
  })

  afterEach(async () => {
    await rm(outputDirectory, { recursive: true, force: true })
  })

  it('maps the shared task contract, polls Seedance and downloads the video', async () => {
    const requests: Array<{ method: string; url: string; body?: Record<string, unknown> }> = []
    const provider = createArkVideoProvider({
      providerId: 'ark-video',
      baseUrl: 'https://ark.example.test/api/v3',
      apiKey: 'test-key',
      model: 'doubao-seedance-2-0-260128',
      costPerRequest: 0.12,
      outputDirectory,
      pollIntervalMs: 0,
      maxPolls: 2,
      fetchImpl: async (input, init) => {
        const method = init?.method ?? 'GET'
        const url = String(input)
        const entry: { method: string; url: string; body?: Record<string, unknown> } = { method, url }
        if (typeof init?.body === 'string') entry.body = JSON.parse(init.body) as Record<string, unknown>
        requests.push(entry)
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-key')
        if (method === 'POST') return jsonResponse({ id: 'cgt-123', status: 'queued', model: 'doubao-seedance-2-0-260128' })
        if (url.endsWith('/cgt-123')) return jsonResponse({
          id: 'cgt-123',
          status: 'succeeded',
          content: { video_url: 'https://cdn.example.test/seedance.mp4' }
        })
        return new Response(new Uint8Array([7, 8, 9]), { headers: { 'content-type': 'video/mp4' } })
      }
    })

    const result = await provider.generate({ task: task(), signal: new AbortController().signal })

    expect(requests).toEqual([
      {
        method: 'POST',
        url: 'https://ark.example.test/api/v3/contents/generations/tasks',
        body: {
          model: 'doubao-seedance-2-0-260128',
          content: [
            { type: 'text', text: '女孩抱着狐狸，镜头缓缓拉出' },
            { type: 'image_url', image_url: { url: 'https://img.example.test/start.png' }, role: 'first_frame' },
            { type: 'image_url', image_url: { url: 'https://img.example.test/end.png' }, role: 'last_frame' }
          ],
          ratio: '16:9',
          duration: 5,
          generate_audio: true,
          resolution: '720p',
          seed: 7
        }
      },
      { method: 'GET', url: 'https://ark.example.test/api/v3/contents/generations/tasks/cgt-123' },
      { method: 'GET', url: 'https://cdn.example.test/seedance.mp4' }
    ])
    expect(result.resultPath).toMatch(/video-ark-video-task\.mp4$/)
    expect(result.providerId).toBe('ark-video')
    expect(result.model).toBe('doubao-seedance-2-0-260128')
    expect(result.cost).toBe(0.12)
    await expect(readFile(result.resultPath)).resolves.toEqual(Buffer.from([7, 8, 9]))
  })

  it('turns expired tasks into a non-retryable failure', async () => {
    let pollCount = 0
    const provider = createArkVideoProvider({
      providerId: 'ark-video',
      baseUrl: 'https://ark.example.test/api/v3/contents/generations/tasks',
      outputDirectory,
      pollIntervalMs: 0,
      fetchImpl: async (_input, init) => {
        if (init?.method === 'POST') return jsonResponse({ id: 'cgt-expired', status: 'queued' })
        pollCount += 1
        return jsonResponse({ id: 'cgt-expired', status: 'expired', error: { message: '任务已过期' } })
      }
    })

    await expect(provider.generate({ task: task(), signal: new AbortController().signal }))
      .rejects.toMatchObject({ retryable: false, message: '任务已过期' })
    expect(pollCount).toBe(1)
  })
})

function task(): DramaGenerationTask {
  return {
    id: 'ark-video-task',
    projectId: 'project-1',
    mediaType: 'video',
    prompt: '女孩抱着狐狸，镜头缓缓拉出',
    status: 'running',
    progress: 0,
    message: '生成中',
    providerId: 'ark-video',
    parameters: {
      ratio: '16:9',
      duration: 5,
      generateAudio: true,
      resolution: '720p',
      seed: 7,
      firstFrameUrl: 'https://img.example.test/start.png',
      last_frame_url: 'https://img.example.test/end.png',
      ignored: 'not-forwarded'
    },
    attempt: 1,
    maxAttempts: 2,
    createdAt: 1,
    updatedAt: 1
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}
