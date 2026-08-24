import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, normalize, resolve } from 'node:path'

const AIVPLAYER_BUNDLE_ID = 'cn.quniv.aivplayer'
const PLUTIL_PATH = '/usr/bin/plutil'
const LSREGISTER_PATHS = [
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
  '/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Support/lsregister'
]

export type MacApplicationBundle = {
  path: string
  bundleId: string
  version: string
}

type CommandRunner = (command: string, args: string[]) => boolean

/**
 * Resolve the .app directory from a packaged macOS executable path.
 *
 * /Applications/AIVPlayer.app/Contents/MacOS/AIVPlayer
 *                         ^ 3 parent directories ^
 */
export function getMacApplicationBundlePath(executablePath: string): string {
  return normalize(resolve(dirname(dirname(dirname(executablePath)))))
}

export function compareMacApplicationVersions(left: string, right: string): number {
  const leftParts = parseVersionParts(left)
  const rightParts = parseVersionParts(right)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1
  }

  return 0
}

export function shouldUnregisterMacApplication(
  currentApplicationPath: string,
  currentVersion: string,
  candidate: MacApplicationBundle
): boolean {
  if (normalize(resolve(candidate.path)) === normalize(resolve(currentApplicationPath))) return false
  if (candidate.bundleId !== AIVPLAYER_BUNDLE_ID) return false

  // Never unregister a newer copy. This also makes launching a newer DMG
  // safe when an older installed copy is still present.
  return compareMacApplicationVersions(candidate.version, currentVersion) <= 0
}

/**
 * Remove stale AIVPlayer entries from LaunchServices without deleting or
 * ejecting anything. This is intentionally limited to user-visible app roots
 * and mounted volumes; the app must not crawl arbitrary user media folders.
 */
export function cleanupMacApplicationRegistrations(options: {
  currentApplicationPath: string
  currentVersion: string
  searchRoots?: string[]
  applications?: MacApplicationBundle[]
  lsregisterPath?: string
  runCommand?: CommandRunner
}): string[] {
  const applications = options.applications ?? discoverMacApplications(options.searchRoots ?? getDefaultSearchRoots())
  const staleApplications = applications.filter((candidate) => shouldUnregisterMacApplication(
    options.currentApplicationPath,
    options.currentVersion,
    candidate
  ))
  const runCommand = options.runCommand ?? runLaunchServicesCommand
  const lsregisterPath = options.lsregisterPath ?? findLsregisterPath()
  if (!lsregisterPath) return []

  const unregistered: string[] = []
  for (const application of staleApplications) {
    if (runCommand(lsregisterPath, ['-u', application.path])) unregistered.push(application.path)
  }

  // Reassert the current app after unregistering older copies. The operation
  // is best-effort: LaunchServices failures must never block app startup.
  if (staleApplications.length > 0) runCommand(lsregisterPath, ['-f', options.currentApplicationPath])
  return unregistered
}

function parseVersionParts(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/, 3)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0))
}

function getDefaultSearchRoots(): string[] {
  const userHome = homedir()
  return [
    '/Applications',
    join(userHome, 'Applications'),
    join(userHome, 'Downloads'),
    join(userHome, 'Desktop'),
    '/Volumes'
  ]
}

function discoverMacApplications(searchRoots: string[]): MacApplicationBundle[] {
  const candidates = new Map<string, MacApplicationBundle>()
  for (const root of searchRoots) {
    if (!existsSync(root)) continue
    for (const candidatePath of listApplicationPaths(root)) {
      const bundle = readMacApplicationBundle(candidatePath)
      if (!bundle || bundle.bundleId !== AIVPLAYER_BUNDLE_ID) continue
      candidates.set(normalize(resolve(candidatePath)), bundle)
    }
  }
  return [...candidates.values()]
}

function listApplicationPaths(root: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return []
  }

  // DMGs expose the app one directory below /Volumes/<volume>/AIVPlayer.app;
  // regular user folders generally contain the app directly.
  if (root === '/Volumes') {
    return entries.flatMap((volumeName) => {
      const volumePath = join(root, volumeName)
      return join(volumePath, 'AIVPlayer.app')
    })
  }

  return entries
    .filter((entry) => entry.toLowerCase().endsWith('.app'))
    .map((entry) => join(root, entry))
}

function readMacApplicationBundle(applicationPath: string): MacApplicationBundle | null {
  const plistPath = join(applicationPath, 'Contents', 'Info.plist')
  try {
    const raw = execFileSync(PLUTIL_PATH, ['-convert', 'json', '-o', '-', '--', plistPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const plist = JSON.parse(raw) as Record<string, unknown>
    const bundleId = typeof plist.CFBundleIdentifier === 'string' ? plist.CFBundleIdentifier : ''
    const version = typeof plist.CFBundleShortVersionString === 'string'
      ? plist.CFBundleShortVersionString
      : typeof plist.CFBundleVersion === 'string' ? plist.CFBundleVersion : ''
    if (!bundleId || !version) return null
    return { path: applicationPath, bundleId, version }
  } catch {
    return null
  }
}

function findLsregisterPath(): string | null {
  return LSREGISTER_PATHS.find((path) => existsSync(path)) ?? null
}

function runLaunchServicesCommand(command: string, args: string[]): boolean {
  try {
    const result = spawnSync(command, args, {
      stdio: 'ignore',
      timeout: 5000
    })
    return result.status === 0
  } catch {
    return false
  }
}
