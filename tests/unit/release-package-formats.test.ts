import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const projectRoot = process.cwd()
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function makeBytes(prefix: Buffer, trailer?: Buffer) {
  const bytes = Buffer.alloc(1024)
  prefix.copy(bytes)
  trailer?.copy(bytes, bytes.length - 512)
  return bytes
}

async function createFixture(files: Record<string, Buffer | string>) {
  const directory = await mkdtemp(join(tmpdir(), 'aivplayer-release-formats-'))
  temporaryDirectories.push(directory)
  for (const [name, value] of Object.entries(files)) await writeFile(join(directory, name), value)
  return directory
}

async function runCheck(platform: string, artifactsDirectory: string) {
  return execFileAsync(process.execPath, [
    join(projectRoot, 'scripts/check-release-package-formats.mjs'),
    '--platform', platform,
    '--artifacts-dir', artifactsDirectory
  ], { cwd: projectRoot })
}

describe('release package format check', () => {
  it.each([
    ['macos', {
      'AIVPlayer-0.4.0.dmg': makeBytes(Buffer.from('not-a-dmg'), Buffer.from('koly')),
      'AIVPlayer-0.4.0.zip': makeBytes(Buffer.from('PK\u0003\u0004')),
      'AIVPlayer-0.4.0.pkg': makeBytes(Buffer.from('xar!'))
    }],
    ['windows', { 'AIVPlayer Setup 0.4.0.exe': makeBytes(Buffer.from('MZ')) }],
    ['linux', {
      'AIVPlayer-0.4.0.AppImage': makeBytes(Buffer.from([0x7f, 0x45, 0x4c, 0x46])),
      'aivplayer_0.4.0_amd64.deb': makeBytes(Buffer.from('!<arch>\n'))
    }]
  ])('accepts valid %s package signatures', async (platform, files) => {
    const artifactsDirectory = await createFixture(files)
    const result = await runCheck(platform, artifactsDirectory)
    expect(result.stdout).toContain(`Release package formats verified: ${platform}`)
  })

  it('rejects a non-empty file with the wrong package signature', async () => {
    const artifactsDirectory = await createFixture({ 'AIVPlayer-0.4.0.AppImage': Buffer.from('not an appimage') })
    await expect(runCheck('linux', artifactsDirectory)).rejects.toThrow('AIVPlayer-0.4.0.AppImage')
  })

  it('rejects an empty package instead of treating its filename as evidence', async () => {
    const artifactsDirectory = await createFixture({ 'AIVPlayer Setup 0.4.0.exe': Buffer.alloc(0) })
    await expect(runCheck('windows', artifactsDirectory)).rejects.toThrow('AIVPlayer Setup 0.4.0.exe')
  })
})
