import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHttpDramaMediaProvider } from '../../src/core/drama/drama-media-provider'
import type { DramaGenerationTask } from '../../src/shared/drama-types'

describe('drama media provider', () => {
  let outputDirectory: string

  beforeEach(async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-media-provider-'))
  })

  afterEach(async () => {
    await rm(outputDirectory, { recursive: true, force: true })
  })

  it('downloads a synchronous result URL into the local drama output directory', async () => {
    const requests: Array<{ url: string; method: string; authorization: string | null }> = []
    const provider = createHttpDramaMediaProvider({
      providerId: 'fake-image',
      mediaType: 'image',
      baseUrl: 'https://provider.test/generate',
      apiKey: 'secret-key',
      model: 'image-model',
      outputDirectory,
      fetchImpl: async (input, init) => {
        const headers = new Headers(init?.headers)
        requests.push({ url: String(input), method: init?.method ?? 'GET', authorization: headers.get('authorization') })
        if (init?.method === 'POST') return jsonResponse({ resultUrl: 'https://provider.test/files/result.png', cost: 0.1234567 })
        return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })
      }
    })

    const result = await provider.generate({ task: task('image'), signal: new AbortController().signal })

    expect(result.providerId).toBe('fake-image')
    expect(result.cost).toBe(0.123457)
    expect(result.resultPath).toMatch(/image-image-task\.png$/)
    await expect(readFile(result.resultPath)).resolves.toEqual(Buffer.from([1, 2, 3]))
    expect(requests).toEqual([
      { url: 'https://provider.test/generate', method: 'POST', authorization: 'Bearer secret-key' },
      { url: 'https://provider.test/files/result.png', method: 'GET', authorization: 'Bearer secret-key' }
    ])
  })

  it('polls asynchronous jobs and persists Base64 results with progress updates', async () => {
    let pollCount = 0
    const progress: Array<{ value: number; message?: string }> = []
    const provider = createHttpDramaMediaProvider({
      providerId: 'fake-audio',
      mediaType: 'audio',
      baseUrl: 'http://127.0.0.1:3210/generate',
      outputDirectory,
      pollIntervalMs: 0,
      fetchImpl: async (_input, init) => {
        if (init?.method === 'POST') return jsonResponse({ statusUrl: 'http://127.0.0.1:3210/status/1', status: 'queued' })
        pollCount += 1
        return pollCount === 1 ? jsonResponse({ status: 'running', progress: 50, message: '合成中' }) : jsonResponse({ status: 'succeeded', base64: 'AQID', mimeType: 'audio/wav' })
      }
    })

    const result = await provider.generate({ task: task('audio'), signal: new AbortController().signal, onProgress: (value, message) => progress.push({ value, message }) })

    expect(pollCount).toBe(2)
    expect(result.resultPath).toMatch(/audio-audio-task\.wav$/)
    expect(await readFile(result.resultPath)).toEqual(Buffer.from([1, 2, 3]))
    expect(progress).toContainEqual({ value: 0.5, message: '合成中' })
    await expect(stat(result.resultPath)).resolves.toMatchObject({ size: 3 })
  })

  it('classifies rate limits as retryable and invalid response data as non-retryable', async () => {
    const rateLimited = createHttpDramaMediaProvider({
      providerId: 'fake-video',
      mediaType: 'video',
      baseUrl: 'https://provider.test/video',
      outputDirectory,
      fetchImpl: async () => new Response('', { status: 429 })
    })
    await expect(rateLimited.generate({ task: task('video'), signal: new AbortController().signal })).rejects.toMatchObject({ retryable: true })

    const invalid = createHttpDramaMediaProvider({
      providerId: 'fake-video',
      mediaType: 'video',
      baseUrl: 'https://provider.test/video',
      outputDirectory,
      fetchImpl: async () => jsonResponse({ status: 'succeeded' })
    })
    await expect(invalid.generate({ task: task('video'), signal: new AbortController().signal })).rejects.toMatchObject({ retryable: false })
  })

  it('rejects local result paths outside the generated output directory', async () => {
    const provider = createHttpDramaMediaProvider({
      providerId: 'unsafe-provider',
      mediaType: 'image',
      baseUrl: 'https://provider.test/image',
      outputDirectory,
      fetchImpl: async () => jsonResponse({ resultPath: join(outputDirectory, '..', 'not-allowed.png') })
    })

    await expect(provider.generate({ task: task('image'), signal: new AbortController().signal })).rejects.toMatchObject({ retryable: false })
  })
})

function task(mediaType: DramaGenerationTask['mediaType']): DramaGenerationTask {
  return {
    id: `${mediaType}-task`,
    projectId: 'project-1',
    mediaType,
    prompt: '测试媒体生成',
    status: 'running',
    progress: 0,
    message: '生成中',
    providerId: 'unconfigured',
    parameters: { duration: 5 },
    attempt: 1,
    maxAttempts: 2,
    createdAt: 1,
    updatedAt: 1
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}
