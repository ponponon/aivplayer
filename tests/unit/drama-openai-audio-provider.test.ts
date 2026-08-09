import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createOpenAICompatibleAudioProvider } from '../../src/core/drama/drama-openai-audio-provider'
import type { DramaGenerationTask } from '../../src/shared/drama-types'

describe('openai compatible audio provider', () => {
  let outputDirectory: string

  beforeEach(async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-openai-audio-'))
  })

  afterEach(async () => {
    await rm(outputDirectory, { recursive: true, force: true })
  })

  it('maps the shared task contract to the speech API and atomically saves binary audio', async () => {
    let requestUrl = ''
    let requestBody: Record<string, unknown> | null = null
    const provider = createOpenAICompatibleAudioProvider({
      providerId: 'openai-tts',
      baseUrl: 'https://audio.example.test',
      apiKey: 'test-key',
      model: 'gpt-4o-mini-tts',
      costPerRequest: 0.02,
      outputDirectory,
      fetchImpl: async (input, init) => {
        requestUrl = String(input)
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-key')
        expect(init?.method).toBe('POST')
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/wav' }
        })
      }
    })

    const result = await provider.generate({ task: task(), signal: new AbortController().signal })

    expect(requestUrl).toBe('https://audio.example.test/v1/audio/speech')
    expect(requestBody).toEqual({
      model: 'gpt-4o-mini-tts',
      input: '旁白',
      voice: 'nova',
      response_format: 'wav',
      instructions: '温柔、克制',
      speed: 1.25
    })
    expect(result.providerId).toBe('openai-tts')
    expect(result.model).toBe('gpt-4o-mini-tts')
    expect(result.cost).toBe(0.02)
    expect(result.resultPath).toMatch(/audio-openai-audio-task\.wav$/)
    await expect(readFile(result.resultPath)).resolves.toEqual(Buffer.from([1, 2, 3]))
  })

  it('fails closed for SSE and preserves non-retryable provider errors', async () => {
    let called = false
    const provider = createOpenAICompatibleAudioProvider({
      providerId: 'openai-tts',
      baseUrl: 'https://audio.example.test/v1/audio/speech',
      outputDirectory,
      fetchImpl: async () => {
        called = true
        return new Response('unexpected', { status: 400 })
      }
    })

    await expect(provider.generate({
      task: task({ stream_format: 'sse' }),
      signal: new AbortController().signal
    })).rejects.toMatchObject({
      retryable: false,
      message: '语音 Provider 只支持二进制音频响应，不支持 SSE 流式格式'
    })
    expect(called).toBe(false)

    const failingProvider = createOpenAICompatibleAudioProvider({
      providerId: 'openai-tts',
      baseUrl: 'https://audio.example.test/v1/audio/speech',
      outputDirectory,
      fetchImpl: async () => new Response('bad request', { status: 400 })
    })
    await expect(failingProvider.generate({ task: task(), signal: new AbortController().signal }))
      .rejects.toMatchObject({ retryable: false, message: '语音生成服务请求失败：HTTP 400' })
  })
})

function task(parameters: DramaGenerationTask['parameters'] = {
  voice: 'nova',
  response_format: 'wav',
  instructions: '温柔、克制',
  speed: 1.25
}): DramaGenerationTask {
  return {
    id: 'openai-audio-task',
    projectId: 'project-1',
    mediaType: 'audio',
    prompt: '旁白',
    status: 'running',
    progress: 0,
    message: '生成中',
    providerId: 'openai-tts',
    parameters,
    attempt: 1,
    maxAttempts: 2,
    createdAt: 1,
    updatedAt: 1
  }
}
