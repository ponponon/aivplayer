import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import packageMetadata from '../../../package.json'

export const VISION_PACK_ID = 'aivplayer-vision-pack'
export const VISION_PACK_VERSION = packageMetadata.version
export const VISION_PACK_BASE_URL = 'https://releases.quniv.cn/aivplayer/vision-pack'
const VISION_PACK_ROOT = 'models/vision-pack'
const VISION_PACK_ACTIVE_POINTER = 'active.json'

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
  revision?: string
  platform: NodeJS.Platform
  arch: string
  entry: string
}

type VisionPackActivePointer = {
  id: string
  version: string
  revision: string
  platform: NodeJS.Platform
  arch: string
}

function getPlatformKey(): string {
  return `${process.platform}-${process.arch}`
}

// 本地目录按内容 revision 组织（跨 app 版本共享同一份视觉运行时）。
// 未指定 revision 时回退到当前 app 版本目录名，保持向后兼容。
export function getVisionPackDirectory(userDataPath: string, revision?: string): string {
  const key = revision ?? VISION_PACK_VERSION
  return join(getVisionPackRootDirectory(userDataPath), key, getPlatformKey())
}

export function getVisionPackRootDirectory(userDataPath: string): string {
  return join(resolve(userDataPath), VISION_PACK_ROOT)
}

export function getVisionPackActivePointerPath(userDataPath: string): string {
  return join(getVisionPackRootDirectory(userDataPath), VISION_PACK_ACTIVE_POINTER)
}

export function getBundledVisionPackDirectory(resourcePath: string): string {
  return join(resolve(resourcePath), 'vision-pack')
}

function getVisionPackCandidates(resourcePath: string, userDataPath: string): string[] {
  const configured = process.env.AIVPLAYER_VISION_PACK_DIR?.trim()
  return [
    configured ? resolve(configured) : null,
    getActiveVisionPackDirectory(userDataPath),
    getVisionPackDirectory(userDataPath),
    getBundledVisionPackDirectory(resourcePath)
  ].filter((value): value is string => Boolean(value))
}

function getActiveVisionPackDirectory(userDataPath: string): string | null {
  try {
    const pointer = JSON.parse(readFileSync(getVisionPackActivePointerPath(userDataPath), 'utf8')) as unknown
    if (!isVisionPackActivePointer(pointer)) return null
    if (pointer.version !== VISION_PACK_VERSION || pointer.platform !== process.platform || pointer.arch !== process.arch) return null
    const directory = getVisionPackDirectory(userDataPath, pointer.revision)
    return isDirectoryAvailableSync(directory) ? directory : null
  } catch {
    return null
  }
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
  const installedVersion = available ? readInstalledManifestVersion(resolvedDirectory) : undefined
  return {
    available,
    downloadable: true,
    version: installedVersion ?? VISION_PACK_VERSION,
    directory,
    message: available
      ? `视觉运行组件 ${installedVersion ?? VISION_PACK_VERSION} 已就绪`
      : `视觉运行组件未安装，需要下载 Vision Pack ${VISION_PACK_VERSION}`
  }
}

function readInstalledManifestVersion(directory: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(getVisionPackManifestPath(directory), 'utf8')) as { version?: unknown }
    return typeof manifest.version === 'string' ? manifest.version : undefined
  } catch {
    return undefined
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
  // 内容寻址后包内 version 是构建时的 app 版本，跨版本复用时可能与当前版本不一致，
  // 因此以 id + revision 为准，version 仅作展示。
  return candidate.id === VISION_PACK_ID
    && typeof candidate.version === 'string'
    && (typeof candidate.revision === 'undefined' || /^[a-f0-9]{32,64}$/u.test(candidate.revision))
    && typeof candidate.platform === 'string'
    && typeof candidate.arch === 'string'
    && candidate.entry === 'package.json'
}

export function isVisionPackActivePointer(value: unknown): value is VisionPackActivePointer {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<VisionPackActivePointer>
  return candidate.id === VISION_PACK_ID
    && typeof candidate.version === 'string'
    && typeof candidate.revision === 'string'
    && /^[a-f0-9]{32,64}$/u.test(candidate.revision)
    && typeof candidate.platform === 'string'
    && typeof candidate.arch === 'string'
}
