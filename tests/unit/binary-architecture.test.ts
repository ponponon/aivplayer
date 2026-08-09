import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkBinaryArchitectures, detectBinaryArchitecture } from '../../scripts/check-binary-architecture.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function pe(machine: number) {
  const buffer = Buffer.alloc(128)
  buffer.write('MZ', 0, 'ascii')
  buffer.writeUInt32LE(64, 0x3c)
  buffer.write('PE\u0000\u0000', 64, 'ascii')
  buffer.writeUInt16LE(machine, 68)
  return buffer
}

function elf(machine: number) {
  const buffer = Buffer.alloc(64)
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(buffer)
  buffer[4] = 2
  buffer[5] = 1
  buffer.writeUInt16LE(machine, 18)
  return buffer
}

describe('binary architecture gate', () => {
  it('detects PE and ELF x64 / arm64 headers', () => {
    expect(detectBinaryArchitecture(pe(0x8664), 'x64.exe')).toBe('x64')
    expect(detectBinaryArchitecture(pe(0xaa64), 'arm64.exe')).toBe('arm64')
    expect(detectBinaryArchitecture(elf(62), 'x64')).toBe('x64')
    expect(detectBinaryArchitecture(elf(183), 'arm64')).toBe('arm64')
  })

  it('rejects one mismatched runtime from a target architecture set', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-architecture-'))
    temporaryDirectories.push(directory)
    const arm64Path = join(directory, 'whisper-cli')
    const x64Path = join(directory, 'ffmpeg')
    await writeFile(arm64Path, elf(183))
    await writeFile(x64Path, elf(62))
    await expect(checkBinaryArchitectures({ architecture: 'arm64', files: [arm64Path, x64Path] })).rejects.toThrow('architecture mismatch')
  })
})
