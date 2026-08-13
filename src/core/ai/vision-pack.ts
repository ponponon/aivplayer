import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

export const VISION_PACK_ID = 'aivplayer-vision-pack'
export const VISION_PACK_VERSION = '0.5.5'
export const VISION_PACK_BASE_URL = 'https://releases.quniv.cn/aivplayer/vision-pack'

export type VisionPackModuleName = '@huggingface/transformers' | '@lancedb/lancedb' | 'apache-arrow'

export type VisionPackStatus = {
  available: boolean
  downloadable: boolean
  version: string
  directory: string
  message: string
}

export function isVisionPackUnavailableMessage(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const message = value.trim().toLowerCase()
  return (message.includes('vision pack') || message.includes('视觉运行组件'))
    && (message.includes('未安装') || message.includes('not installed') || message.includes('无法加载') || message.includes('cannot load'))
}

type VisionPackManifest = {
  id: string
  version: string
  platform: NodeJS.Platform
  arch: string
  entry: string
}

function getPlatformKey(): string {
  return `${process.platform}-${process.arch}`
}

export function getVisionPackDirectory(userDataPath: string): string {
  return join(resolve(userDataPath), 'models', 'vision-pack', VISION_PACK_VERSION, getPlatformKey())
}

export function getBundledVisionPackDirectory(resourcePath: string): string {
  return join(resolve(resourcePath), 'vision-pack')
}

function getVisionPackCandidates(resourcePath: string, userDataPath: string): string[] {
  const configured = process.env.AIVPLAYER_VISION_PACK_DIR?.trim()
  return [
    configured ? resolve(configured) : null,
    getVisionPackDirectory(userDataPath),
    getBundledVisionPackDirectory(resourcePath)
  ].filter((value): value is string => Boolean(value))
}

export function resolveVisionPackDirectory(resourcePath: string, userDataPath: string): string | null {
  const configured = process.env.AIVPLAYER_VISION_PACK_DIR?.trim()
  const candidates = getVisionPackCandidates(resourcePath, userDataPath)
  if (configured && candidates[0] && isDirectoryAvailableSync(candidates[0])) return candidates[0]
  for (const candidate of candidates) {
    if (isDirectoryAvailableSync(candidate)) return candidate
  }
  return null
}

function isDirectoryAvailableSync(directory: string): boolean {
  try {
    const require = createRequire(join(directory, 'package.json'))
    require.resolve('./vision-pack.json')
    require.resolve('./package.json')
    return true
  } catch {
    return false
  }
}

export function getVisionPackStatus(resourcePath: string, userDataPath: string): VisionPackStatus {
  const resolvedDirectory = resolveVisionPackDirectory(resourcePath, userDataPath)
  if (!resolvedDirectory && isBundledVisionPackFallbackEnabled()) {
    return {
      available: true,
      downloadable: true,
      version: VISION_PACK_VERSION,
      directory: resolve('.'),
      message: '开发环境使用项目内视觉运行组件'
    }
  }
  const directory = resolvedDirectory ?? getVisionPackDirectory(userDataPath)
  const available = resolvedDirectory !== null
  return {
    available,
    downloadable: true,
    version: VISION_PACK_VERSION,
    directory,
    message: available
      ? `视觉运行组件 ${VISION_PACK_VERSION} 已就绪`
      : `视觉运行组件未安装，需要下载 Vision Pack ${VISION_PACK_VERSION}`
  }
}

export function loadVisionPackModule<T = unknown>(moduleName: VisionPackModuleName, resourcePath: string, userDataPath: string): T {
  const directory = resolveVisionPackDirectory(resourcePath, userDataPath)
  if (directory) {
    return createRequire(join(directory, 'package.json'))(moduleName) as T
  }

  if (isBundledVisionPackFallbackEnabled()) {
    return createRequire(resolve('package.json'))(moduleName) as T
  }

  throw new Error(`Vision Pack ${VISION_PACK_VERSION} 未安装，无法加载 ${moduleName}`)
}

function isBundledVisionPackFallbackEnabled(): boolean {
  return Boolean(process.env.ELECTRON_RENDERER_URL) || process.env.NODE_ENV === 'test' || process.env.AIVPLAYER_ALLOW_BUNDLED_VISION_PACK === '1'
}

export function getVisionPackManifestPath(directory: string): string {
  return join(directory, 'vision-pack.json')
}

export function getVisionPackPackageRoot(directory: string): string {
  return resolve(directory)
}

export function isVisionPackManifest(value: unknown): value is VisionPackManifest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<VisionPackManifest>
  return candidate.id === VISION_PACK_ID
    && candidate.version === VISION_PACK_VERSION
    && typeof candidate.platform === 'string'
    && typeof candidate.arch === 'string'
    && candidate.entry === 'package.json'
}
