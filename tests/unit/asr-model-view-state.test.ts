import { describe, expect, it } from 'vitest'
import { getRecommendedWhisperModelManifest } from '../../src/main/ai/asr-models'
import { buildAsrModelViewState } from '../../src/renderer/src/app/asr-model-view-state'
import type { AsrModelDownloadProgress, AsrModelInfo } from '../../src/shared/media-types'

const recommendedManifest = getRecommendedWhisperModelManifest()

const installedRecommendedModel: AsrModelInfo = {
  id: recommendedManifest.id,
  name: recommendedManifest.name,
  path: '/tmp/ggml-large-v3-turbo-q5_0.bin',
  sizeBytes: recommendedManifest.expectedSizeBytes
}

describe('ASR model view state', () => {
  it('asks the user to download when the recommended model is missing', () => {
    const state = buildAsrModelViewState({
      recommendedManifest,
      installedModels: [],
      isDownloadingModel: false,
      downloadProgress: null,
      hasWhisperRuntime: false,
      hasFfmpegRuntime: true
    })

    expect(state.installState).toBe('missing')
    expect(state.statusLabel).toBe('未安装')
    expect(state.actionLabel).toBe('下载推荐模型')
    expect(state.shouldShowProgress).toBe(false)
    expect(state.description).toContain('建议预留')
  })

  it('shows the selected source while the model is downloading', () => {
    const downloadProgress: AsrModelDownloadProgress = {
      modelId: recommendedManifest.id,
      fileName: recommendedManifest.fileName,
      sourceId: 'modelscope',
      sourceName: 'ModelScope',
      receivedBytes: 300,
      totalBytes: 1000,
      percent: 0.3,
      message: '模型下载中。'
    }

    const state = buildAsrModelViewState({
      recommendedManifest,
      installedModels: [],
      isDownloadingModel: true,
      downloadProgress,
      hasWhisperRuntime: false,
      hasFfmpegRuntime: true
    })

    expect(state.installState).toBe('downloading')
    expect(state.statusLabel).toBe('下载中')
    expect(state.actionLabel).toBe('下载中')
    expect(state.shouldShowProgress).toBe(true)
    expect(state.description).toBe('正在从 ModelScope 下载推荐模型。')
  })

  it('marks the model as installed and points to the missing runtime separately', () => {
    const state = buildAsrModelViewState({
      recommendedManifest,
      installedModels: [installedRecommendedModel],
      isDownloadingModel: false,
      downloadProgress: {
        modelId: recommendedManifest.id,
        fileName: recommendedManifest.fileName,
        sourceId: 'modelscope',
        sourceName: 'ModelScope',
        receivedBytes: recommendedManifest.expectedSizeBytes,
        totalBytes: recommendedManifest.expectedSizeBytes,
        percent: 1,
        message: '模型下载完成。'
      },
      hasWhisperRuntime: false,
      hasFfmpegRuntime: true
    })

    expect(state.installState).toBe('installed-needs-runtime')
    expect(state.statusLabel).toBe('已安装')
    expect(state.actionLabel).toBe('重新下载 / 更换来源')
    expect(state.shouldShowProgress).toBe(false)
    expect(state.description).toBe('模型已就绪，但还需要安装 whisper.cpp 运行时。')
  })

  it('marks the model as ready when the runtime is also available', () => {
    const state = buildAsrModelViewState({
      recommendedManifest,
      installedModels: [installedRecommendedModel],
      isDownloadingModel: false,
      downloadProgress: null,
      hasWhisperRuntime: true,
      hasFfmpegRuntime: true
    })

    expect(state.installState).toBe('installed-ready')
    expect(state.statusLabel).toBe('已安装')
    expect(state.actionLabel).toBe('重新下载 / 更换来源')
    expect(state.description).toBe('模型已就绪，可用于本地字幕生成。')
  })
})
