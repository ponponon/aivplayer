import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Pinned Transformers.js model layout; model files are installed separately from the app source. */
export const PERSON_MATTE_MODEL_ID = 'Xenova/modnet' as const
export const PERSON_MATTE_MODEL_DIRECTORY = 'person-matte' as const

export type PersonMatteModelPaths = {
  modelDirectory: string
  configPath: string
  preprocessorConfigPath: string
  modelPath: string
}

export type PersonMatteModelStatus = {
  available: boolean
  modelId: typeof PERSON_MATTE_MODEL_ID
  modelDirectory: string
  message: string
}

export function getPersonMatteModelPaths(resourcePath: string): PersonMatteModelPaths {
  const modelDirectory = join(resolve(resourcePath), PERSON_MATTE_MODEL_DIRECTORY, 'Xenova', 'modnet')
  return {
    modelDirectory,
    configPath: join(modelDirectory, 'config.json'),
    preprocessorConfigPath: join(modelDirectory, 'preprocessor_config.json'),
    modelPath: join(modelDirectory, 'onnx', 'model.onnx')
  }
}

export function isPersonMatteModelAvailable(resourcePath: string): boolean {
  const paths = getPersonMatteModelPaths(resourcePath)
  return existsSync(paths.configPath) && existsSync(paths.preprocessorConfigPath) && existsSync(paths.modelPath)
}

export function getPersonMatteModelStatus(resourcePath: string): PersonMatteModelStatus {
  const paths = getPersonMatteModelPaths(resourcePath)
  const available = isPersonMatteModelAvailable(resourcePath)
  return {
    available,
    modelId: PERSON_MATTE_MODEL_ID,
    modelDirectory: paths.modelDirectory,
    message: available
      ? `人物抠像模型 ${PERSON_MATTE_MODEL_ID} 已就绪`
      : `人物抠像模型文件不完整，需要 config.json、preprocessor_config.json 和 onnx/model.onnx：${paths.modelDirectory}`
  }
}
