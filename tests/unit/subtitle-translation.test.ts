import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createOpenAiCompatibleTranslationProvider,
  runSubtitleTranslationJob,
  type SubtitleTranslationProvider
} from '../../src/main/ai/subtitle-translation'

describe('subtitle translation', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-subtitle-translation-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('writes translated VTT and SRT files and reuses the cached result', async () => {
    const sourceSubtitlePath = join(tempDirectory, 'source.vtt')
    const cacheDirectory = join(tempDirectory, 'cache')
    let callCount = 0
    const provider: SubtitleTranslationProvider = {
      id: 'mock',
      model: 'mock-model',
      translateBatch: async ({ segments }) => {
        callCount += 1
        return segments.map((segment) => ({
          id: segment.id,
          text: `中文：${segment.text}`
        }))
      }
    }

    await mkdir(cacheDirectory, { recursive: true })
    await writeFile(
      sourceSubtitlePath,
      [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        'hello world',
        '',
        '00:00:02.000 --> 00:00:03.000',
        'technology'
      ].join('\n')
    )

    const first = await runSubtitleTranslationJob({
      sourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider
    })
    const second = await runSubtitleTranslationJob({
      sourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider
    })

    expect(first).toEqual(second)
    expect(callCount).toBe(1)
    await expect(readFile(first.subtitlePath, 'utf8')).resolves.toBe(
      [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        '中文：hello world',
        '',
        '00:00:02.000 --> 00:00:03.000',
        '中文：technology',
        ''
      ].join('\n')
    )
    await expect(readFile(first.subtitleSrtPath, 'utf8')).resolves.toBe(
      [
        '1',
        '00:00:00,000 --> 00:00:01,000',
        '中文：hello world',
        '',
        '2',
        '00:00:02,000 --> 00:00:03,000',
        '中文：technology',
        ''
      ].join('\n')
    )
  })

  it('sends structured segment ids to an OpenAI-compatible translation endpoint', async () => {
    const requests: Array<{ url: string; authorization: string | null; body: unknown }> = []
    const provider = createOpenAiCompatibleTranslationProvider({
      baseUrl: 'https://example.test/v1/chat/completions',
      apiKey: 'test-key',
      model: 'translation-model',
      fetchImpl: async (url, init) => {
        requests.push({
          url: String(url),
          authorization: init?.headers instanceof Headers ? init.headers.get('Authorization') : null,
          body: JSON.parse(String(init?.body ?? '{}'))
        })

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify([
                    { id: 'cue-1', text: '你好' },
                    { id: 'cue-2', text: '技术' }
                  ])
                }
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
    })

    const result = await provider.translateBatch({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      segments: [
        { id: 'cue-1', text: 'hello' },
        { id: 'cue-2', text: 'technology' }
      ]
    })

    expect(result).toEqual([
      { id: 'cue-1', text: '你好' },
      { id: 'cue-2', text: '技术' }
    ])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('https://example.test/v1/chat/completions')
    expect(requests[0]?.authorization).toBe('Bearer test-key')
    expect(JSON.stringify(requests[0]?.body)).toContain('cue-1')
    expect(JSON.stringify(requests[0]?.body)).toContain('Return only a JSON array')
  })
})
