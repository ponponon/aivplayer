import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getSpeakerDiarizationModelDirectory,
  getSpeakerDiarizationModelPaths,
  getSpeakerDiarizationModelStatus,
  getSpeakerDiarizationPlatformCapability,
  getSpeakerDiarizationPlatformId,
  SPEAKER_DIARIZATION_MODEL_FILES,
  SPEAKER_DIARIZATION_MODEL_ID,
  SPEAKER_DIARIZATION_MODEL_VERSION
} from '../../src/core/ai/speaker-diarization-model'

describe('speaker diarization model contract', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-speaker-diarization-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('maps native package support without treating Windows ARM64 as supported', () => {
    expect(getSpeakerDiarizationPlatformId('darwin', 'arm64')).toBe('darwin-arm64')
    expect(getSpeakerDiarizationPlatformId('linux', 'x64')).toBe('linux-x64')
    expect(getSpeakerDiarizationPlatformId('win32', 'arm64')).toBe('unsupported')
    expect(getSpeakerDiarizationPlatformCapability('win32', 'arm64')).toMatchObject({
      supported: false,
      nativePackageId: null
    })
    expect(getSpeakerDiarizationPlatformCapability('darwin', 'arm64')).toMatchObject({
      supported: true,
      nativePackageId: 'sherpa-onnx-darwin-arm64'
    })
  })

  it('keeps model files under a versioned user-data directory', () => {
    const modelDirectory = getSpeakerDiarizationModelDirectory(tempDirectory)
    const paths = getSpeakerDiarizationModelPaths(modelDirectory)

    expect(modelDirectory).toContain(join('models', 'speaker-diarization', 'sherpa-onnx', SPEAKER_DIARIZATION_MODEL_VERSION))
    expect(paths.modelDirectory).toBe(modelDirectory)
    expect(paths.segmentationModelPath).toContain('sherpa-onnx-pyannote-segmentation-3-0/model.onnx')
    expect(paths.embeddingModelPath).toContain('3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx')
    expect(SPEAKER_DIARIZATION_MODEL_ID).toBe('sherpa-onnx-pyannote-3.0-3dspeaker-eres2net-zh-cn')
  })

  it('reports missing model files and does not claim readiness', () => {
    const status = getSpeakerDiarizationModelStatus(tempDirectory, 'darwin', 'arm64')

    expect(status.available).toBe(false)
    expect(status.modelFilesAvailable).toBe(false)
    expect(status.missingFiles).toEqual(SPEAKER_DIARIZATION_MODEL_FILES.map((file) => file.relativePath))
    expect(status.message).toContain('说话人模型文件不完整')
  })

  it('requires segmentation, embedding and license files before reporting ready', async () => {
    const modelDirectory = getSpeakerDiarizationModelDirectory(tempDirectory)
    const paths = getSpeakerDiarizationModelPaths(modelDirectory)
    await mkdir(join(modelDirectory, 'sherpa-onnx-pyannote-segmentation-3-0'), { recursive: true })
    await writeFile(paths.segmentationModelPath, Buffer.from([1]))
    await writeFile(paths.embeddingModelPath, Buffer.from([2]))

    const incomplete = getSpeakerDiarizationModelStatus(tempDirectory, 'darwin', 'arm64')
    expect(incomplete.available).toBe(false)
    expect(incomplete.missingFiles).toEqual(['sherpa-onnx-pyannote-segmentation-3-0/LICENSE'])

    await writeFile(paths.segmentationLicensePath, 'MIT')
    const ready = getSpeakerDiarizationModelStatus(tempDirectory, 'darwin', 'arm64')
    expect(ready.available).toBe(true)
    expect(ready.modelFilesAvailable).toBe(true)
    expect(ready.missingFiles).toEqual([])
  })
})
