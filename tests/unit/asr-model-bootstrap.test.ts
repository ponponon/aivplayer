import { describe, expect, it, vi } from 'vitest'
import { getRecommendedWhisperModelManifest } from '../../src/core/ai/asr-models'
import { createAsrModelBootstrapState, runAsrModelBootstrap, type AsrModelBootstrapState } from '../../src/shared/asr-model-bootstrap'
import type { AsrRuntimeStatus } from '../../src/shared/media-types'

function createRuntimeStatus(overrides: Partial<AsrRuntimeStatus> = {}): AsrRuntimeStatus {
  return {
    available: false,
    backend: 'whisper.cpp',
    binaryPath: '/runtime/whisper-cli',
    ffmpegPath: '/runtime/ffmpeg',
    modelDirectory: '/models',
    installedModels: [],
    recommendedModel: 'ggml-large-v3-turbo-q5_0.bin',
    recommendedModelManifest: getRecommendedWhisperModelManifest(),
    whisperVersion: 'test',
    message: '未安装模型',
    ...overrides
  }
}

describe('ASR model bootstrap', () => {
  it('keeps a packaged runtime blocked without trying to download a model', async () => {
    const manifest = getRecommendedWhisperModelManifest()
    const downloadModel = vi.fn()
    const states: AsrModelBootstrapState[] = []

    const result = await runAsrModelBootstrap({
      runtime: {
        healthCheck: async () => createRuntimeStatus({ binaryPath: null, ffmpegPath: null, message: '运行时缺失' }),
        downloadModel
      },
      manifest,
      sourceId: 'modelscope',
      onState: (state) => states.push(state)
    })

    expect(result.status).toBe('blocked')
    expect(downloadModel).not.toHaveBeenCalled()
    expect(states.map((state) => state.status)).toEqual(['checking', 'blocked'])
  })

  it('downloads the recommended model when the native runtime is ready', async () => {
    const manifest = getRecommendedWhisperModelManifest()
    const states: AsrModelBootstrapState[] = []
    let installed = false

    const result = await runAsrModelBootstrap({
      runtime: {
        healthCheck: async () => createRuntimeStatus({
          available: installed,
          installedModels: installed ? [{ id: manifest.id, name: manifest.name, path: '/models/model.bin', sizeBytes: manifest.expectedSizeBytes }] : []
        }),
        downloadModel: async (_modelId, sourceId, onProgress) => {
          expect(sourceId).toBe('modelscope')
          onProgress?.({
            modelId: manifest.id,
            fileName: manifest.fileName,
            sourceId: 'modelscope',
            sourceName: 'ModelScope',
            receivedBytes: 10,
            totalBytes: 100,
            percent: 0.1,
            message: '模型下载中。'
          })
          installed = true
          return { success: true, message: '模型已就绪', sourceId: 'modelscope', model: undefined }
        }
      },
      manifest,
      sourceId: 'modelscope',
      onState: (state) => states.push(state)
    })

    expect(result.status).toBe('ready')
    expect(states.map((state) => state.status)).toEqual(['checking', 'downloading', 'downloading', 'ready'])
    expect(result.progress?.percent).toBe(0.1)
  })

  it('reports a failed download so the next app launch can retry', async () => {
    const manifest = getRecommendedWhisperModelManifest()
    const result = await runAsrModelBootstrap({
      runtime: {
        healthCheck: async () => createRuntimeStatus(),
        downloadModel: async () => ({ success: false, message: '网络不可用' })
      },
      manifest,
      sourceId: 'modelscope',
      onState: () => undefined
    })

    expect(result.status).toBe('error')
    expect(result.error).toBe('网络不可用')
  })

  it('marks an already installed model ready without downloading', async () => {
    const manifest = getRecommendedWhisperModelManifest()
    const model = { id: manifest.id, name: manifest.name, path: '/models/model.bin', sizeBytes: manifest.expectedSizeBytes }
    const downloadModel = vi.fn()
    const result = await runAsrModelBootstrap({
      runtime: {
        healthCheck: async () => createRuntimeStatus({ available: true, installedModels: [model], message: '已就绪' }),
        downloadModel
      },
      manifest,
      sourceId: 'modelscope',
      onState: () => undefined
    })

    expect(result.status).toBe('ready')
    expect(downloadModel).not.toHaveBeenCalled()
  })

  it('creates a stable idle state for renderer startup before bootstrap begins', () => {
    const manifest = getRecommendedWhisperModelManifest()
    expect(createAsrModelBootstrapState(manifest, 'modelscope')).toMatchObject({
      status: 'idle',
      modelId: manifest.id,
      sourceId: 'modelscope',
      sourceName: 'ModelScope'
    })
  })
})
