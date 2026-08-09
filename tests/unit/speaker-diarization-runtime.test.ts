import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpeakerDiarizationRuntime } from '../../src/core/ai/speaker-diarization-runtime'
import { getSpeakerDiarizationModelDirectory, getSpeakerDiarizationModelPaths } from '../../src/core/ai/speaker-diarization-model'

describe('speaker diarization runtime', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-speaker-runtime-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  async function createModelFixture(): Promise<void> {
    const modelDirectory = getSpeakerDiarizationModelDirectory(tempDirectory)
    const paths = getSpeakerDiarizationModelPaths(modelDirectory)
    await mkdir(join(modelDirectory, 'sherpa-onnx-pyannote-segmentation-3-0'), { recursive: true })
    await writeFile(paths.segmentationModelPath, Buffer.from([1]))
    await writeFile(paths.embeddingModelPath, Buffer.from([2]))
    await writeFile(paths.segmentationLicensePath, 'MIT')
  }

  it('does not load the native module when model files are missing', async () => {
    const loadModule = vi.fn()
    const runtime = new SpeakerDiarizationRuntime({ userDataPath: tempDirectory, loadModule })

    await expect(runtime.prepare()).rejects.toThrow('说话人模型文件不完整')
    expect(loadModule).not.toHaveBeenCalled()
  })

  it('loads the provider lazily and maps native segments to shared seconds', async () => {
    await createModelFixture()
    const process = vi.fn(() => [
      { start: -0.2, end: 1.25, speaker: 2 },
      { start: 2, end: 2, speaker: 1 },
      { start: 3, end: 4.5, speaker: 1 }
    ])
    const OfflineSpeakerDiarization = vi.fn(function (this: { sampleRate: number }, config: unknown) {
      this.sampleRate = 16000
      Object.assign(this, { process, config })
    })
    const runtime = new SpeakerDiarizationRuntime({
      userDataPath: tempDirectory,
      platform: 'darwin',
      arch: 'arm64',
      loadModule: () => ({
        readWave: () => ({ sampleRate: 16000, samples: new Float32Array(32000) }),
        OfflineSpeakerDiarization
      })
    })

    await runtime.prepare()
    const result = await runtime.diarizeWaveFile('/tmp/example.wav', { numClusters: 2 })

    expect(result).toEqual({
      sampleRate: 16000,
      durationSeconds: 2,
      segments: [
        { startSeconds: 0, endSeconds: 1.25, speakerId: 2 },
        { startSeconds: 3, endSeconds: 4.5, speakerId: 1 }
      ]
    })
    expect(process).toHaveBeenCalledOnce()
    expect(OfflineSpeakerDiarization).toHaveBeenCalledWith(expect.objectContaining({
      clustering: expect.objectContaining({ numClusters: 2 }),
      minDurationOn: 0.2,
      minDurationOff: 0.5
    }))
  })

  it('rejects audio with a wrong sample rate before constructing the model', async () => {
    await createModelFixture()
    const OfflineSpeakerDiarization = vi.fn(function (this: { sampleRate: number }) {
      this.sampleRate = 16000
    })
    const runtime = new SpeakerDiarizationRuntime({
      userDataPath: tempDirectory,
      platform: 'darwin',
      arch: 'arm64',
      loadModule: () => ({
        readWave: () => ({ sampleRate: 48000, samples: new Float32Array(32) }),
        OfflineSpeakerDiarization
      })
    })

    await expect(runtime.diarizeWaveFile('/tmp/example.wav')).rejects.toThrow('需要 16000 Hz')
    expect(OfflineSpeakerDiarization).not.toHaveBeenCalled()
  })
})
