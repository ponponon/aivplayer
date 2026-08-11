import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getVisionObjectDetectionModelDirectory,
  getVisionObjectDetectionModelPaths,
  getVisionObjectDetectionModelStatus,
  getVisionObjectDetectionPlatformCapability,
  getVisionObjectDetectionPlatformId,
  VISION_OBJECT_DETECTION_MODEL_FILES,
  VISION_OBJECT_DETECTION_MODEL_ID,
  VISION_OBJECT_DETECTION_MODEL_VERSION
} from '../../src/core/ai/vision-object-detection-model'

describe('vision object detection model contract', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-vision-object-detection-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('exposes the supported desktop platforms without claiming unsupported targets', () => {
    expect(getVisionObjectDetectionPlatformId('darwin', 'arm64')).toBe('darwin-arm64')
    expect(getVisionObjectDetectionPlatformId('linux', 'x64')).toBe('linux-x64')
    expect(getVisionObjectDetectionPlatformId('win32', 'arm64')).toBe('win32-arm64')
    expect(getVisionObjectDetectionPlatformId('win32', 'ia32')).toBe('unsupported')
    expect(getVisionObjectDetectionPlatformCapability('win32', 'arm64')).toMatchObject({
      supported: true,
      runtimeId: 'transformers.js-wasm'
    })
  })

  it('keeps the default model under a versioned user-data directory', () => {
    const modelDirectory = getVisionObjectDetectionModelDirectory(tempDirectory)
    const paths = getVisionObjectDetectionModelPaths(modelDirectory)

    expect(modelDirectory).toContain(join('models', 'vision', 'object-detection', 'transformers-object-detection', VISION_OBJECT_DETECTION_MODEL_VERSION))
    expect(paths.modelDirectory).toBe(modelDirectory)
    expect(paths.modelPath).toContain('onnx/model.onnx')
    expect(paths.licensePath).toContain('LICENSE')
    expect(VISION_OBJECT_DETECTION_MODEL_ID).toBe('local-transformers-object-detection')
  })

  it('uses an explicit absolute directory and ignores relative configuration', () => {
    const configuredDirectory = join(tempDirectory, 'models', 'object-custom')
    expect(getVisionObjectDetectionModelDirectory(tempDirectory, configuredDirectory)).toBe(configuredDirectory)
    expect(getVisionObjectDetectionModelDirectory(tempDirectory, 'relative-model')).toContain(join('models', 'vision', 'object-detection'))
  })

  it('requires model metadata, ONNX weights and a license receipt', async () => {
    const modelDirectory = getVisionObjectDetectionModelDirectory(tempDirectory)
    const paths = getVisionObjectDetectionModelPaths(modelDirectory)
    const missing = getVisionObjectDetectionModelStatus(tempDirectory, 'darwin', 'arm64')

    expect(missing.available).toBe(false)
    expect(missing.modelFilesAvailable).toBe(false)
    expect(missing.missingFiles).toEqual(VISION_OBJECT_DETECTION_MODEL_FILES.map((file) => file.relativePath))

    await mkdir(join(modelDirectory, 'onnx'), { recursive: true })
    await writeFile(paths.configPath, '{}')
    await writeFile(paths.preprocessorConfigPath, '{}')
    await writeFile(paths.modelPath, Buffer.from([1]))

    const withoutLicense = getVisionObjectDetectionModelStatus(tempDirectory, 'darwin', 'arm64')
    expect(withoutLicense.available).toBe(false)
    expect(withoutLicense.missingFiles).toEqual(['LICENSE'])

    await writeFile(paths.licensePath, 'MIT')
    const ready = getVisionObjectDetectionModelStatus(tempDirectory, 'darwin', 'arm64')
    expect(ready.available).toBe(true)
    expect(ready.modelFilesAvailable).toBe(true)
    expect(ready.missingFiles).toEqual([])
  })
})
