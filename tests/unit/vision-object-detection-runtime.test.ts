import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getVisionObjectDetectionModelDirectory, getVisionObjectDetectionModelPaths } from '../../src/core/ai/vision-object-detection-model'
import { DEFAULT_VISION_OBJECT_DETECTION_THRESHOLD, VisionObjectDetectionRuntime, normalizeVisionObjectDetections } from '../../src/core/ai/vision-object-detection-runtime'

async function prepareModelDirectory(userDataPath: string): Promise<string> {
  const modelDirectory = getVisionObjectDetectionModelDirectory(userDataPath)
  const paths = getVisionObjectDetectionModelPaths(modelDirectory)
  await mkdir(join(modelDirectory, 'onnx'), { recursive: true })
  await writeFile(paths.configPath, '{}')
  await writeFile(paths.preprocessorConfigPath, '{}')
  await writeFile(paths.modelPath, Buffer.from([1]))
  await writeFile(paths.licensePath, 'MIT')
  return modelDirectory
}

describe('vision object detection runtime', () => {
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-vision-object-detection-runtime-'))
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('does not load a pipeline when the local model contract is incomplete', async () => {
    let loadCount = 0
    const runtime = new VisionObjectDetectionRuntime({
      userDataPath: tempDirectory,
      platform: 'darwin',
      arch: 'arm64',
      loadPipeline: async () => {
        loadCount += 1
        throw new Error('should not load')
      }
    })

    await expect(runtime.prepare()).rejects.toThrow('物体检测模型文件不完整')
    expect(loadCount).toBe(0)
  })

  it('loads the local pipeline once and returns normalized detections', async () => {
    await prepareModelDirectory(tempDirectory)
    let loadCount = 0
    let receivedThreshold: number | undefined
    const runtime = new VisionObjectDetectionRuntime({
      userDataPath: tempDirectory,
      platform: 'darwin',
      arch: 'arm64',
      loadPipeline: async (paths) => {
        loadCount += 1
        expect(paths.modelDirectory).toContain('transformers-object-detection')
        return {
          readImage: async (imagePath) => ({ imagePath }),
          detector: async (_image, options) => {
            receivedThreshold = options?.threshold
            return [
              { label: ' person ', score: 1.2, box: { xmin: 90, ymin: 30, xmax: 10, ymax: 50 } },
              { label: '', score: 0.5, box: { xmin: 1, ymin: 2, xmax: 3, ymax: 4 } },
              { label: 'broken', score: 0.4, box: { xmin: 'bad' } }
            ]
          }
        }
      }
    })

    const result = await runtime.detectImage('/tmp/frame.jpg', 0.7)
    await runtime.prepare()

    expect(loadCount).toBe(1)
    expect(receivedThreshold).toBe(0.7)
    expect(result.imagePath).toBe('/tmp/frame.jpg')
    expect(result.threshold).toBe(0.7)
    expect(result.detections).toEqual([{ label: 'person', score: 1, box: { xmin: 10, ymin: 30, xmax: 90, ymax: 50 } }])
  })

  it('uses a bounded default threshold and rejects relative image paths', async () => {
    expect(DEFAULT_VISION_OBJECT_DETECTION_THRESHOLD).toBe(0.5)
    expect(normalizeVisionObjectDetections(null)).toEqual([])
    await prepareModelDirectory(tempDirectory)
    const runtime = new VisionObjectDetectionRuntime({
      userDataPath: tempDirectory,
      platform: 'darwin',
      arch: 'arm64',
      loadPipeline: async () => ({ detector: async () => [], readImage: async () => ({}) })
    })

    await expect(runtime.detectImage('relative/frame.jpg')).rejects.toThrow('绝对图片路径')
  })
})
