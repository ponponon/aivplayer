import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile, rename } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import {
  assertManifestShape,
  sha256File,
  verifyReleaseManifest
} from './release-manifest.mjs'
import {
  RELEASE_MANIFEST_NAME
} from './release-artifact-policy.mjs'

const DEFAULT_GITHUB_API_BASE = 'https://api.github.com'
const MAX_CONTROL_FILE_BYTES = 4 * 1024 * 1024

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function redactUrl(value) {
  try {
    const url = new URL(value)
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return '<invalid-url>'
  }
}

async function fetchJson(fetchImpl, url, headers) {
  const response = await fetchImpl(url, { headers, redirect: 'follow' })
  if (!response.ok) throw new Error(`Remote API request failed (${response.status}): ${redactUrl(url)}`)
  return response.json()
}

function normalizeAssetList(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.assets)) return value.assets
  if (Array.isArray(value?.attach_files)) return value.attach_files
  if (Array.isArray(value?.data)) return value.data
  return []
}

function addAsset(assetMap, asset, fallbackUrl) {
  const name = typeof asset?.name === 'string' ? asset.name : ''
  const url = typeof asset?.browser_download_url === 'string' && asset.browser_download_url
    ? asset.browser_download_url
    : fallbackUrl
  if (!name) throw new Error('Remote release contains an asset without a name.')
  if (!url) throw new Error(`Remote release asset has no download URL: ${name}`)
  if (assetMap.has(name)) throw new Error(`Remote release contains duplicate asset: ${name}`)
  assetMap.set(name, { name, url })
}

async function resolveGithubAssets({ fetchImpl, owner, repo, tag, apiBase, token }) {
  const base = trimTrailingSlash(apiBase)
  const encodedTag = encodeURIComponent(tag)
  const release = await fetchJson(
    fetchImpl,
    `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/tags/${encodedTag}`,
    {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...authHeaders(token)
    }
  )
  const assets = new Map()
  for (const asset of normalizeAssetList(release)) addAsset(assets, asset, '')
  return assets
}

async function readResponseBytes(response, { collect = false } = {}) {
  if (!response.body) throw new Error('Remote response has no body.')
  const hash = createHash('sha256')
  let sizeBytes = 0
  const chunks = []
  const readable = Readable.fromWeb(response.body)
  for await (const chunk of readable) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    sizeBytes += buffer.length
    hash.update(buffer)
    if (collect) {
      if (sizeBytes > MAX_CONTROL_FILE_BYTES) throw new Error(`Remote control file is too large: ${sizeBytes} bytes.`)
      chunks.push(buffer)
    }
  }
  return {
    sizeBytes,
    sha256: hash.digest('hex'),
    body: collect ? Buffer.concat(chunks) : undefined
  }
}

async function downloadAndHash(fetchImpl, url, headers, options = {}) {
  const response = await fetchImpl(url, { headers, redirect: 'follow' })
  if (!response.ok) throw new Error(`Remote asset download failed (${response.status}): ${redactUrl(url)}`)
  return readResponseBytes(response, options)
}

function compareManifestBytes(bytes, localManifest) {
  let remoteManifest
  try {
    remoteManifest = assertManifestShape(JSON.parse(bytes.toString('utf8')))
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  const expected = JSON.stringify(localManifest)
  const actual = JSON.stringify(remoteManifest)
  return actual === expected
    ? { ok: true }
    : { ok: false, message: 'Remote release manifest content differs from the local manifest.' }
}

function createExpectedAssets(manifest, manifestSizeBytes, manifestSha256) {
  return [
    ...manifest.artifacts,
    { name: RELEASE_MANIFEST_NAME, sizeBytes: manifestSizeBytes, sha256: manifestSha256, control: true }
  ].sort((left, right) => left.name.localeCompare(right.name))
}

function findUnexpectedAssets(remoteAssets, expectedNames) {
  return [...remoteAssets.keys()]
    .filter((name) => !expectedNames.has(name))
    .sort()
}

async function writeReport(reportPath, report) {
  if (!reportPath) return
  const absolutePath = resolve(reportPath)
  await mkdir(dirname(absolutePath), { recursive: true })
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, absolutePath)
}

export async function verifyRemoteRelease(options = {}) {
  const platform = options.platform
  if (platform !== 'github') throw new Error(`Unsupported remote platform: ${String(platform)}`)
  const owner = options.owner
  const repo = options.repo
  const tag = options.tag
  if (!owner || !repo || !tag) throw new Error('Remote owner, repository, and tag are required.')

  const artifactsDir = resolve(options.artifactsDir ?? 'artifacts')
  const manifestPath = resolve(options.manifestPath ?? join(artifactsDir, RELEASE_MANIFEST_NAME))
  const localResult = await verifyReleaseManifest({ artifactsDir, manifestPath, tag })
  const manifestStat = await stat(manifestPath)
  const manifestSha256 = await sha256File(manifestPath)
  const expectedAssets = createExpectedAssets(localResult.manifest, manifestStat.size, manifestSha256)
  const expectedByName = new Map(expectedAssets.map((asset) => [asset.name, asset]))
  const token = options.token
  const fetchImpl = options.fetchImpl ?? fetch
  const remoteAssets = await resolveGithubAssets({
    fetchImpl,
    owner,
    repo,
    tag,
    apiBase: options.githubApiBase ?? DEFAULT_GITHUB_API_BASE,
    token
  })

  const expectedNames = new Set(expectedByName.keys())
  const missingNames = [...expectedNames].filter((name) => !remoteAssets.has(name)).sort()
  const unexpectedNames = findUnexpectedAssets(remoteAssets, expectedNames)
  const headers = authHeaders(token)
  const results = []
  for (const expected of expectedAssets) {
    const remote = remoteAssets.get(expected.name)
    if (!remote) {
      results.push({ name: expected.name, ok: false, message: 'Remote asset is missing.' })
      continue
    }
    try {
      const actual = await downloadAndHash(fetchImpl, remote.url, headers, { collect: expected.control })
      const manifestComparison = expected.control
        ? compareManifestBytes(actual.body, localResult.manifest)
        : { ok: true }
      const ok = actual.sizeBytes === expected.sizeBytes
        && actual.sha256 === expected.sha256
        && manifestComparison.ok
      results.push({
        name: expected.name,
        url: redactUrl(remote.url),
        expectedSizeBytes: expected.sizeBytes,
        actualSizeBytes: actual.sizeBytes,
        expectedSha256: expected.sha256,
        actualSha256: actual.sha256,
        manifestContentMatch: expected.control ? manifestComparison.ok : undefined,
        ok,
        message: manifestComparison.ok ? undefined : manifestComparison.message
      })
    } catch (error) {
      results.push({
        name: expected.name,
        url: redactUrl(remote.url),
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const report = {
    schemaVersion: 1,
    platform,
    owner,
    repo,
    tag,
    verifiedAt: new Date().toISOString(),
    expectedAssetCount: expectedAssets.length,
    remoteAssetCount: remoteAssets.size,
    missingNames,
    unexpectedNames,
    artifacts: results
  }
  await writeReport(options.reportPath, report)
  const failed = results.filter((result) => !result.ok)
  if (missingNames.length > 0 || unexpectedNames.length > 0 || failed.length > 0) {
    throw new Error(`Remote ${platform} release verification failed. Missing: ${missingNames.join(', ') || 'none'}; unexpected: ${unexpectedNames.join(', ') || 'none'}; failed: ${failed.map((result) => result.name).join(', ') || 'none'}`)
  }
  return report
}

function readOptions(argv) {
  const options = { platform: 'github' }
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--platform') options.platform = value
    else if (item === '--owner') options.owner = value
    else if (item === '--repo') options.repo = value
    else if (item === '--tag') options.tag = value
    else if (item === '--artifacts-dir') options.artifactsDir = value
    else if (item === '--manifest-path') options.manifestPath = value
    else if (item === '--token') options.token = value
    else if (item === '--github-api-base') options.githubApiBase = value
    else if (item === '--report-path') options.reportPath = value
    else continue
    index += 1
  }
  return options
}

async function main() {
  const cliOptions = readOptions(process.argv.slice(2))
  const options = {
    ...cliOptions,
    owner: cliOptions.owner ?? process.env.RELEASE_OWNER,
    repo: cliOptions.repo ?? process.env.RELEASE_REPO,
    tag: cliOptions.tag ?? process.env.RELEASE_TAG,
    token: cliOptions.token ?? process.env.RELEASE_TOKEN
  }
  const report = await verifyRemoteRelease(options)
  console.log(`Remote ${report.platform} release verified: ${report.artifacts.length} asset(s), tag ${report.tag}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
