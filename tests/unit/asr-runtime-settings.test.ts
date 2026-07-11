import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readAsrRuntimeSettings, saveWhisperBinaryPath } from '../../src/main/ai/asr-settings'
import { createWhisperCppRuntime } from '../../src/main/ai/whisper-cpp-runtime'
import { getAppCopy } from '../../src/shared/i18n'

describe('ASR runtime settings', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-asr-settings-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('persists a user-selected whisper.cpp binary path', async () => {
    const binaryPath = join(tempDirectory, 'whisper-cli')

    await saveWhisperBinaryPath(tempDirectory, binaryPath)

    await expect(readAsrRuntimeSettings(tempDirectory)).resolves.toEqual({
      whisperBinaryPath: binaryPath
    })
  })

  it('uses the saved whisper.cpp binary when checking the runtime', async () => {
    const whisperBinaryPath = join(tempDirectory, 'whisper-cli')
    const ffmpegPath = join(tempDirectory, 'ffmpeg')

    await writeFile(whisperBinaryPath, '#!/bin/sh\necho "whisper.cpp mock"\n')
    await writeFile(ffmpegPath, '#!/bin/sh\necho "ffmpeg mock"\n')
    await chmod(whisperBinaryPath, 0o755)
    await chmod(ffmpegPath, 0o755)
    await saveWhisperBinaryPath(tempDirectory, whisperBinaryPath)

    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        AIVPLAYER_FFMPEG_BIN: ffmpegPath,
        AIVPLAYER_ASR_MODEL_DIR: join(tempDirectory, 'models')
      }
    })

    const status = await runtime.healthCheck()

    expect(status.binaryPath).toBe(whisperBinaryPath)
    expect(status.ffmpegPath).toBe(ffmpegPath)
    expect(status.message).toContain('模型目录暂无模型')
  })

  it('uses the compact whisper version output instead of help text in the runtime status message', async () => {
    const binaryDirectory = join(tempDirectory, 'bin')
    const whisperBinaryPath = join(binaryDirectory, 'whisper-cli')
    const ffmpegPath = join(binaryDirectory, 'ffmpeg')
    const modelDirectory = join(tempDirectory, 'models')
    const modelPath = join(modelDirectory, 'ggml-large-v3-turbo-q5_0.bin')

    await mkdir(binaryDirectory, { recursive: true })
    await mkdir(modelDirectory, { recursive: true })
    await writeFile(
      whisperBinaryPath,
      [
        '#!/bin/sh',
        'case "$1" in',
        '  --version)',
        '    echo "whisper.cpp version: 9.9.9"',
        '    exit 0',
        '    ;;',
        '  --help)',
        '    echo "usage: /very/long/path/to/whisper-cli [options] file0 file1 ..."',
        '    exit 0',
        '    ;;',
        'esac',
        'exit 1'
      ].join('\n')
    )
    await writeFile(ffmpegPath, '#!/bin/sh\necho "ffmpeg mock"\n')
    await writeFile(modelPath, 'mock model')
    await chmod(whisperBinaryPath, 0o755)
    await chmod(ffmpegPath, 0o755)

    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        PATH: '',
        AIVPLAYER_ASR_MODEL_DIR: modelDirectory
      },
      extraBinaryDirectories: [binaryDirectory]
    })

    const status = await runtime.healthCheck()

    expect(status.available).toBe(true)
    expect(status.message).toBe('已检测到 whisper.cpp：9.9.9')
    expect(status.message).not.toContain('usage:')
  })

  it('detects a whisper.cpp binary from known binary directories when PATH is empty', async () => {
    const binaryDirectory = join(tempDirectory, 'bin')
    const whisperBinaryPath = join(binaryDirectory, 'whisper-cli')
    const ffmpegPath = join(binaryDirectory, 'ffmpeg')

    await mkdir(binaryDirectory, { recursive: true })
    await writeFile(whisperBinaryPath, '#!/bin/sh\necho "whisper.cpp mock"\n')
    await writeFile(ffmpegPath, '#!/bin/sh\necho "ffmpeg mock"\n')
    await chmod(whisperBinaryPath, 0o755)
    await chmod(ffmpegPath, 0o755)

    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        PATH: '',
        AIVPLAYER_ASR_MODEL_DIR: join(tempDirectory, 'models')
      },
      extraBinaryDirectories: [binaryDirectory]
    })

    const status = await runtime.healthCheck()

    expect(status.binaryPath).toBe(whisperBinaryPath)
    expect(status.ffmpegPath).toBe(ffmpegPath)
  })

  it('persists the discovered whisper.cpp binary when auto-configuring the runtime', async () => {
    const binaryDirectory = join(tempDirectory, 'bin')
    const whisperBinaryPath = join(binaryDirectory, 'whisper-cli')
    const ffmpegPath = join(binaryDirectory, 'ffmpeg')

    await mkdir(binaryDirectory, { recursive: true })
    await writeFile(whisperBinaryPath, '#!/bin/sh\necho "whisper.cpp mock"\n')
    await writeFile(ffmpegPath, '#!/bin/sh\necho "ffmpeg mock"\n')
    await chmod(whisperBinaryPath, 0o755)
    await chmod(ffmpegPath, 0o755)

    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        PATH: '',
        AIVPLAYER_ASR_MODEL_DIR: join(tempDirectory, 'models')
      },
      extraBinaryDirectories: [binaryDirectory]
    })

    const status = await runtime.autoConfigureWhisperBinaryPath()

    expect(status.binaryPath).toBe(whisperBinaryPath)
    await expect(readAsrRuntimeSettings(tempDirectory)).resolves.toEqual({
      whisperBinaryPath
    })
  })

  it('prefers the replacement whisper binary when the selected whisper-cli is only a deprecation wrapper', async () => {
    const binaryDirectory = join(tempDirectory, 'bin')
    const deprecatedWhisperBinaryPath = join(binaryDirectory, 'whisper-cli')
    const replacementWhisperBinaryPath = join(binaryDirectory, 'whisper-whisper-cli')
    const ffmpegPath = join(binaryDirectory, 'ffmpeg')

    await mkdir(binaryDirectory, { recursive: true })
    await writeFile(
      deprecatedWhisperBinaryPath,
      [
        '#!/bin/sh',
        "echo \"WARNING: The binary 'whisper-cli' is deprecated.\" >&2",
        "echo \" Please use 'whisper-whisper-cli' instead.\" >&2",
        'exit 1'
      ].join('\n')
    )
    await writeFile(replacementWhisperBinaryPath, '#!/bin/sh\necho "whisper.cpp replacement mock"\n')
    await writeFile(ffmpegPath, '#!/bin/sh\necho "ffmpeg mock"\n')
    await chmod(deprecatedWhisperBinaryPath, 0o755)
    await chmod(replacementWhisperBinaryPath, 0o755)
    await chmod(ffmpegPath, 0o755)
    await saveWhisperBinaryPath(tempDirectory, deprecatedWhisperBinaryPath)

    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        PATH: '',
        AIVPLAYER_ASR_MODEL_DIR: join(tempDirectory, 'models')
      },
      extraBinaryDirectories: [binaryDirectory]
    })

    const status = await runtime.healthCheck()

    expect(status.binaryPath).toBe(replacementWhisperBinaryPath)

    await runtime.autoConfigureWhisperBinaryPath()

    await expect(readAsrRuntimeSettings(tempDirectory)).resolves.toEqual({
      whisperBinaryPath: replacementWhisperBinaryPath
    })
  })

  it('exports an SRT file from a VTT subtitle file', async () => {
    const subtitleDirectory = join(tempDirectory, 'subtitles')
    const vttPath = join(subtitleDirectory, 'demo.vtt')
    const srtPath = join(subtitleDirectory, 'demo.srt')

    await mkdir(subtitleDirectory, { recursive: true })
    await writeFile(vttPath, 'WEBVTT\n\nintro\n00:00:00.000 --> 00:00:01.250\nhello world\n')

    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources')
    })

    const result = await runtime.exportSubtitleSrt({ subtitlePath: vttPath })

    expect(result.success).toBe(true)
    expect(result.subtitleSrtPath).toBe(srtPath)
    await expect(readFile(srtPath, 'utf8')).resolves.toBe(
      '1\n00:00:00,000 --> 00:00:01,250\nhello world\n'
    )
  })

  it('translates a VTT subtitle file through the configured OpenAI-compatible provider', async () => {
    const subtitleDirectory = join(tempDirectory, 'subtitles')
    const vttPath = join(subtitleDirectory, 'demo.vtt')
    const requests: Array<{ authorization: string | null; model: string | undefined }> = []

    await mkdir(subtitleDirectory, { recursive: true })
    await writeFile(
      vttPath,
      [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        'hello',
        '',
        '00:00:02.000 --> 00:00:03.000',
        'technology'
      ].join('\n')
    )

    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        AIVPLAYER_TRANSLATION_BASE_URL: 'https://example.test/v1/chat/completions',
        AIVPLAYER_TRANSLATION_API_KEY: 'test-key',
        AIVPLAYER_TRANSLATION_MODEL: 'translation-model'
      },
      translationFetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string }
        requests.push({
          authorization: init?.headers instanceof Headers ? init.headers.get('Authorization') : null,
          model: body.model
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

    const result = await runtime.translateSubtitle({
      subtitlePath: vttPath,
      sourceLanguage: 'en',
      targetLanguage: 'zh'
    })

    expect(result.success).toBe(true)
    expect(result.subtitlePath).toContain('translated-subtitles')
    expect(result.subtitleSrtPath).toContain('translated-subtitles')
    expect(requests).toEqual([
      {
        authorization: 'Bearer test-key',
        model: 'translation-model'
      }
    ])
    await expect(readFile(result.subtitlePath ?? '', 'utf8')).resolves.toContain('你好')
    await expect(readFile(result.subtitleSrtPath ?? '', 'utf8')).resolves.toContain('技术')
  })

  it('resolves cached translated subtitles without needing the translation API key', async () => {
    const subtitleDirectory = join(tempDirectory, 'subtitles')
    const vttPath = join(subtitleDirectory, 'demo.vtt')
    const requests: Array<{ authorization: string | null; model: string | undefined }> = []

    await mkdir(subtitleDirectory, { recursive: true })
    await writeFile(
      vttPath,
      [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        'hello'
      ].join('\n')
    )

    const translatingRuntime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        AIVPLAYER_TRANSLATION_BASE_URL: 'https://example.test/v1/chat/completions',
        AIVPLAYER_TRANSLATION_API_KEY: 'test-key',
        AIVPLAYER_TRANSLATION_MODEL: 'translation-model'
      },
      translationFetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string }
        requests.push({
          authorization: init?.headers instanceof Headers ? init.headers.get('Authorization') : null,
          model: body.model
        })

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify([{ id: 'cue-1', text: '你好' }])
                }
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
    })

    const translated = await translatingRuntime.translateSubtitle({
      subtitlePath: vttPath,
      sourceLanguage: 'en',
      targetLanguage: 'zh'
    })

    expect(translated.success).toBe(true)
    expect(requests).toEqual([
      {
        authorization: 'Bearer test-key',
        model: 'translation-model'
      }
    ])

    const cacheOnlyRuntime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        AIVPLAYER_TRANSLATION_MODEL: 'translation-model'
      }
    })

    const resolved = await cacheOnlyRuntime.resolveTranslatedSubtitleCache({
      subtitlePath: vttPath,
      sourceLanguage: 'en',
      targetLanguage: 'zh'
    })

    expect(resolved.success).toBe(true)
    expect(resolved.sourceSubtitlePath).toBe(vttPath)
    expect(resolved.sourceLanguage).toBe('en')
    expect(resolved.targetLanguage).toBe('zh')
    expect(resolved.translationModel).toBe('translation-model')
    expect(resolved.subtitlePath).toContain('translated-subtitles')
    expect(resolved.subtitleSrtPath).toContain('translated-subtitles')
  })

  it('does not resolve translated subtitle cache when the translation model changes', async () => {
    const subtitleDirectory = join(tempDirectory, 'subtitles')
    const vttPath = join(subtitleDirectory, 'demo.vtt')

    await mkdir(subtitleDirectory, { recursive: true })
    await writeFile(
      vttPath,
      [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        'hello'
      ].join('\n')
    )

    const translatingRuntime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        AIVPLAYER_TRANSLATION_BASE_URL: 'https://example.test/v1/chat/completions',
        AIVPLAYER_TRANSLATION_API_KEY: 'test-key',
        AIVPLAYER_TRANSLATION_MODEL: 'translation-model'
      },
      translationFetch: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify([{ id: 'cue-1', text: '你好' }])
                }
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    })

    const translated = await translatingRuntime.translateSubtitle({
      subtitlePath: vttPath,
      sourceLanguage: 'en',
      targetLanguage: 'zh'
    })

    expect(translated.success).toBe(true)

    const cacheOnlyRuntime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        AIVPLAYER_TRANSLATION_MODEL: 'different-model'
      }
    })

    await expect(
      cacheOnlyRuntime.resolveTranslatedSubtitleCache({
        subtitlePath: vttPath,
        sourceLanguage: 'en',
        targetLanguage: 'zh'
      })
    ).resolves.toMatchObject({
      success: false,
      message: getAppCopy().runtime.subtitleCacheMiss
    })
  })

  it('prefers saved translation settings when translating subtitles', async () => {
    const subtitleDirectory = join(tempDirectory, 'subtitles')
    const vttPath = join(subtitleDirectory, 'demo.vtt')
    const requests: Array<{ url: string; authorization: string | null; model: string | undefined }> = []

    await mkdir(subtitleDirectory, { recursive: true })
    await writeFile(
      vttPath,
      [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        'hello'
      ].join('\n')
    )

    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        AIVPLAYER_TRANSLATION_BASE_URL: 'https://env.invalid/v1/chat/completions',
        AIVPLAYER_TRANSLATION_API_KEY: 'env-key',
        AIVPLAYER_TRANSLATION_MODEL: 'env-model'
      },
      getTranslationServiceSettings: () => ({
        translationBaseUrl: 'https://example.test/v1/chat/completions',
        translationApiKey: 'saved-key',
        translationModel: 'saved-model'
      }),
      translationFetch: async (url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string }
        requests.push({
          url,
          authorization: init?.headers instanceof Headers ? init.headers.get('Authorization') : null,
          model: body.model
        })

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify([{ id: 'cue-1', text: '你好' }])
                }
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
    })

    const result = await runtime.translateSubtitle({
      subtitlePath: vttPath,
      sourceLanguage: 'en',
      targetLanguage: 'zh'
    })

    expect(result.success).toBe(true)
    expect(requests).toEqual([
      {
        url: 'https://example.test/v1/chat/completions',
        authorization: 'Bearer saved-key',
        model: 'saved-model'
      }
    ])
  })

  it('probes the translation service with the configured provider', async () => {
    const requests: Array<{
      url: string
      authorization: string | null
      model: string | undefined
      promptText: string | null
    }> = []
    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        AIVPLAYER_TRANSLATION_BASE_URL: 'https://example.test/v1/chat/completions',
        AIVPLAYER_TRANSLATION_API_KEY: 'probe-key',
        AIVPLAYER_TRANSLATION_MODEL: 'probe-model'
      },
      translationFetch: async (url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          model?: string
          messages?: Array<{ content?: string }>
        }
        const promptMessageContent = body.messages?.[1]?.content
        const promptText = promptMessageContent
          ? ((JSON.parse(promptMessageContent) as Array<{ text?: string }>)[0]?.text ?? null)
          : null
        requests.push({
          url,
          authorization: init?.headers instanceof Headers ? init.headers.get('Authorization') : null,
          model: body.model,
          promptText
        })

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify([{ id: 'cue-1', text: '今天天气真好。字幕翻译正在进行。' }])
                }
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
    })

    const result = await runtime.testTranslationService({
      sourceLanguage: 'ja',
      targetLanguage: 'zh'
    })

    expect(result.success).toBe(true)
    expect(result.translationModel).toBe('probe-model')
    expect(result.message).toContain('probe-model')
    expect(result.sourceLanguage).toBe('ja')
    expect(result.targetLanguage).toBe('zh')
    expect(result.translationBaseUrlSummary).toBe('https://example.test/v1/chat/completions')
    expect(result.sampleSourceText).toBe('今日はいい天気ですね。字幕の翻訳を試しています。')
    expect(result.sampleTranslatedText).toBe('今天天气真好。字幕翻译正在进行。')
    expect(requests).toEqual([
      {
        url: 'https://example.test/v1/chat/completions',
        authorization: 'Bearer probe-key',
        model: 'probe-model',
        promptText: '今日はいい天気ですね。字幕の翻訳を試しています。'
      }
    ])
  })

  it('reports HTTP failures from the translation service probe', async () => {
    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        AIVPLAYER_TRANSLATION_BASE_URL: 'https://example.test/v1/chat/completions',
        AIVPLAYER_TRANSLATION_API_KEY: 'probe-key',
        AIVPLAYER_TRANSLATION_MODEL: 'probe-model'
      },
      translationFetch: async () =>
        new Response('bad gateway', {
          status: 502,
          statusText: 'Bad Gateway'
        })
    })

    const result = await runtime.testTranslationService({
      sourceLanguage: 'en',
      targetLanguage: 'zh'
    })

    expect(result.success).toBe(false)
    expect(result.translationModel).toBe('probe-model')
    expect(result.sourceLanguage).toBe('en')
    expect(result.targetLanguage).toBe('zh')
    expect(result.translationBaseUrlSummary).toBe('https://example.test/v1/chat/completions')
    expect(result.message).toBe(getAppCopy().runtime.translationServiceHttpError(502, 'Bad Gateway'))
  })

  it('reports invalid JSON from the translation service probe', async () => {
    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        AIVPLAYER_TRANSLATION_BASE_URL: 'https://example.test/v1/chat/completions',
        AIVPLAYER_TRANSLATION_API_KEY: 'probe-key',
        AIVPLAYER_TRANSLATION_MODEL: 'probe-model'
      },
      translationFetch: async () =>
        new Response('not-json', {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    })

    const result = await runtime.testTranslationService({
      sourceLanguage: 'en',
      targetLanguage: 'zh'
    })

    expect(result.success).toBe(false)
    expect(result.translationModel).toBe('probe-model')
    expect(result.sourceLanguage).toBe('en')
    expect(result.targetLanguage).toBe('zh')
    expect(result.translationBaseUrlSummary).toBe('https://example.test/v1/chat/completions')
    expect(result.message).toBe(getAppCopy().runtime.translationServiceInvalidJson)
  })

  it('reports empty translated text from the translation service probe', async () => {
    const runtime = createWhisperCppRuntime({
      userDataPath: tempDirectory,
      resourcePath: join(tempDirectory, 'resources'),
      env: {
        AIVPLAYER_TRANSLATION_BASE_URL: 'https://example.test/v1/chat/completions',
        AIVPLAYER_TRANSLATION_API_KEY: 'probe-key',
        AIVPLAYER_TRANSLATION_MODEL: 'probe-model'
      },
      translationFetch: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify([{ id: 'cue-1', text: '   ' }])
                }
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    })

    const result = await runtime.testTranslationService({
      sourceLanguage: 'zh',
      targetLanguage: 'en'
    })

    expect(result.success).toBe(false)
    expect(result.translationModel).toBe('probe-model')
    expect(result.sourceLanguage).toBe('zh')
    expect(result.targetLanguage).toBe('en')
    expect(result.translationBaseUrlSummary).toBe('https://example.test/v1/chat/completions')
    expect(result.message).toBe(getAppCopy().runtime.translationServiceEmptyResponse)
    expect(result.sampleSourceText).toBe('今天的天气很好，我们正在测试字幕翻译。')
  })
})
