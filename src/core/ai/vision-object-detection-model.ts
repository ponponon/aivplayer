import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import type {
  VisionObjectDetectionModelFile,
  VisionObjectDetectionModelFileStatus,
  VisionObjectDetectionModelStatus,
  VisionObjectDetectionPlatformCapability,
  VisionObjectDetectionPlatformId
} from '../../shared/vision-object-detection-types'

export const VISION_OBJECT_DETECTION_PROVIDER_ID = 'transformers-object-detection' as const
export const VISION_OBJECT_DETECTION_MODEL_ID = 'local-transformers-object-detection' as const
export const VISION_OBJECT_DETECTION_MODEL_VERSION = 'local-v1' as const
export const VISION_OBJECT_DETECTION_MODEL_DIRECTORY = 'object-detection' as const

/**
 * The model is intentionally user-supplied. No third-party detector is bundled
 * until its weights, license, and redistribution terms have been reviewed.
 */
export const VISION_OBJECT_DETECTION_MODEL_FILES: readonly VisionObjectDetectionModelFile[] = [
  { relativePath: 'config.json', kind: 'config' },
  { relativePath: 'preprocessor_config.json', kind: 'preprocessor' },
  { relativePath: 'onnx/model.onnx', kind: 'onnx' },
  { relativePath: 'LICENSE', kind: 'license' }
]

const SUPPORTED_PLATFORMS = new Set<VisionObjectDetectionPlatformId>([
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-x64'
])

export type VisionObjectDetectionModelPaths = {
  modelDirectory: string
  configPath: string
  preprocessorConfigPath: string
  modelPath: string
  licensePath: string
}

export function getVisionObjectDetectionPlatformId(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): VisionObjectDetectionPlatformId {
  const platformId = `${platform}-${arch}` as VisionObjectDetectionPlatformId
  return SUPPORTED_PLATFORMS.has(platformId) ? platformId : 'unsupported'
}

export function getVisionObjectDetectionPlatformCapability(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): VisionObjectDetectionPlatformCapability {
  const platformId = getVisionObjectDetectionPlatformId(platform, arch)
  if (platformId !== 'unsupported') {
    return {
      platform: platformId,
      supported: true,
      runtimeId: 'transformers.js-wasm',
      reason: '当前平台可使用 Transformers.js WASM 物体检测 Provider'
    }
  }

  return {
    platform: 'unsupported',
    supported: false,
    runtimeId: 'transformers.js-wasm',
    reason: `Transformers.js 物体检测 Provider 当前未覆盖 ${platform}-${arch}`
  }
}

export function getVisionObjectDetectionModelDirectory(userDataPath: string, configuredModelDirectory?: string | null): string {
  if (typeof configuredModelDirectory === 'string' && configuredModelDirectory.trim() && isAbsolute(configuredModelDirectory.trim())) {
    return resolve(configuredModelDirectory.trim())
  }
  return join(resolve(userDataPath), 'models', 'vision', VISION_OBJECT_DETECTION_MODEL_DIRECTORY, VISION_OBJECT_DETECTION_PROVIDER_ID, VISION_OBJECT_DETECTION_MODEL_VERSION)
}

export function getVisionObjectDetectionModelPaths(modelDirectory: string): VisionObjectDetectionModelPaths {
  const normalizedDirectory = resolve(modelDirectory)
  return {
    modelDirectory: normalizedDirectory,
    configPath: join(normalizedDirectory, 'config.json'),
    preprocessorConfigPath: join(normalizedDirectory, 'preprocessor_config.json'),
    modelPath: join(normalizedDirectory, 'onnx', 'model.onnx'),
    licensePath: join(normalizedDirectory, 'LICENSE')
  }
}

function isNonEmptyFile(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    const file = statSync(path)
    return file.isFile() && file.size > 0
  } catch {
    return false
  }
}

export function getVisionObjectDetectionModelFileStatuses(modelDirectory: string): VisionObjectDetectionModelFileStatus[] {
  const paths = getVisionObjectDetectionModelPaths(modelDirectory)
  const pathByRelativePath: Record<string, string> = {
    'config.json': paths.configPath,
    'preprocessor_config.json': paths.preprocessorConfigPath,
    'onnx/model.onnx': paths.modelPath,
    LICENSE: paths.licensePath
  }

  return VISION_OBJECT_DETECTION_MODEL_FILES.map((file) => ({
    ...file,
    path: pathByRelativePath[file.relativePath]!,
    available: isNonEmptyFile(pathByRelativePath[file.relativePath]!)
  }))
}

export function isVisionObjectDetectionModelAvailable(modelDirectory: string): boolean {
  return getVisionObjectDetectionModelFileStatuses(modelDirectory).every((file) => file.available)
}

export function getVisionObjectDetectionModelStatus(
  userDataPath: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  configuredModelDirectory?: string | null
): VisionObjectDetectionModelStatus {
  const modelDirectory = getVisionObjectDetectionModelDirectory(userDataPath, configuredModelDirectory)
  const files = getVisionObjectDetectionModelFileStatuses(modelDirectory)
  const missingFiles = files.filter((file) => !file.available).map((file) => file.relativePath)
  const modelFilesAvailable = missingFiles.length === 0
  const platformCapability = getVisionObjectDetectionPlatformCapability(platform, arch)
  const available = modelFilesAvailable && platformCapability.supported

  let message: string
  if (!platformCapability.supported) {
    message = platformCapability.reason
  } else if (!modelFilesAvailable) {
    message = `物体检测模型文件不完整，缺少：${missingFiles.join('、')}；请准备模型和 LICENSE 收据：${modelDirectory}`
  } else {
    message = `物体检测 Provider ${VISION_OBJECT_DETECTION_PROVIDER_ID} 已就绪`
  }

  return {
    available,
    modelFilesAvailable,
    providerId: VISION_OBJECT_DETECTION_PROVIDER_ID,
    modelId: VISION_OBJECT_DETECTION_MODEL_ID,
    modelVersion: VISION_OBJECT_DETECTION_MODEL_VERSION,
    modelDirectory,
    platform: platformCapability,
    files,
    missingFiles,
    message
  }
}
