import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Pinned Transformers.js model layout; model files are installed separately from the app source. */
export const PERSON_MATTE_MODEL_ID = 'Xenova/modnet' as const
export const PERSON_MATTE_MODEL_DIRECTORY = 'person-matte' as const
export const PERSON_MATTE_MODEL_REVISION = 'main' as const

const PERSON_MATTE_MODEL_BASE_URL = `https://huggingface.co/${PERSON_MATTE_MODEL_ID}/resolve/${PERSON_MATTE_MODEL_REVISION}`

export const PERSON_MATTE_MODEL_FILES = [
  { relativePath: 'config.json', url: `${PERSON_MATTE_MODEL_BASE_URL}/config.json` },
  { relativePath: 'preprocessor_config.json', url: `${PERSON_MATTE_MODEL_BASE_URL}/preprocessor_config.json` },
  { relativePath: 'onnx/model.onnx', url: `${PERSON_MATTE_MODEL_BASE_URL}/onnx/model.onnx` }
] as const

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
  return isPersonMatteModelPathsAvailable(paths)
}

export function isPersonMatteModelPathsAvailable(paths: PersonMatteModelPaths): boolean {
  return existsSync(paths.configPath) && existsSync(paths.preprocessorConfigPath) && existsSync(paths.modelPath)
}

export function resolvePersonMatteModelPaths(resourcePath: string, userDataPath?: string): PersonMatteModelPaths {
  const candidates = userDataPath ? [getPersonMatteModelPaths(userDataPath), getPersonMatteModelPaths(resourcePath)] : [getPersonMatteModelPaths(resourcePath)]
  return candidates.find(isPersonMatteModelPathsAvailable) ?? candidates[0]!
}

export function getPersonMatteModelStatus(resourcePath: string, userDataPath?: string): PersonMatteModelStatus {
  const paths = resolvePersonMatteModelPaths(resourcePath, userDataPath)
  const available = isPersonMatteModelPathsAvailable(paths)
  return {
    available,
    modelId: PERSON_MATTE_MODEL_ID,
    modelDirectory: paths.modelDirectory,
    message: available
      ? `人物抠像模型 ${PERSON_MATTE_MODEL_ID} 已就绪`
      : `人物抠像模型文件不完整，需要 config.json、preprocessor_config.json 和 onnx/model.onnx：${paths.modelDirectory}`
  }
}
