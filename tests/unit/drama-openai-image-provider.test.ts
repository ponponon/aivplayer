import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createOpenAICompatibleImageProvider } from '../../src/core/drama/drama-openai-image-provider'
import type { DramaGenerationTask } from '../../src/shared/drama-types'

describe('openai compatible image provider', () => {
  let outputDirectory: string

  beforeEach(async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-openai-image-'))
  })

  afterEach(async () => {
    await rm(outputDirectory, { recursive: true, force: true })
  })

  it('maps the shared task contract to the Images API and decodes b64_json', async () => {
    let requestUrl = ''
    let requestBody: Record<string, unknown> | null = null
    const provider = createOpenAICompatibleImageProvider({
      providerId: 'openai-images',
      baseUrl: 'https://images.example.test',
      apiKey: 'test-key',
      model: 'gpt-image-1',
      costPerRequest: 0.04,
      outputDirectory,
      fetchImpl: async (input, init) => {
        requestUrl = String(input)
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-key')
        return jsonResponse({ model: 'gpt-image-1', data: [{ b64_json: 'AQID', output_format: 'png' }] })
      }
    })

    const result = await provider.generate({ task: task(), signal: new AbortController().signal })

    expect(requestUrl).toBe('https://images.example.test/v1/images/generations')
    expect(requestBody).toEqual({ model: 'gpt-image-1', prompt: '角色肖像', size: '1024x1536', quality: 'high' })
    expect(result.providerId).toBe('openai-images')
    expect(result.cost).toBe(0.04)
    await expect(readFile(result.resultPath)).resolves.toEqual(Buffer.from([1, 2, 3]))
  })

  it('supports an OpenAI image URL response through the shared downloader', async () => {
    const requests: string[] = []
    const provider = createOpenAICompatibleImageProvider({
      providerId: 'openai-images',
      baseUrl: 'https://images.example.test/v1/images/generations',
      outputDirectory,
      fetchImpl: async (input, init) => {
        requests.push(`${init?.method ?? 'GET'} ${String(input)}`)
        return init?.method === 'POST'
          ? jsonResponse({ data: [{ url: 'https://cdn.example.test/result.webp', output_format: 'webp' }] })
          : new Response(new Uint8Array([4, 5, 6]), { headers: { 'content-type': 'image/webp' } })
      }
    })

    const result = await provider.generate({ task: task(), signal: new AbortController().signal })

    expect(requests).toEqual([
      'POST https://images.example.test/v1/images/generations',
      'GET https://cdn.example.test/result.webp'
    ])
    expect(result.resultPath).toMatch(/image-openai-image-task\.webp$/)
    await expect(readFile(result.resultPath)).resolves.toEqual(Buffer.from([4, 5, 6]))
  })
})

function task(): DramaGenerationTask {
  return {
    id: 'openai-image-task',
    projectId: 'project-1',
    mediaType: 'image',
    prompt: '角色肖像',
    status: 'running',
    progress: 0,
    message: '生成中',
    providerId: 'openai-images',
    parameters: { size: '1024x1536', quality: 'high', ignored: 'not-forwarded' },
    attempt: 1,
    maxAttempts: 2,
    createdAt: 1,
    updatedAt: 1
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}
