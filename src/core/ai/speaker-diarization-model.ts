import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type {
  SpeakerDiarizationModelFile,
  SpeakerDiarizationModelFileStatus,
  SpeakerDiarizationModelStatus,
  SpeakerDiarizationPlatformCapability,
  SpeakerDiarizationPlatformId
} from '../../shared/speaker-diarization-types'

export const SPEAKER_DIARIZATION_PROVIDER_ID = 'sherpa-onnx' as const
export const SPEAKER_DIARIZATION_MODEL_ID = 'sherpa-onnx-pyannote-3.0-3dspeaker-eres2net-zh-cn' as const
export const SPEAKER_DIARIZATION_MODEL_VERSION = '1.13.4' as const
export const SPEAKER_DIARIZATION_MODEL_DIRECTORY = 'speaker-diarization' as const

const SEGMENTATION_DIRECTORY = 'sherpa-onnx-pyannote-segmentation-3-0'
const SEGMENTATION_MODEL_FILE = `${SEGMENTATION_DIRECTORY}/model.onnx`
const SEGMENTATION_LICENSE_FILE = `${SEGMENTATION_DIRECTORY}/LICENSE`
const EMBEDDING_MODEL_FILE = '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx'

/**
 * The files are deliberately described, but not downloaded or bundled here.
 * Model redistribution and each model's license must be reviewed before a
 * release includes them.
 */
export const SPEAKER_DIARIZATION_MODEL_FILES: readonly SpeakerDiarizationModelFile[] = [
  { relativePath: SEGMENTATION_MODEL_FILE, kind: 'segmentation' },
  { relativePath: EMBEDDING_MODEL_FILE, kind: 'embedding' },
  { relativePath: SEGMENTATION_LICENSE_FILE, kind: 'license' }
]

const SUPPORTED_NATIVE_PLATFORMS = new Map<SpeakerDiarizationPlatformId, string>([
  ['darwin-arm64', 'sherpa-onnx-darwin-arm64'],
  ['darwin-x64', 'sherpa-onnx-darwin-x64'],
  ['linux-arm64', 'sherpa-onnx-linux-arm64'],
  ['linux-x64', 'sherpa-onnx-linux-x64'],
  ['win32-ia32', 'sherpa-onnx-win-ia32'],
  ['win32-x64', 'sherpa-onnx-win-x64']
])

export type SpeakerDiarizationModelPaths = {
  modelDirectory: string
  segmentationModelPath: string
  embeddingModelPath: string
  segmentationLicensePath: string
}

export function getSpeakerDiarizationPlatformId(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): SpeakerDiarizationPlatformId {
  const platformId = `${platform}-${arch}`
  return SUPPORTED_NATIVE_PLATFORMS.has(platformId as SpeakerDiarizationPlatformId)
    ? platformId as SpeakerDiarizationPlatformId
    : 'unsupported'
}

export function getSpeakerDiarizationPlatformCapability(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): SpeakerDiarizationPlatformCapability {
  const platformId = getSpeakerDiarizationPlatformId(platform, arch)
  const nativePackageId = SUPPORTED_NATIVE_PLATFORMS.get(platformId) ?? null

  if (nativePackageId) {
    return {
      platform: platformId,
      supported: true,
      nativePackageId,
      reason: `当前平台可使用原生 Provider：${nativePackageId}`
    }
  }

  return {
    platform: 'unsupported',
    supported: false,
    nativePackageId: null,
    reason: platform === 'win32' && arch === 'arm64'
      ? 'sherpa-onnx-node 当前没有 Windows ARM64 原生包，暂不能启用本地说话人 Provider'
      : `sherpa-onnx-node 当前未提供 ${platform}-${arch} 原生包`
  }
}

export function getSpeakerDiarizationModelDirectory(userDataPath: string): string {
  return join(resolve(userDataPath), 'models', SPEAKER_DIARIZATION_MODEL_DIRECTORY, SPEAKER_DIARIZATION_PROVIDER_ID, SPEAKER_DIARIZATION_MODEL_VERSION)
}

export function getSpeakerDiarizationModelPaths(modelDirectory: string): SpeakerDiarizationModelPaths {
  const normalizedDirectory = resolve(modelDirectory)
  return {
    modelDirectory: normalizedDirectory,
    segmentationModelPath: join(normalizedDirectory, SEGMENTATION_MODEL_FILE),
    embeddingModelPath: join(normalizedDirectory, EMBEDDING_MODEL_FILE),
    segmentationLicensePath: join(normalizedDirectory, SEGMENTATION_LICENSE_FILE)
  }
}

function isNonEmptyFile(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    return statSync(path).isFile() && statSync(path).size > 0
  } catch {
    return false
  }
}

export function getSpeakerDiarizationModelFileStatuses(modelDirectory: string): SpeakerDiarizationModelFileStatus[] {
  const paths = getSpeakerDiarizationModelPaths(modelDirectory)
  const pathByRelativePath: Record<string, string> = {
    [SEGMENTATION_MODEL_FILE]: paths.segmentationModelPath,
    [EMBEDDING_MODEL_FILE]: paths.embeddingModelPath,
    [SEGMENTATION_LICENSE_FILE]: paths.segmentationLicensePath
  }

  return SPEAKER_DIARIZATION_MODEL_FILES.map((file) => ({
    ...file,
    path: pathByRelativePath[file.relativePath]!,
    available: isNonEmptyFile(pathByRelativePath[file.relativePath]!)
  }))
}

export function isSpeakerDiarizationModelAvailable(modelDirectory: string): boolean {
  return getSpeakerDiarizationModelFileStatuses(modelDirectory).every((file) => file.available)
}

export function getSpeakerDiarizationModelStatus(
  userDataPath: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): SpeakerDiarizationModelStatus {
  const modelDirectory = getSpeakerDiarizationModelDirectory(userDataPath)
  const files = getSpeakerDiarizationModelFileStatuses(modelDirectory)
  const missingFiles = files.filter((file) => !file.available).map((file) => file.relativePath)
  const modelFilesAvailable = missingFiles.length === 0
  const platformCapability = getSpeakerDiarizationPlatformCapability(platform, arch)
  const available = modelFilesAvailable && platformCapability.supported

  let message: string
  if (!platformCapability.supported) {
    message = platformCapability.reason
  } else if (!modelFilesAvailable) {
    message = `说话人模型文件不完整，缺少：${missingFiles.join('、')}；模型目录：${modelDirectory}`
  } else {
    message = `说话人 Provider ${SPEAKER_DIARIZATION_PROVIDER_ID} 已就绪`
  }

  return {
    available,
    modelFilesAvailable,
    providerId: SPEAKER_DIARIZATION_PROVIDER_ID,
    modelId: SPEAKER_DIARIZATION_MODEL_ID,
    modelVersion: SPEAKER_DIARIZATION_MODEL_VERSION,
    modelDirectory,
    platform: platformCapability,
    files,
    missingFiles,
    message
  }
}
