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

async function runCommand(args: string[]) {
  return execFileAsync(process.execPath, args, { cwd: projectRoot })
}

async function createFixture() {
  const artifactsDirectory = await mkdtemp(join(tmpdir(), 'aivplayer-remote-release-'))
  temporaryDirectories.push(artifactsDirectory)
  await mkdir(join(artifactsDirectory, 'nested'), { recursive: true })
  await writeFile(join(artifactsDirectory, 'AIVPlayer-0.4.0.dmg'), 'mac package')
  await writeFile(join(artifactsDirectory, 'nested', 'AIVPlayer-0.4.0.exe'), 'windows package')
  await writeFile(join(artifactsDirectory, 'latest.yml'), 'version: 0.4.0\n')
  await runCommand([
    join(projectRoot, 'scripts/release-manifest.mjs'),
    '--artifacts-dir', artifactsDirectory,
    '--tag', 'v0.4.0'
  ])
  const manifestPath = join(artifactsDirectory, 'release-manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { artifacts: Array<{ name: string }> }
  const files = new Map<string, Buffer>()
  for (const artifact of manifest.artifacts) {
    const fileName = artifact.name === 'AIVPlayer-0.4.0.exe' ? join(artifactsDirectory, 'nested', artifact.name) : join(artifactsDirectory, artifact.name)
    files.set(artifact.name, await readFile(fileName))
  }
  files.set('release-manifest.json', await readFile(manifestPath))
  return { artifactsDirectory, files }
}

async function loadVerifier() {
  // @ts-expect-error JavaScript release utility is exercised through its exported test seam.
  return import('../../scripts/verify-remote-release.mjs') as Promise<{ verifyRemoteRelease: (options: Record<string, unknown>) => Promise<{ artifacts: Array<{ ok: boolean }> }> }>
}

function createMockRemote(files: Map<string, Buffer>, mutateName?: string, assetQuery = '') {
  const requests: Array<{ method: string; url: string }> = []
  const fetchImpl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    requests.push({ method, url })
    const parsedUrl = new URL(url)
    const baseUrl = 'https://remote.test'
    const assetUrl = (platform: string, name: string) => `${baseUrl}/${platform}/assets/${encodeURIComponent(name)}${assetQuery}`
    const names = [...files.keys()]

    if (url === `${baseUrl}/github/repos/ponponon/aivplayer/releases/tags/v0.4.0`) {
      return new Response(JSON.stringify({
        assets: names.map((name) => ({ name, browser_download_url: assetUrl('github', name) }))
      }), { headers: { 'Content-Type': 'application/json' } })
    }
    if (url === `${baseUrl}/gitee/repos/ponponon/aivplayer/releases/tags/v0.4.0`) {
      return new Response(JSON.stringify({ id: 42 }), { headers: { 'Content-Type': 'application/json' } })
    }
    if (parsedUrl.pathname === '/gitee/repos/ponponon/aivplayer/releases/42/attach_files') {
      return new Response(JSON.stringify(names.map((name, index) => ({
        id: index + 1,
        name,
        browser_download_url: assetUrl('gitee', name)
      }))), { headers: { 'Content-Type': 'application/json' } })
    }
    const assetMatch = parsedUrl.pathname.match(/^\/(github|gitee)\/assets\/(.+)$/)
    if (assetMatch) {
      const name = decodeURIComponent(assetMatch[2])
      const content = name === mutateName ? Buffer.from('tampered package') : files.get(name)
      return content
        ? new Response(content.toString('utf8'))
        : new Response('missing', { status: 404 })
    }
    return new Response('not found', { status: 404 })
  }
  return { fetchImpl, requests }
}

describe('remote release verification', () => {
  it('verifies GitHub assets by downloading and hashing every release file', async () => {
    const fixture = await createFixture()
    const remote = createMockRemote(fixture.files)
    const { verifyRemoteRelease } = await loadVerifier()
    const reportPath = join(fixture.artifactsDirectory, 'github-report.json')
    const report = await verifyRemoteRelease({
      platform: 'github',
      owner: 'ponponon',
      repo: 'aivplayer',
      tag: 'v0.4.0',
      artifactsDir: fixture.artifactsDirectory,
      reportPath,
      githubApiBase: 'https://remote.test/github',
      fetchImpl: remote.fetchImpl
    })
    expect(report.artifacts.every((artifact) => artifact.ok)).toBe(true)
    expect(remote.requests.every((request) => request.method === 'GET')).toBe(true)
    expect(JSON.parse(await readFile(reportPath, 'utf8')).platform).toBe('github')
  })

  it('verifies Gitee release attachment URLs without using a write endpoint', async () => {
    const fixture = await createFixture()
    const remote = createMockRemote(fixture.files)
    const { verifyRemoteRelease } = await loadVerifier()
    await verifyRemoteRelease({
      platform: 'gitee',
      owner: 'ponponon',
      repo: 'aivplayer',
      tag: 'v0.4.0',
      artifactsDir: fixture.artifactsDirectory,
      giteeApiBase: 'https://remote.test/gitee',
      fetchImpl: remote.fetchImpl
    })
    expect(remote.requests.some((request) => request.url.includes('/releases/42/attach_files?'))).toBe(true)
    expect(remote.requests.every((request) => request.method === 'GET')).toBe(true)
  })

  it('writes a failed report when a remote asset changes', async () => {
    const fixture = await createFixture()
    const remote = createMockRemote(fixture.files, 'AIVPlayer-0.4.0.dmg')
    const { verifyRemoteRelease } = await loadVerifier()
    const reportPath = join(fixture.artifactsDirectory, 'failed-report.json')
    await expect(verifyRemoteRelease({
      platform: 'github',
      owner: 'ponponon',
      repo: 'aivplayer',
      tag: 'v0.4.0',
      artifactsDir: fixture.artifactsDirectory,
      reportPath,
      githubApiBase: 'https://remote.test/github',
      fetchImpl: remote.fetchImpl
    })).rejects.toThrow('Remote github release verification failed')
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as { artifacts: Array<{ name: string; ok: boolean }> }
    expect(report.artifacts.find((artifact) => artifact.name === 'AIVPlayer-0.4.0.dmg')?.ok).toBe(false)
  })

  it('rejects every unexpected remote attachment, including non-publishable files', async () => {
    const fixture = await createFixture()
    fixture.files.set('builder-debug.yml', Buffer.from('debug output'))
    const remote = createMockRemote(fixture.files)
    const { verifyRemoteRelease } = await loadVerifier()

    await expect(verifyRemoteRelease({
      platform: 'github',
      owner: 'ponponon',
      repo: 'aivplayer',
      tag: 'v0.4.0',
      artifactsDir: fixture.artifactsDirectory,
      githubApiBase: 'https://remote.test/github',
      fetchImpl: remote.fetchImpl
    })).rejects.toThrow('unexpected: builder-debug.yml')
  })

  it('redacts query credentials from successful remote reports', async () => {
    const fixture = await createFixture()
    const remote = createMockRemote(fixture.files, undefined, '?token=secret-value#download')
    const { verifyRemoteRelease } = await loadVerifier()
    const reportPath = join(fixture.artifactsDirectory, 'redacted-report.json')

    const report = await verifyRemoteRelease({
      platform: 'github',
      owner: 'ponponon',
      repo: 'aivplayer',
      tag: 'v0.4.0',
      artifactsDir: fixture.artifactsDirectory,
      reportPath,
      githubApiBase: 'https://remote.test/github',
      fetchImpl: remote.fetchImpl
    })
    expect(JSON.stringify(report)).not.toContain('secret-value')
    expect((JSON.parse(await readFile(reportPath, 'utf8')) as { artifacts: Array<{ url?: string }> }).artifacts.every((artifact) => !artifact.url?.includes('?') && !artifact.url?.includes('#'))).toBe(true)
  })
})
