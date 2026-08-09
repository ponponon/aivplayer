import { describe, expect, it } from 'vitest'
import {
  assertFfmpegVersionOutput,
  assertMacOSMinimumVersions,
  compareMacOSVersions,
  parseMachOArchitectures,
  parseMachOMinimumVersions
} from '../../scripts/check-macos-ffmpeg-runtime.ts'

const otoolBuildVersionOutput = `
Load command 11
      cmd LC_BUILD_VERSION
  cmdsize 32
 platform 1
    minos 12.0
      sdk 26.4
   ntools 1
     tool 3
     version 1266.8
`

describe('macOS FFmpeg runtime checks', () => {
  it('compares deployment target versions numerically', () => {
    expect(compareMacOSVersions('12.0', '12')).toBe(0)
    expect(compareMacOSVersions('12.1', '12.0')).toBe(1)
    expect(compareMacOSVersions('11.9', '12.0')).toBe(-1)
  })

  it('parses Mach-O architectures from file output', () => {
    expect(parseMachOArchitectures('resources/ffmpeg/ffmpeg: Mach-O 64-bit executable arm64')).toEqual(['arm64'])
    expect(parseMachOArchitectures('A Mach-O universal binary: x86_64 arm64')).toEqual(['arm64', 'x86_64'])
  })

  it('parses LC_BUILD_VERSION minos values', () => {
    expect(parseMachOMinimumVersions(otoolBuildVersionOutput, 'ffmpeg')).toEqual(['12.0'])
  })

  it('rejects a runtime built for a newer macOS than the release baseline', () => {
    expect(() => assertMacOSMinimumVersions('ffmpeg', ['26.0'], '12.0')).toThrow('minos 26.0')
    expect(() => assertMacOSMinimumVersions('ffmpeg', ['12.0'], '12.0')).not.toThrow()
  })

  it('requires normal ffmpeg and ffprobe version output', () => {
    expect(assertFfmpegVersionOutput('ffmpeg', 'ffmpeg version 8.1.2 Copyright')).toBe('ffmpeg version 8.1.2 Copyright')
    expect(assertFfmpegVersionOutput('ffprobe', 'ffprobe version 8.1.2 Copyright')).toBe('ffprobe version 8.1.2 Copyright')
    expect(() => assertFfmpegVersionOutput('ffmpeg', 'usage: ffmpeg')).toThrow('Unexpected ffmpeg version output')
  })
})
