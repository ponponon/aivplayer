import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getPersonMatteModelPaths, getPersonMatteModelStatus, isPersonMatteModelAvailable, PERSON_MATTE_MODEL_ID } from '../../src/core/ai/person-matte-model'

describe('person matte model setup', () => {
  it('uses a pinned local Transformers.js model layout', () => {
    const paths = getPersonMatteModelPaths(join(process.cwd(), 'resources'))

    expect(PERSON_MATTE_MODEL_ID).toBe('Xenova/modnet')
    expect(paths.modelDirectory.endsWith('resources/person-matte/Xenova/modnet')).toBe(true)
    expect(paths.configPath.endsWith('config.json')).toBe(true)
    expect(paths.preprocessorConfigPath.endsWith('preprocessor_config.json')).toBe(true)
    expect(paths.modelPath.endsWith('onnx/model.onnx')).toBe(true)
  })

  it('reports missing model assets without trying a network request', () => {
    const resourcePath = join(process.cwd(), 'resources')
    const paths = getPersonMatteModelPaths(resourcePath)
    const status = getPersonMatteModelStatus(resourcePath)

    expect(isPersonMatteModelAvailable(resourcePath)).toBe(false)
    expect(status.available).toBe(false)
    expect(status.modelDirectory).toBe(paths.modelDirectory)
    expect(status.message).toContain('模型文件不完整')
    expect(existsSync(paths.modelPath)).toBe(false)
  })
})
