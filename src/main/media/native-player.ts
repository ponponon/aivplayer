import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { NativePlaybackResult, NativePlayerStatus } from '../../shared/media-types'
import { getAppCopy } from '../../shared/i18n'
import type { AppLocale } from '../../shared/localization'

const execFileAsync = promisify(execFile)

const MPV_BINARY_NAMES = process.platform === 'win32' ? ['mpv.exe'] : ['mpv']
const COMMON_MPV_PATHS =
  process.platform === 'darwin'
    ? ['/opt/homebrew/bin/mpv', '/usr/local/bin/mpv']
    : process.platform === 'win32'
      ? []
    : ['/usr/bin/mpv', '/usr/local/bin/mpv']

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function getPathCandidates(env: NodeJS.ProcessEnv): string[] {
  const pathValue = env.PATH ?? ''

  return pathValue
    .split(delimiter)
    .filter(Boolean)
    .flatMap((directory) => MPV_BINARY_NAMES.map((binaryName) => join(directory, binaryName)))
}

export async function resolveMpvBinary(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const override = env.AIVPLAYER_MPV_BIN
  const candidates = [...(override ? [override] : []), ...COMMON_MPV_PATHS, ...getPathCandidates(env)].filter(
    (candidate) => isAbsolute(candidate)
  )

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }

  return null
}

export async function getNativePlayerStatus(
  getLocale?: () => AppLocale,
  env: NodeJS.ProcessEnv = process.env
): Promise<NativePlayerStatus> {
  const copy = getAppCopy(getLocale?.())
  const binaryPath = await resolveMpvBinary(env)

  if (!binaryPath) {
    return {
      available: false,
      backend: 'mpv',
      binaryPath: null,
      version: null,
      message: copy.runtime.openMpvMissing
    }
  }

  try {
    const { stdout } = await execFileAsync(binaryPath, ['--version'], { timeout: 4000 })
    const version = stdout.split('\n')[0] || null

    return {
      available: true,
      backend: 'mpv',
      binaryPath,
      version,
      message: version ? copy.runtime.openMpvDetected(version) : copy.runtime.openMpvDetected(binaryPath)
    }
  } catch {
    return {
      available: true,
      backend: 'mpv',
      binaryPath,
      version: null,
      message: copy.runtime.openMpvDetected(binaryPath)
    }
  }
}

export function stopNativePlayer(getLocale?: () => AppLocale): NativePlaybackResult {
  const copy = getAppCopy(getLocale?.())
  return {
    success: true,
    message: copy.runtime.stopNativePlayer
  }
}
