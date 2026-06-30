import { basename } from 'node:path'

const POSIX_WHISPER_BINARY_NAMES = ['whisper-whisper-cli', 'whisper-cli', 'whisper-cpp', 'main']
const WINDOWS_WHISPER_BINARY_NAMES = ['whisper-whisper-cli.exe', 'whisper-cli.exe', 'whisper-cpp.exe', 'main.exe']

const WHISPER_DEPRECATION_WARNING_PATTERN = /Please use '([^']+)' instead/i

export function getWhisperBinaryNames(platform: NodeJS.Platform = process.platform): string[] {
  return platform === 'win32' ? WINDOWS_WHISPER_BINARY_NAMES : POSIX_WHISPER_BINARY_NAMES
}

export function isWhisperBinaryName(fileName: string, platform: NodeJS.Platform = process.platform): boolean {
  return getWhisperBinaryNames(platform).includes(fileName)
}

export function getWhisperBinaryDestinationName(sourcePath: string, platform: NodeJS.Platform = process.platform): string {
  const sourceName = basename(sourcePath)

  if (isWhisperBinaryName(sourceName, platform)) {
    return sourceName
  }

  return platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
}

export function parseWhisperBinaryReplacementName(output: string): string | null {
  const normalizedOutput = output.replace(/\r\n/g, '\n')
  const match = normalizedOutput.match(WHISPER_DEPRECATION_WARNING_PATTERN)

  return match?.[1] ?? null
}
