import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function getBinaryNames(platform: NodeJS.Platform): { encoder: string; converter: string } {
  return platform === 'win32'
    ? { encoder: 'heif-enc.exe', converter: 'heif-convert.exe' }
    : { encoder: 'heif-enc', converter: 'heif-convert' }
}

async function isExecutable(path: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    await access(path, platform === 'win32' ? constants.F_OK : constants.F_OK | constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function checkTool(path: string): Promise<string | null> {
  try {
    await execFileAsync(path, ['--version'], { timeout: 5000, maxBuffer: 256 * 1024 })
    return null
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr ?? '') : ''
    return (stderr.trim() || (error instanceof Error ? error.message : String(error))).split('\n')[0]
  }
}

export async function checkHeifRuntime(options?: { resourcePath?: string; platform?: NodeJS.Platform }): Promise<{ ok: boolean; message: string }> {
  const platform = options?.platform ?? process.platform
  const resourcePath = options?.resourcePath ?? resolve('resources')
  const names = getBinaryNames(platform)
  const encoderPath = join(resourcePath, 'heif', names.encoder)
  const converterPath = join(resourcePath, 'heif', names.converter)
  const missing = [
    ...(await isExecutable(encoderPath, platform) ? [] : ['heif-enc']),
    ...(await isExecutable(converterPath, platform) ? [] : ['heif-convert'])
  ]
  const executionErrors = []
  if (missing.length === 0) {
    const [encoderError, converterError] = await Promise.all([checkTool(encoderPath), checkTool(converterPath)])
    if (encoderError) executionErrors.push(`heif-enc: ${encoderError}`)
    if (converterError) executionErrors.push(`heif-convert: ${converterError}`)
  }
  if (missing.length > 0 && executionErrors.length === 0 && platform === 'darwin' && await isExecutable('/usr/bin/sips', platform)) {
    return { ok: true, message: 'HEIF runtime is ready: macOS /usr/bin/sips' }
  }
  const ok = missing.length === 0 && executionErrors.length === 0
  return {
    ok,
    message: ok
      ? `HEIF runtime is ready: ${encoderPath} + ${converterPath}`
      : [
          'HEIF runtime is missing or cannot execute.',
          `Expected platform-specific heif-enc and heif-convert in ${join(resourcePath, 'heif')}.`,
          ...(missing.length > 0 ? [`Missing: ${missing.join(', ')}`] : []),
          ...(executionErrors.length > 0 ? ['Execution errors:', ...executionErrors] : []),
          'Stage a self-contained libheif runtime with npm run release:prepare-heif-runtime before packaging Windows/Linux.'
        ].join('\n')
  }
}

async function main(): Promise<void> {
  const result = await checkHeifRuntime({ resourcePath: process.env.AIVPLAYER_RESOURCE_DIR || resolve('resources') })
  console.log(result.message)
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
