import { describe, expect, it } from 'vitest'
import { findWhisperModelManifest, getRecommendedWhisperModelManifest } from '../../src/core/ai/asr-models'

describe('ASR model manifests', () => {
  it('uses whisper large-v3-turbo q5_0 as the recommended local subtitle model', () => {
    const model = getRecommendedWhisperModelManifest()

    expect(model.id).toBe('large-v3-turbo-q5_0')
    expect(model.fileName).toBe('ggml-large-v3-turbo-q5_0.bin')
    expect(model.sources.map((source) => source.id)).toEqual(['modelscope', 'huggingface'])
    expect(model.sources.find((source) => source.id === 'modelscope')?.url).toBe(
      'https://modelscope.cn/models/timeless/whispercpp/resolve/master/ggml-large-v3-turbo-q5_0.bin'
    )
    expect(model.sources.find((source) => source.id === 'huggingface')?.url).toBe(
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin'
    )
    expect(model.expectedSizeBytes).toBeGreaterThan(500 * 1024 * 1024)
  })

  it('finds manifests by model id', () => {
    expect(findWhisperModelManifest('small-q5_1')?.fileName).toBe('ggml-small-q5_1.bin')
    expect(findWhisperModelManifest('missing-model')).toBeNull()
  })
})
