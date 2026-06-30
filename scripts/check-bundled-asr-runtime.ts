import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getWhisperBinaryNames as getSupportedWhisperBinaryNames } from '../src/main/ai/whisper-binary.ts'

export type BundledAsrRuntimeCheckResult = {
  ok: boolean
  resourcePath: string
  whisperCandidates: string[]
  ffmpegCandidates: string[]
  whisperBinaryPath: string | null
  ffmpegPath: string | null
  missing: string[]
  message: string
}

const POSIX_FFMPEG_BINARY_NAMES = ['ffmpeg']
const WINDOWS_FFMPEG_BINARY_NAMES = ['ffmpeg.exe']

function getWhisperBinaryNames(platform = process.platform): string[] {
  return getSupportedWhisperBinaryNames(platform)
}

function getFfmpegBinaryNames(platform = process.platform): string[] {
  return platform === 'win32' ? WINDOWS_FFMPEG_BINARY_NAMES : POSIX_FFMPEG_BINARY_NAMES
}

function getExecutableAccessMode(platform = process.platform): number {
  return platform === 'win32' ? constants.F_OK : constants.F_OK | constants.X_OK
}

async function findExecutable(candidates: string[], platform = process.platform): Promise<string | null> {
  const mode = getExecutableAccessMode(platform)

  for (const candidate of candidates) {
    try {
      await access(candidate, mode)
      return candidate
    } catch {
      // Try the next candidate.
    }
  }

  return null
}

export async function checkBundledAsrRuntime(options?: {
  resourcePath?: string
  platform?: NodeJS.Platform
}): Promise<BundledAsrRuntimeCheckResult> {
  const platform = options?.platform ?? process.platform
  const resourcePath = options?.resourcePath ?? resolve('resources')
  const whisperCandidates = getWhisperBinaryNames(platform).map((binaryName) =>
    join(resourcePath, 'whisper.cpp', binaryName)
  )
  const ffmpegCandidates = getFfmpegBinaryNames(platform).map((binaryName) => join(resourcePath, 'ffmpeg', binaryName))
  const [whisperBinaryPath, ffmpegPath] = await Promise.all([
    findExecutable(whisperCandidates, platform),
    findExecutable(ffmpegCandidates, platform)
  ])
  const missing = [
    ...(whisperBinaryPath ? [] : ['whisper.cpp']),
    ...(ffmpegPath ? [] : ['ffmpeg'])
  ]
  const ok = missing.length === 0
  const message = ok
    ? `ASR runtime is ready: ${whisperBinaryPath} + ${ffmpegPath}`
    : [
        'ASR runtime is missing from the release resources.',
        `Expected whisper.cpp binary in ${join(resourcePath, 'whisper.cpp')} (default: resources/whisper.cpp).`,
        `Expected ffmpeg binary in ${join(resourcePath, 'ffmpeg')} (default: resources/ffmpeg).`,
        'Stage platform-specific binaries before running npm run dist.'
      ].join('\n')

  return {
    ok,
    resourcePath,
    whisperCandidates,
    ffmpegCandidates,
    whisperBinaryPath,
    ffmpegPath,
    missing,
    message
  }
}

async function main(): Promise<void> {
  const result = await checkBundledAsrRuntime({
    resourcePath: process.env.AIVPLAYER_RESOURCE_DIR || resolve('resources')
  })

  console.log(result.message)

  if (!result.ok) {
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
