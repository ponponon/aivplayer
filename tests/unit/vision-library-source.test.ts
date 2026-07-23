import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VISION_FRAME_INTERVAL_SECONDS, VISION_MODEL_ID, VISION_MODEL_VARIANT } from '../../src/shared/vision-types'
import { getVisionModelPaths } from '../../src/main/ai/vision-model'

const projectRoot = process.cwd()

describe('vision library setup', () => {
  it('uses the checked-in model layout and the expected frame interval', () => {
    const paths = getVisionModelPaths(join(projectRoot, 'resources'))

    expect(VISION_MODEL_ID).toBe('siglip2-base-patch16-224-ONNX')
    expect(VISION_MODEL_VARIANT).toBe('uint8')
    expect(VISION_FRAME_INTERVAL_SECONDS).toBe(3)
    expect(paths.combinedModelPath.endsWith('onnx/model_uint8.onnx')).toBe(true)
    expect(paths.textModelPath.endsWith('onnx/text_model_uint8.onnx')).toBe(true)
    expect(paths.visionModelPath.endsWith('onnx/vision_model_uint8.onnx')).toBe(true)
  })

  it('keeps the local model files available for development', () => {
    const paths = getVisionModelPaths(join(projectRoot, 'resources'))
    expect(existsSync(paths.combinedModelPath)).toBe(true)
    expect(existsSync(paths.textModelPath)).toBe(true)
    expect(existsSync(paths.visionModelPath)).toBe(true)
  })

  it('exposes the visual search IPC surface', () => {
    const source = readFileSync(join(projectRoot, 'src/main/ipc-vision.ts'), 'utf8')
    expect(source).toContain('VISION_INDEX_START')
    expect(source).toContain('VISION_INDEX_CANCEL')
    expect(source).toContain('VISION_SEARCH_TEXT')
    expect(source).toContain('VISION_SEARCH_IMAGE')
  })
})
