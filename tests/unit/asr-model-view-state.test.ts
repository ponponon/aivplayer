import { describe, expect, it } from 'vitest'
import { getRecommendedWhisperModelManifest } from '../../src/main/ai/asr-models'
import { getAppCopy } from '../../src/shared/i18n'
import { buildAsrModelViewState } from '../../src/renderer/src/app/asr-model-view-state'
import type { AsrModelDownloadProgress, AsrModelInfo } from '../../src/shared/media-types'

const recommendedManifest = getRecommendedWhisperModelManifest()
const copy = getAppCopy()

const installedRecommendedModel: AsrModelInfo = {
  id: recommendedManifest.id,
  name: recommendedManifest.name,
  path: '/tmp/ggml-large-v3-turbo-q5_0.bin',
  sizeBytes: recommendedManifest.expectedSizeBytes
}

describe('ASR model view state', () => {
  it('asks the user to download when the recommended model is missing', () => {
    const state = buildAsrModelViewState({
      copy,
      recommendedManifest,
      installedModels: [],
      isDownloadingModel: false,
      downloadProgress: null,
      hasWhisperRuntime: false,
      hasFfmpegRuntime: true
    })

    expect(state.installState).toBe('missing')
    expect(state.statusLabel).toBe(copy.modelView.missingLabel)
    expect(state.actionLabel).toBe(copy.modelView.downloadRecommended)
    expect(state.shouldShowProgress).toBe(false)
    expect(state.description).toBe(copy.modelView.missing(recommendedManifest.name, recommendedManifest.ramRequirement))
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
      copy,
      recommendedManifest,
      installedModels: [],
      isDownloadingModel: true,
      downloadProgress,
      hasWhisperRuntime: false,
      hasFfmpegRuntime: true
    })

    expect(state.installState).toBe('downloading')
    expect(state.statusLabel).toBe(copy.modelView.downloadingLabel)
    expect(state.actionLabel).toBe(copy.modelView.downloadRecommended)
    expect(state.shouldShowProgress).toBe(true)
    expect(state.description).toBe(copy.modelView.downloading('ModelScope'))
  })

  it('marks the model as installed and points to the missing runtime separately', () => {
    const state = buildAsrModelViewState({
      copy,
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
    expect(state.statusLabel).toBe(copy.modelView.installedLabel)
    expect(state.actionLabel).toBe(copy.modelView.redownload)
    expect(state.shouldShowProgress).toBe(false)
    expect(state.description).toBe(copy.modelView.installedNeedsWhisper)
  })

  it('marks the model as ready when the runtime is also available', () => {
    const state = buildAsrModelViewState({
      copy,
      recommendedManifest,
      installedModels: [installedRecommendedModel],
      isDownloadingModel: false,
      downloadProgress: null,
      hasWhisperRuntime: true,
      hasFfmpegRuntime: true
    })

    expect(state.installState).toBe('installed-ready')
    expect(state.statusLabel).toBe(copy.modelView.installedLabel)
    expect(state.actionLabel).toBe(copy.modelView.redownload)
    expect(state.description).toBe(copy.modelView.installedReady)
  })
})
