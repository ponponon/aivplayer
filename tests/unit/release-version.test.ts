import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'aivplayer-release-version-'))
  temporaryDirectories.push(root)
  const artifactsDirectory = join(root, 'artifacts')
  await mkdir(artifactsDirectory, { recursive: true })
  const packageJsonPath = join(root, 'package.json')
  await writeFile(packageJsonPath, JSON.stringify({ version: '0.4.0' }))
  await writeFile(join(artifactsDirectory, 'AIVPlayer-0.4.0-arm64-mac.zip'), 'package')
  await writeFile(join(artifactsDirectory, 'latest-mac.yml'), [
    'version: 0.4.0',
    'files:',
    '  - url: AIVPlayer-0.4.0-arm64-mac.zip',
    '    sha512: fixture',
    '    size: 7',
    'path: AIVPlayer-0.4.0-arm64-mac.zip'
  ].join('\n'))
  await writeFile(join(artifactsDirectory, 'builder-debug.yml'), 'arm64:\n  files: []\n')
  return { artifactsDirectory, packageJsonPath }
}

async function runCheck(fixture: Awaited<ReturnType<typeof createFixture>>, tag = 'v0.4.0') {
  return execFileAsync(process.execPath, [
    join(projectRoot, 'scripts/check-release-version.mjs'),
    '--artifacts-dir', fixture.artifactsDirectory,
    '--package-json', fixture.packageJsonPath,
    '--tag', tag
  ], { cwd: projectRoot })
}

describe('release version gate', () => {
  it('accepts matching tag, package version and latest metadata references', async () => {
    const fixture = await createFixture()
    const result = await runCheck(fixture)
    expect(result.stdout).toContain('Release version verified: v0.4.0')
  })

  it('excludes builder debug YAML from the publishable artifact boundary', async () => {
    const fixture = await createFixture()
    const result = await runCheck(fixture)
    expect(result.stdout).toContain('1 update metadata file(s)')
  })

  it('rejects a tag that does not match package.json', async () => {
    const fixture = await createFixture()
    await expect(runCheck(fixture, 'v0.5.0')).rejects.toThrow('tag/version mismatch')
  })

  it('rejects stale metadata versions and missing package references', async () => {
    const fixture = await createFixture()
    await writeFile(join(fixture.artifactsDirectory, 'latest-mac.yml'), 'version: 0.3.3\npath: AIVPlayer-0.4.0-arm64-mac.zip\n')
    await expect(runCheck(fixture)).rejects.toThrow('Update metadata version mismatch')

    await writeFile(join(fixture.artifactsDirectory, 'latest-mac.yml'), 'version: 0.4.0\npath: AIVPlayer-0.4.0-missing.zip\n')
    await expect(runCheck(fixture)).rejects.toThrow('references missing artifact')
  })
})
