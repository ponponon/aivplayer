import { access, readdir } from 'node:fs/promises'
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

export async function checkPackagedResources(options: {
  resourcePath: string
  platform?: NodeJS.Platform
}): Promise<PackagedResourceCheckResult> {
  const platform = options.platform ?? process.platform
  const resourcePath = resolve(options.resourcePath)
  const checked = [
    join(resourcePath, 'web', 'index.html'),
    join(resourcePath, 'web', 'assets'),
    join(resourcePath, 'ffmpeg', getExecutableName(platform)),
    join(resourcePath, 'ffmpeg', getFfprobeName(platform))
  ]
  const [webIndexExists, webAssetsExist, ffmpegExists, ffprobeExists] = await Promise.all([
    fileExists(checked[0]!, 'win32'),
    hasWebAssets(join(resourcePath, 'web')),
    fileExists(checked[2]!, platform),
    fileExists(checked[3]!, platform)
  ])
  const missing = [
    ...(webIndexExists ? [] : [checked[0]!]),
    ...(webAssetsExist ? [] : [checked[1]!]),
    ...(ffmpegExists ? [] : [checked[2]!]),
    ...(ffprobeExists ? [] : [checked[3]!])
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

async function main(): Promise<void> {
  const result = await checkPackagedResources({ resourcePath: getResourcePathFromArgs(process.argv.slice(2)) })
  console.log(result.message)
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
