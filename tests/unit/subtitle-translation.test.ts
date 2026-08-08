import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createOpenAiCompatibleTranslationProvider,
  findSubtitleTranslationCache,
  promoteIncrementalSubtitleTranslationCache,
  runIncrementalSubtitleTranslationJob,
  parseSubtitleTranslationGlossary,
  runSubtitleTranslationJob,
  SubtitleTranslationError,
  type SubtitleTranslationContext,
  type SubtitleTranslationProvider
} from '../../src/core/ai/subtitle-translation'

describe('subtitle translation', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-subtitle-translation-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('parses glossary entries and keeps the last mapping for duplicate terms', () => {
    expect(parseSubtitleTranslationGlossary('Technology=技术\n\nTechnology=科技\ninvalid')).toEqual([
      { source: 'Technology', target: '科技' }
    ])
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

    expect(first.subtitlePath).toBe(second.subtitlePath)
    expect(first.subtitleSrtPath).toBe(second.subtitleSrtPath)
    expect(first.translationStats).toMatchObject({
      subtitleCueCount: 2,
      translationBatchCount: 1,
      cacheHit: false
    })
    expect(second.translationStats).toMatchObject({
      subtitleCueCount: 2,
      translationBatchCount: 1,
      cacheHit: true
    })
    expect(first.translationStats.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(second.translationStats.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(callCount).toBe(1)
    expect(first.subtitlePath).toContain(join(cacheDirectory, 'subtitles'))
    expect(first.subtitlePath).toContain('-translated-zh-')
    expect(first.subtitleSrtPath).toContain('-translated-zh-')
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

  it('invalidates the translated cache when the source subtitle content changes', async () => {
    const sourceSubtitlePath = join(tempDirectory, 'changing-source.vtt')
    const cacheDirectory = join(tempDirectory, 'cache')
    let callCount = 0
    const provider: SubtitleTranslationProvider = {
      id: 'mock',
      model: 'mock-model',
      translateBatch: async ({ segments }) => {
        callCount += 1
        return segments.map((segment) => ({ id: segment.id, text: `翻译：${segment.text}` }))
      }
    }

    await writeFile(sourceSubtitlePath, ['WEBVTT', '', '00:00:00.000 --> 00:00:01.000', 'first'].join('\n'))
    const first = await runSubtitleTranslationJob({ sourceSubtitlePath, cacheDirectory, sourceLanguage: 'en', targetLanguage: 'zh', provider })
    await writeFile(sourceSubtitlePath, ['WEBVTT', '', '00:00:00.000 --> 00:00:01.000', 'second'].join('\n'))

    await expect(findSubtitleTranslationCache({ sourceSubtitlePath, cacheDirectory, sourceLanguage: 'en', targetLanguage: 'zh', provider })).resolves.toBeNull()
    const second = await runSubtitleTranslationJob({ sourceSubtitlePath, cacheDirectory, sourceLanguage: 'en', targetLanguage: 'zh', provider })

    expect(second.subtitlePath).not.toBe(first.subtitlePath)
    expect(callCount).toBe(2)
    await expect(readFile(second.subtitlePath, 'utf8')).resolves.toContain('翻译：second')
  })

  it('translates only newly completed batches while a source subtitle grows', async () => {
    const sourceSubtitlePath = join(tempDirectory, 'streaming-source.vtt')
    const cacheDirectory = join(tempDirectory, 'cache')
    const calls: string[][] = []
    const provider: SubtitleTranslationProvider = {
      id: 'mock',
      model: 'mock-model',
      translateBatch: async ({ segments }) => {
        calls.push(segments.map((segment) => segment.id))
        return segments.map((segment) => ({ id: segment.id, text: `中文：${segment.text}` }))
      }
    }
    const makeSource = (count: number): string => [
      'WEBVTT',
      '',
      ...Array.from({ length: count }, (_, index) => `${String(index * 2).padStart(2, '0')}:00.000 --> ${String(index * 2).padStart(2, '0')}:01.000\ncue-${index + 1}\n`)
    ].join('\n')

    await mkdir(cacheDirectory, { recursive: true })
    await writeFile(sourceSubtitlePath, makeSource(30))

    const first = await runIncrementalSubtitleTranslationJob({
      sourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider,
      flush: false
    })

    expect(first.translatedCueCount).toBe(30)
    expect(first.changed).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toHaveLength(30)

    await writeFile(sourceSubtitlePath, makeSource(31))
    const waitingForFullBatch = await runIncrementalSubtitleTranslationJob({
      sourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider,
      outputPaths: { subtitlePath: first.subtitlePath, subtitleSrtPath: first.subtitleSrtPath },
      previousTranslatedSubtitlePath: first.subtitlePath,
      translatedCueCount: first.translatedCueCount,
      flush: false
    })

    expect(waitingForFullBatch.changed).toBe(false)
    expect(calls).toHaveLength(1)

    const final = await runIncrementalSubtitleTranslationJob({
      sourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider,
      outputPaths: { subtitlePath: first.subtitlePath, subtitleSrtPath: first.subtitleSrtPath },
      previousTranslatedSubtitlePath: first.subtitlePath,
      translatedCueCount: first.translatedCueCount,
      flush: true
    })

    expect(final.translatedCueCount).toBe(31)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(['cue-31'])
    await expect(readFile(final.subtitlePath, 'utf8')).resolves.toContain('中文：cue-31')

    const promoted = await promoteIncrementalSubtitleTranslationCache({
      sourceSubtitlePath,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider: { id: 'mock', model: 'mock-model' },
      translatedSubtitlePath: final.subtitlePath,
      translatedSubtitleSrtPath: final.subtitleSrtPath,
      cacheDirectory
    })
    await expect(readFile(promoted.subtitlePath, 'utf8')).resolves.toContain('中文：cue-31')
  })

  it('can use a smaller batch size for low-latency streaming translation', async () => {
    const sourceSubtitlePath = join(tempDirectory, 'streaming-small-batch.vtt')
    const cacheDirectory = join(tempDirectory, 'cache')
    const calls: string[][] = []
    const provider: SubtitleTranslationProvider = {
      id: 'mock',
      model: 'mock-model',
      translateBatch: async ({ segments }) => {
        calls.push(segments.map((segment) => segment.id))
        return segments.map((segment) => ({ id: segment.id, text: `中文：${segment.text}` }))
      }
    }

    await mkdir(cacheDirectory, { recursive: true })
    await writeFile(
      sourceSubtitlePath,
      [
        'WEBVTT',
        '',
        ...Array.from({ length: 3 }, (_, index) => `00:00:0${index}.000 --> 00:00:0${index + 1}.000\ncue-${index + 1}\n`)
      ].join('\n')
    )

    const result = await runIncrementalSubtitleTranslationJob({
      sourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider,
      batchSize: 2,
      flush: false
    })

    expect(result.translatedCueCount).toBe(2)
    expect(calls).toEqual([['cue-1', 'cue-2']])
  })

  it('finds cached translated subtitles with the same source text, language pair, and model', async () => {
    const sourceSubtitlePath = join(tempDirectory, 'source.vtt')
    const cacheDirectory = join(tempDirectory, 'cache')
    const provider: SubtitleTranslationProvider = {
      id: 'mock',
      model: 'mock-model',
      translateBatch: async ({ segments }) =>
        segments.map((segment) => ({
          id: segment.id,
          text: `中文：${segment.text}`
        }))
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

    const translated = await runSubtitleTranslationJob({
      sourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider
    })

    await expect(
      findSubtitleTranslationCache({
        sourceSubtitlePath,
        cacheDirectory,
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        provider: {
          id: 'mock',
          model: 'mock-model'
        }
      })
    ).resolves.toEqual({
      subtitlePath: translated.subtitlePath,
      subtitleSrtPath: translated.subtitleSrtPath
    })
  })

  it('promotes legacy translated caches after the raw source filename changes', async () => {
    const subtitleDirectory = join(tempDirectory, 'subtitles')
    const legacySourceSubtitlePath = join(subtitleDirectory, 'source.vtt')
    const rawSourceSubtitlePath = join(subtitleDirectory, 'source-raw.vtt')
    const cacheDirectory = join(tempDirectory, 'cache')
    let callCount = 0
    const provider: SubtitleTranslationProvider = {
      id: 'mock',
      model: 'mock-model',
      translateBatch: async ({ segments }) => {
        callCount += 1
        return segments.map((segment) => ({ id: segment.id, text: `中文：${segment.text}` }))
      }
    }

    await mkdir(subtitleDirectory, { recursive: true })
    await writeFile(
      legacySourceSubtitlePath,
      ['WEBVTT', '', '00:00:00.000 --> 00:00:01.000', 'hello'].join('\n')
    )
    await writeFile(rawSourceSubtitlePath, await readFile(legacySourceSubtitlePath))

    const legacyTranslation = await runSubtitleTranslationJob({
      sourceSubtitlePath: legacySourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider
    })
    const currentBaseName = basename(legacyTranslation.subtitlePath, '.vtt')
    const legacyBaseName = currentBaseName.replace('-translated-', '-')
    await mkdir(join(cacheDirectory, 'translated-subtitles'), { recursive: true })
    await rename(legacyTranslation.subtitlePath, join(cacheDirectory, 'translated-subtitles', `${legacyBaseName}.vtt`))
    await rename(
      legacyTranslation.subtitleSrtPath,
      join(cacheDirectory, 'translated-subtitles', `${legacyBaseName}.srt`)
    )

    const restored = await runSubtitleTranslationJob({
      sourceSubtitlePath: rawSourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider
    })

    expect(restored.subtitlePath).toContain(join(cacheDirectory, 'subtitles'))
    expect(restored.subtitlePath).toContain('-translated-zh-')
    expect(callCount).toBe(1)
    await expect(readFile(restored.subtitlePath, 'utf8')).resolves.toContain('中文：hello')
  })

  it('does not reuse translated subtitle cache when the glossary changes', async () => {
    const sourceSubtitlePath = join(tempDirectory, 'glossary-source.vtt')
    const cacheDirectory = join(tempDirectory, 'cache')
    let callCount = 0
    const createProvider = (glossary: string): SubtitleTranslationProvider => ({
      id: 'mock',
      model: 'mock-model',
      glossary,
      translateBatch: async ({ segments }) => {
        callCount += 1
        return segments.map((segment) => ({ id: segment.id, text: `${glossary}:${segment.text}` }))
      }
    })

    await writeFile(sourceSubtitlePath, ['WEBVTT', '', '00:00:00.000 --> 00:00:01.000', 'technology'].join('\n'))

    const first = await runSubtitleTranslationJob({
      sourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider: createProvider('Technology=技术')
    })
    const second = await runSubtitleTranslationJob({
      sourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider: createProvider('Technology=科技')
    })

    expect(callCount).toBe(2)
    expect(first.subtitlePath).not.toBe(second.subtitlePath)
  })

  it('translates long subtitles in batches, reports progress, and retries transient failures', async () => {
    const sourceSubtitlePath = join(tempDirectory, 'long-source.vtt')
    const cacheDirectory = join(tempDirectory, 'cache')
    const progress: Array<{ completedBatches: number; totalBatches: number; percent: number }> = []
    let callCount = 0

    const provider: SubtitleTranslationProvider = {
      id: 'mock',
      model: 'mock-model',
      translateBatch: async ({ segments }) => {
        callCount += 1

        if (callCount === 1) {
          throw new SubtitleTranslationError('network-error', 'temporary failure')
        }

        return segments.map((segment) => ({
          id: segment.id,
          text: `中文：${segment.text}`
        }))
      }
    }
    const cues = Array.from({ length: 31 }, (_, index) => {
      const start = String(index).padStart(2, '0')
      const end = String(index + 1).padStart(2, '0')
      return [`00:00:${start}.000 --> 00:00:${end}.000`, `line ${index + 1}`].join('\n')
    })

    await writeFile(sourceSubtitlePath, ['WEBVTT', '', ...cues].join('\n\n'))

    const result = await runSubtitleTranslationJob({
      sourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider,
      retryDelaysMs: [0],
      onProgress: (nextProgress) => progress.push(nextProgress)
    })

    expect(callCount).toBe(3)
    expect(result.translationStats).toMatchObject({
      subtitleCueCount: 31,
      translationBatchCount: 2,
      cacheHit: false
    })
    expect(progress).toEqual([
      { completedBatches: 1, totalBatches: 2, percent: 0.5 },
      { completedBatches: 2, totalBatches: 2, percent: 1 }
    ])
    await expect(readFile(result.subtitlePath, 'utf8')).resolves.toContain('中文：line 31')
  })

  it('passes neighboring cues and previous translations as cross-batch context', async () => {
    const sourceSubtitlePath = join(tempDirectory, 'context-source.vtt')
    const cacheDirectory = join(tempDirectory, 'cache')
    const contexts: SubtitleTranslationContext[] = []
    const provider: SubtitleTranslationProvider = {
      id: 'mock',
      model: 'mock-model',
      translateBatch: async ({ segments, context }) => {
        contexts.push(context ?? { previous: [], next: [] })
        return segments.map((segment) => ({
          id: segment.id,
          text: `中文：${segment.text}`
        }))
      }
    }
    const cues = Array.from({ length: 31 }, (_, index) => {
      const start = String(index).padStart(2, '0')
      const end = String(index + 1).padStart(2, '0')
      return [`00:00:${start}.000 --> 00:00:${end}.000`, `line ${index + 1}`].join('\n')
    })

    await writeFile(sourceSubtitlePath, ['WEBVTT', '', ...cues].join('\n\n'))

    await runSubtitleTranslationJob({
      sourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider,
      retryDelaysMs: [0]
    })

    expect(contexts).toHaveLength(2)
    expect(contexts[0]?.previous).toEqual([])
    expect(contexts[0]?.next).toEqual([
      { id: 'cue-31', text: 'line 31' }
    ])
    expect(contexts[1]?.previous).toEqual([
      { id: 'cue-29', text: 'line 29', translatedText: '中文：line 29' },
      { id: 'cue-30', text: 'line 30', translatedText: '中文：line 30' }
    ])
    expect(contexts[1]?.next).toEqual([])
  })

  it('cancels an in-flight batch without writing translated cache files', async () => {
    const sourceSubtitlePath = join(tempDirectory, 'cancel-source.vtt')
    const cacheDirectory = join(tempDirectory, 'cache')
    const controller = new AbortController()
    let startedResolve: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve
    })
    const provider: SubtitleTranslationProvider = {
      id: 'mock',
      model: 'mock-model',
      translateBatch: ({ signal }) => {
        startedResolve?.()
        return new Promise<never>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new SubtitleTranslationError('cancelled', 'cancelled by test')),
            { once: true }
          )
        })
      }
    }

    await writeFile(
      sourceSubtitlePath,
      ['WEBVTT', '', '00:00:00.000 --> 00:00:01.000', 'hello'].join('\n')
    )

    const translation = runSubtitleTranslationJob({
      sourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider,
      signal: controller.signal
    })

    await started
    controller.abort()

    await expect(translation).rejects.toMatchObject({ code: 'cancelled' })
    expect((await readdir(join(cacheDirectory, 'subtitles')).catch(() => [])).length).toBe(0)
  })

  it('does not reuse translated subtitle cache when the source language changes', async () => {
    const sourceSubtitlePath = join(tempDirectory, 'source.vtt')
    const cacheDirectory = join(tempDirectory, 'cache')
    const provider: SubtitleTranslationProvider = {
      id: 'mock',
      model: 'mock-model',
      translateBatch: async ({ segments }) =>
        segments.map((segment) => ({
          id: segment.id,
          text: `中文：${segment.text}`
        }))
    }

    await mkdir(cacheDirectory, { recursive: true })
    await writeFile(
      sourceSubtitlePath,
      [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        'hello world'
      ].join('\n')
    )

    await runSubtitleTranslationJob({
      sourceSubtitlePath,
      cacheDirectory,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      provider
    })

    await expect(
      findSubtitleTranslationCache({
        sourceSubtitlePath,
        cacheDirectory,
        sourceLanguage: 'ja',
        targetLanguage: 'zh',
        provider: {
          id: 'mock',
          model: 'mock-model'
        }
      })
    ).resolves.toBeNull()
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
      ],
      context: {
        previous: [{ id: 'cue-0', text: 'earlier', translatedText: '之前' }],
        next: [{ id: 'cue-3', text: 'phones' }]
      },
      glossary: [{ source: 'Technology', target: '技术' }]
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
    expect(JSON.stringify(requests[0]?.body)).toContain('Nearby subtitle context')
    expect(JSON.stringify(requests[0]?.body)).toContain('cue-0')
    expect(JSON.stringify(requests[0]?.body)).toContain('Technology')
  })

  it('tags HTTP failures from an OpenAI-compatible translation endpoint', async () => {
    const provider = createOpenAiCompatibleTranslationProvider({
      baseUrl: 'https://example.test/v1/chat/completions',
      apiKey: 'test-key',
      model: 'translation-model',
      fetchImpl: async () => new Response('server error', { status: 502, statusText: 'Bad Gateway' })
    })

    await expect(
      provider.translateBatch({
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        segments: [{ id: 'cue-1', text: 'hello' }]
      })
    ).rejects.toMatchObject({
      code: 'http-error',
      status: 502,
      statusText: 'Bad Gateway',
      responseBody: 'server error'
    })
  })

  it('tags invalid JSON responses from an OpenAI-compatible translation endpoint', async () => {
    const provider = createOpenAiCompatibleTranslationProvider({
      baseUrl: 'https://example.test/v1/chat/completions',
      apiKey: 'test-key',
      model: 'translation-model',
      fetchImpl: async () =>
        new Response('not-json', {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    })

    await expect(
      provider.translateBatch({
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        segments: [{ id: 'cue-1', text: 'hello' }]
      })
    ).rejects.toMatchObject({
      code: 'invalid-json',
      responseBody: 'not-json'
    })
  })

  it('tags malformed translated segment responses from an OpenAI-compatible translation endpoint', async () => {
    const provider = createOpenAiCompatibleTranslationProvider({
      baseUrl: 'https://example.test/v1/chat/completions',
      apiKey: 'test-key',
      model: 'translation-model',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify([{ id: 'cue-1' }])
                }
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    })

    await expect(
      provider.translateBatch({
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        segments: [{ id: 'cue-1', text: 'hello' }]
      })
    ).rejects.toMatchObject({
      code: 'invalid-response'
    })
  })
})
