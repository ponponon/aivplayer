import { access, readFile, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export type PackagedResourceCheckResult = {
  ok: boolean
  resourcePath: string
  checked: string[]
  missing: string[]
  message: string
}

function getExecutableName(platform = process.platform): string {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

function getFfprobeName(platform = process.platform): string {
  return platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
}

async function fileExists(filePath: string, platform = process.platform): Promise<boolean> {
  try {
    await access(filePath, platform === 'win32' ? constants.F_OK : constants.F_OK | constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function hasWebAssets(webDirectory: string): Promise<boolean> {
  try {
    const entries = await readdir(join(webDirectory, 'assets'))
    return entries.length > 0
  } catch {
    return false
  }
}

async function hasValidRuntimeMetadata(filePath: string): Promise<boolean> {
  try {
    const value = JSON.parse(await readFile(filePath, 'utf8')) as {
      schemaVersion?: unknown
      applicationVersion?: unknown
      platform?: unknown
      components?: Record<string, unknown>
    }
    const components = value.components
    return value.schemaVersion === 1
      && typeof value.applicationVersion === 'string'
      && typeof value.platform === 'string'
      && Boolean(components)
      && ['whisperCpp', 'ffmpeg', 'ffprobe', 'libheif', 'siglip2'].every((name) => Boolean(components?.[name]))
      && Array.isArray((components?.siglip2 as { files?: unknown } | undefined)?.files)
  } catch {
    return false
  }
}

async function hasValidAppUpdateConfig(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf8')
    return ['owner:', 'repo:', 'provider: github', 'releaseType: release', 'updaterCacheDirName:']
      .every((entry) => content.split('\n').some((line) => line.trim().startsWith(entry)))
  } catch {
    return false
  }
}

export async function checkPackagedResources(options: {
  resourcePath: string
  platform?: NodeJS.Platform
}): Promise<PackagedResourceCheckResult> {
  const platform = options.platform ?? process.platform
  const resourcePath = resolve(options.resourcePath)
  const appUpdateConfigPath = join(resourcePath, 'app-update.yml')
  const checked = [
    join(resourcePath, 'web', 'index.html'),
    join(resourcePath, 'web', 'assets'),
    join(resourcePath, 'ffmpeg', getExecutableName(platform)),
    join(resourcePath, 'ffmpeg', getFfprobeName(platform)),
    join(resourcePath, 'LICENSE'),
    join(resourcePath, 'THIRD_PARTY_LICENSES.md'),
    join(resourcePath, 'vision-model-manifest.json'),
    join(resourcePath, 'runtime-metadata.json'),
    ...(platform === 'darwin' ? [appUpdateConfigPath] : [])
  ]
  const [webIndexExists, webAssetsExist, ffmpegExists, ffprobeExists, licenseExists, thirdPartyLicenseExists, visionModelManifestExists, runtimeMetadataExists] = await Promise.all([
    fileExists(checked[0]!, 'win32'),
    hasWebAssets(join(resourcePath, 'web')),
    fileExists(checked[2]!, platform),
    fileExists(checked[3]!, platform),
    fileExists(checked[4]!, 'win32'),
    fileExists(checked[5]!, 'win32'),
    fileExists(checked[6]!, 'win32'),
    hasValidRuntimeMetadata(checked[7]!)
  ])
  const appUpdateConfigExists = platform !== 'darwin' || await hasValidAppUpdateConfig(appUpdateConfigPath)
  const missing = [
    ...(webIndexExists ? [] : [checked[0]!]),
    ...(webAssetsExist ? [] : [checked[1]!]),
    ...(ffmpegExists ? [] : [checked[2]!]),
    ...(ffprobeExists ? [] : [checked[3]!]),
    ...(licenseExists ? [] : [checked[4]!]),
    ...(thirdPartyLicenseExists ? [] : [checked[5]!]),
    ...(visionModelManifestExists ? [] : [checked[6]!]),
    ...(runtimeMetadataExists ? [] : [checked[7]!]),
    ...(appUpdateConfigExists ? [] : [appUpdateConfigPath])
  ]
  const ok = missing.length === 0
  return {
    ok,
    resourcePath,
    checked,
    missing,
    message: ok
      ? `Packaged resources are ready: ${resourcePath}`
      : ['Packaged resources are incomplete.', ...missing.map((filePath) => `Missing: ${filePath}`)].join('\n')
  }
}

function getResourcePathFromArgs(args: string[]): string {
  const argumentIndex = args.indexOf('--resource-dir')
  const value = argumentIndex >= 0 ? args[argumentIndex + 1] : undefined
  return value || process.env.AIVPLAYER_PACKAGED_RESOURCE_DIR || resolve('release')
}

function getPlatformFromArgs(args: string[]): NodeJS.Platform {
  const argumentIndex = args.indexOf('--platform')
  const value = argumentIndex >= 0 ? args[argumentIndex + 1] : undefined
  if (!value) return process.platform
  if (value === 'darwin' || value === 'win32' || value === 'linux') return value
  throw new Error(`Unsupported packaged resource platform: ${value}`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const result = await checkPackagedResources({ resourcePath: getResourcePathFromArgs(args), platform: getPlatformFromArgs(args) })
  console.log(result.message)
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
