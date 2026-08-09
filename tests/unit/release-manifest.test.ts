import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []
const projectRoot = process.cwd()

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function runManifest(artifactsDirectory: string, ...args: string[]): Promise<void> {
  await execFileAsync(process.execPath, [join(projectRoot, 'scripts/release-manifest.mjs'), '--artifacts-dir', artifactsDirectory, ...args], { cwd: projectRoot })
}

async function runManifestWithEnv(artifactsDirectory: string, environment: Record<string, string>, ...args: string[]): Promise<void> {
  await execFileAsync(process.execPath, [join(projectRoot, 'scripts/release-manifest.mjs'), '--artifacts-dir', artifactsDirectory, ...args], {
    cwd: projectRoot,
    env: { ...process.env, ...environment }
  })
}

describe('release manifest', () => {
  it('creates and verifies one hash manifest for every publishable artifact', async () => {
    const artifactsDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-release-manifest-'))
    temporaryDirectories.push(artifactsDirectory)
    await mkdir(join(artifactsDirectory, 'nested'), { recursive: true })
    await writeFile(join(artifactsDirectory, 'AIVPlayer-0.4.0.dmg'), 'mac package')
    await writeFile(join(artifactsDirectory, 'latest.yml'), 'version: 0.4.0')
    await writeFile(join(artifactsDirectory, 'nested', 'AIVPlayer-0.4.0.exe'), 'windows package')
    await writeFile(join(artifactsDirectory, 'notes.txt'), 'not a release asset')

    await runManifest(artifactsDirectory, '--tag', 'v0.4.0')
    const manifest = JSON.parse(await readFile(join(artifactsDirectory, 'release-manifest.json'), 'utf8')) as { tag: string; artifacts: Array<{ name: string; sha256: string }> }
    expect(manifest.tag).toBe('v0.4.0')
    expect(manifest.artifacts.map((artifact) => artifact.name)).toEqual(['AIVPlayer-0.4.0.dmg', 'AIVPlayer-0.4.0.exe', 'latest.yml'])
    expect(manifest.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256))).toBe(true)

    await runManifest(artifactsDirectory, '--tag', 'v0.4.0', '--verify')
  })

  it('blocks changed and unexpected artifacts before Gitee upload', async () => {
    const artifactsDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-release-manifest-drift-'))
    temporaryDirectories.push(artifactsDirectory)
    await writeFile(join(artifactsDirectory, 'AIVPlayer-0.4.0.AppImage'), 'original package')
    await runManifest(artifactsDirectory, '--tag', 'v0.4.0')

    await writeFile(join(artifactsDirectory, 'AIVPlayer-0.4.0.AppImage'), 'changed package!')
    await expect(runManifest(artifactsDirectory, '--tag', 'v0.4.0', '--verify')).rejects.toThrow('SHA-256 changed')

    await writeFile(join(artifactsDirectory, 'AIVPlayer-0.4.0.AppImage'), 'original package')
    await writeFile(join(artifactsDirectory, 'AIVPlayer-0.4.0.deb'), 'unexpected package')
    await expect(runManifest(artifactsDirectory, '--tag', 'v0.4.0', '--verify')).rejects.toThrow('file set mismatch')
  })

  it('records only validated GitHub Actions provenance', async () => {
    const artifactsDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-release-manifest-provenance-'))
    temporaryDirectories.push(artifactsDirectory)
    await writeFile(join(artifactsDirectory, 'AIVPlayer-0.4.0.dmg'), 'mac package')

    await runManifestWithEnv(artifactsDirectory, {
      GITHUB_SHA: 'a'.repeat(40),
      GITHUB_REPOSITORY: 'ponponon/aivplayer',
      GITHUB_WORKFLOW: 'Release Desktop',
      GITHUB_RUN_ID: '123456789',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_TOKEN: 'must-not-be-recorded'
    }, '--tag', 'v0.4.0')

    const manifest = JSON.parse(await readFile(join(artifactsDirectory, 'release-manifest.json'), 'utf8')) as {
      provenance?: Record<string, string>
    }
    expect(manifest.provenance).toEqual({
      commit: 'a'.repeat(40),
      repository: 'ponponon/aivplayer',
      workflow: 'Release Desktop',
      workflowRunId: '123456789',
      workflowRunAttempt: '2'
    })
    expect(JSON.stringify(manifest)).not.toContain('must-not-be-recorded')
  })

  it('rejects malformed provenance before writing a manifest', async () => {
    const artifactsDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-release-manifest-invalid-provenance-'))
    temporaryDirectories.push(artifactsDirectory)
    await writeFile(join(artifactsDirectory, 'AIVPlayer-0.4.0.dmg'), 'mac package')

    await expect(runManifest(artifactsDirectory, '--tag', 'v0.4.0', '--commit', 'not-a-commit'))
      .rejects.toThrow('Invalid release provenance field: commit')
  })
})
