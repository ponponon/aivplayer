import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdtemp, rm, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'
import { listReleaseArtifacts } from './release-artifact-policy.mjs'

export const DOWNLOAD_MANIFEST_SCHEMA_VERSION = 1
export const DEFAULT_R2_BUCKET = 'aivplayer-releases'
export const DEFAULT_R2_RELEASE_PREFIX = 'aivplayer/releases'
export const DEFAULT_R2_PUBLIC_BASE_URL = 'https://releases.quniv.cn/aivplayer/releases'

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4'
const GITHUB_API_BASE_URL = 'https://api.github.com'
const R2_REST_MAX_UPLOAD_BYTES = 300 * 1000 * 1000
const INSTALLER_EXTENSIONS = new Set(['.dmg', '.zip', '.exe', '.appimage', '.deb'])
const FORMAT_PRIORITY = {
  darwin: { '.dmg': 0, '.zip': 1 },
  win32: { '.exe': 0 },
  linux: { '.appimage': 0, '.deb': 1 }
}
const CONTENT_TYPES = {
  '.dmg': 'application/x-apple-diskimage',
  '.zip': 'application/zip',
  '.exe': 'application/vnd.microsoft.portable-executable',
  '.appimage': 'application/octet-stream',
  '.deb': 'application/vnd.debian.binary-package',
  '.json': 'application/json'
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

function normalizeVersion(tag) {
  const version = String(tag ?? '').replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Invalid release version: ${String(tag)}`)
  return version
}

function githubReleaseUrl(repository, tag) {
  return `https://github.com/${repository}/releases/tag/${encodeURIComponent(tag)}`
}

function encodeObjectKey(key) {
  return key.split('/').map((part) => encodeURIComponent(part)).join('/')
}

function getR2ObjectUrl({ accountId, bucket, key }) {
  return `${CLOUDFLARE_API_BASE_URL}/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects/${encodeObjectKey(key)}`
}

function getPublicObjectUrl(baseUrl, version, name) {
  return `${trimTrailingSlash(baseUrl)}/${encodeURIComponent(version)}/${name.split('/').map((part) => encodeURIComponent(part)).join('/')}`
}

function getFileExtension(name) {
  const lowerName = name.toLowerCase()
  const extension = [...INSTALLER_EXTENSIONS].find((candidate) => lowerName.endsWith(candidate))
  return extension ?? ''
}

function classifyPlatform(name) {
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith('.exe')) return 'win32'
  if (lowerName.endsWith('.appimage') || lowerName.endsWith('.deb')) return 'linux'
  if (lowerName.endsWith('.dmg') || lowerName.includes('-mac')) return 'darwin'
  if (lowerName.endsWith('.zip') && lowerName.includes('mac')) return 'darwin'
  return null
}

function classifyArchitecture(name, platform) {
  const lowerName = name.toLowerCase()
  if (/arm64|aarch64/.test(lowerName)) return 'arm64'
  if (/x86_64|amd64|x64/.test(lowerName)) return 'x64'
  if (platform === 'darwin') return 'arm64'
  return 'x64'
}

function installerScore(asset, platform) {
  const extension = getFileExtension(asset.name)
  return FORMAT_PRIORITY[platform]?.[extension] ?? 99
}

export function selectInstallerAssets(items) {
  const selected = {}
  for (const item of items) {
    const name = typeof item === 'string' ? basename(item) : item?.name
    if (!name) continue
    const platform = classifyPlatform(name)
    const extension = getFileExtension(name)
    if (!platform || !extension) continue
    const architecture = classifyArchitecture(name, platform)
    const target = `${platform}-${architecture}`
    const candidate = { ...item, name, format: extension.slice(1) }
    if (!selected[target]) selected[target] = {}
    selected[target][candidate.format] = candidate
  }
  return selected
}

export function createDownloadRelease({ tag, assets, publicBaseUrl, repository, generatedAt = new Date().toISOString() }) {
  const version = normalizeVersion(tag)
  const releaseAssets = Object.fromEntries(Object.entries(assets).map(([target, formats]) => {
    if (formats.name) {
      return [target, {
        name: formats.name,
        format: formats.format ?? getFileExtension(formats.name).slice(1),
        sizeBytes: formats.sizeBytes,
        sha256: formats.sha256,
        url: formats.url ?? getPublicObjectUrl(publicBaseUrl, version, formats.name)
      }]
    }
    const formatEntries = Object.entries(formats).map(([formatName, asset]) => [formatName, {
      name: asset.name,
      format: asset.format ?? getFileExtension(asset.name).slice(1),
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      url: asset.url ?? getPublicObjectUrl(publicBaseUrl, version, asset.name)
    }])
    return [target, Object.fromEntries(formatEntries)]
  }))
  return {
    version,
    tag,
    githubUrl: githubReleaseUrl(repository, tag),
    generatedAt,
    assets: releaseAssets
  }
}

export function createDownloadManifest({ repository, releases, generatedAt = new Date().toISOString() }) {
  return {
    schemaVersion: DOWNLOAD_MANIFEST_SCHEMA_VERSION,
    repository,
    generatedAt,
    retention: 1,
    releases
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function hashFile(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

async function fileDetails(filePath) {
  const fileStat = await stat(filePath)
  return { sizeBytes: fileStat.size, sha256: await hashFile(filePath) }
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

async function readJsonResponse(response, label) {
  const body = await response.text()
  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    throw new Error(`${label} returned invalid JSON (${response.status}).`)
  }
  if (!response.ok || payload.success === false) {
    const details = payload.errors?.map((item) => item.message).filter(Boolean).join('; ') || body.slice(0, 300)
    throw new Error(`${label} failed (${response.status}): ${details}`)
  }
  return payload
}

async function fetchGithubReleases({ repository, token }) {
  const response = await fetch(`${GITHUB_API_BASE_URL}/repos/${repository}/releases?per_page=100`, { headers: githubHeaders(token) })
  if (!response.ok) throw new Error(`GitHub release list failed (${response.status}).`)
  return response.json()
}

function findPublishedRelease(releases, tag) {
  return releases.find((release) => release.tag_name === tag && !release.draft && !release.prerelease)
}

function findPreviousRelease(releases, currentTag) {
  return releases
    .filter((release) => !release.draft && !release.prerelease && release.tag_name !== currentTag)
    .sort((left, right) => String(right.published_at).localeCompare(String(left.published_at)))[0]
}

async function listR2Objects({ accountId, bucket, prefix, token }) {
  const objects = []
  let cursor = null
  do {
    const params = new URLSearchParams({ prefix, per_page: '1000' })
    if (cursor) params.set('cursor', cursor)
    const response = await fetch(`${CLOUDFLARE_API_BASE_URL}/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    const payload = await readJsonResponse(response, 'Cloudflare R2 list objects')
    objects.push(...(payload.result ?? []))
    cursor = payload.result_info?.is_truncated ? payload.result_info.cursor : null
  } while (cursor)
  return objects
}

async function deleteR2Object({ accountId, bucket, key, token }) {
  const response = await fetch(getR2ObjectUrl({ accountId, bucket, key }), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  })
  await readJsonResponse(response, `Cloudflare R2 delete ${key}`)
}

async function uploadR2File({ accountId, bucket, key, filePath, token, cacheControl, contentDisposition }) {
  const fileStat = await stat(filePath)
  const extension = getFileExtension(key) || (key.endsWith('.json') ? '.json' : '')
  if (fileStat.size > R2_REST_MAX_UPLOAD_BYTES) {
    throw new Error(`Cloudflare R2 REST upload limit is 300 MB; ${key} is ${(fileStat.size / 1000 / 1000).toFixed(1)} MB. Reduce the release asset size or use another distribution path.`)
  }
  const response = await fetch(getR2ObjectUrl({ accountId, bucket, key }), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Cache-Control': cacheControl,
      'Content-Disposition': contentDisposition,
      'Content-Length': String(fileStat.size),
      'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream'
    },
    body: createReadStream(filePath),
    duplex: 'half'
  })
  await readJsonResponse(response, `Cloudflare R2 upload ${key}`)
}

async function uploadR2Json({ accountId, bucket, key, value, token, cacheControl }) {
  const body = `${JSON.stringify(value, null, 2)}\n`
  const response = await fetch(getR2ObjectUrl({ accountId, bucket, key }), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Cache-Control': cacheControl,
      'Content-Disposition': 'inline',
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body))
    },
    body
  })
  await readJsonResponse(response, `Cloudflare R2 upload ${key}`)
}

async function downloadGithubAsset({ asset, destination }) {
  const response = await fetch(asset.browser_download_url, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`GitHub asset download failed (${response.status}): ${asset.name}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
}

async function loadExistingVersionManifest({ publicBaseUrl, version }) {
  const url = `${trimTrailingSlash(publicBaseUrl)}/${encodeURIComponent(version)}/download-manifest.json`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) return null
  const candidate = await response.json()
  return candidate?.schemaVersion === DOWNLOAD_MANIFEST_SCHEMA_VERSION && candidate.release?.version === version ? candidate.release : null
}

async function publishVersion({ release, localAssets, repository, publicBaseUrl, accountId, bucket, r2ReleasePrefix, token, temporaryDirectory }) {
  const tag = release.tag_name ?? release.tag
  const version = normalizeVersion(tag)
  const githubAssets = release.assets ?? []
  const selected = localAssets && Object.keys(localAssets).length > 0
    ? localAssets
    : selectInstallerAssets(githubAssets)
  if (Object.keys(selected).length === 0) throw new Error(`No supported installer assets found for ${tag}.`)

  const uploadedAssets = {}
  for (const [target, formats] of Object.entries(selected)) {
    if (formats.name) {
      const asset = formats
      const filePath = asset.path ?? join(temporaryDirectory, asset.name)
      if (!asset.path) await downloadGithubAsset({ asset, destination: filePath })
      const details = await fileDetails(filePath)
      const key = `${r2ReleasePrefix}/${version}/${asset.name}`
      await uploadR2File({
        accountId,
        bucket,
        key,
        filePath,
        token,
        cacheControl: 'public, max-age=31536000, immutable',
        contentDisposition: `attachment; filename="${asset.name.replaceAll('"', '')}"`
      })
      uploadedAssets[target] = { ...asset, ...details, url: getPublicObjectUrl(publicBaseUrl, version, asset.name) }
      console.log(`Published ${tag} ${target}: ${asset.name}`)
    } else {
      const formatEntries = {}
      for (const [formatName, asset] of Object.entries(formats)) {
        const filePath = asset.path ?? join(temporaryDirectory, asset.name)
        if (!asset.path) await downloadGithubAsset({ asset, destination: filePath })
        const details = await fileDetails(filePath)
        const key = `${r2ReleasePrefix}/${version}/${asset.name}`
        await uploadR2File({
          accountId,
          bucket,
          key,
          filePath,
          token,
          cacheControl: 'public, max-age=31536000, immutable',
          contentDisposition: `attachment; filename="${asset.name.replaceAll('"', '')}"`
        })
        formatEntries[formatName] = { ...asset, ...details, url: getPublicObjectUrl(publicBaseUrl, version, asset.name) }
        console.log(`Published ${tag} ${target}/${formatName}: ${asset.name}`)
      }
      uploadedAssets[target] = formatEntries
    }
  }

  const entry = createDownloadRelease({
    tag,
    assets: uploadedAssets,
    publicBaseUrl,
    repository
  })
  const versionManifest = { schemaVersion: DOWNLOAD_MANIFEST_SCHEMA_VERSION, release: entry }
  await uploadR2Json({
    accountId,
    bucket,
    key: `${r2ReleasePrefix}/${version}/download-manifest.json`,
    value: versionManifest,
    token,
    cacheControl: 'public, max-age=31536000, immutable'
  })
  return entry
}

function parseOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) continue
    if (item === '--artifacts-dir') options.artifactsDir = value
    else if (item === '--tag') options.tag = value
    else if (item === '--repository') options.repository = value
    else if (item === '--bucket') options.bucket = value
    else if (item === '--public-base-url') options.publicBaseUrl = value
    else if (item === '--r2-release-prefix') options.r2ReleasePrefix = value
    else continue
    index += 1
  }
  return options
}

export async function publishReleaseDownloads(options = {}) {
  const tag = options.tag ?? process.env.RELEASE_TAG
  const repository = options.repository ?? process.env.GITHUB_REPOSITORY
  const accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID
  const token = options.token ?? process.env.CLOUDFLARE_API_TOKEN
  const githubToken = options.githubToken ?? process.env.GITHUB_TOKEN
  const bucket = options.bucket ?? process.env.R2_BUCKET ?? DEFAULT_R2_BUCKET
  const publicBaseUrl = options.publicBaseUrl ?? process.env.R2_PUBLIC_BASE_URL ?? DEFAULT_R2_PUBLIC_BASE_URL
  const r2ReleasePrefix = options.r2ReleasePrefix ?? process.env.R2_RELEASE_PREFIX ?? DEFAULT_R2_RELEASE_PREFIX
  const artifactsDirectory = resolve(options.artifactsDir ?? process.env.ARTIFACTS_DIR ?? 'artifacts/assembled')
  if (!tag) throw new Error('Release tag is required.')
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) throw new Error('GitHub repository is required as owner/name.')
  if (!accountId || !token) throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required for R2 publishing.')

  const releases = await fetchGithubReleases({ repository, token: githubToken })
  const currentRelease = findPublishedRelease(releases, tag) ?? { tag_name: tag, assets: [] }
  const previousRelease = findPreviousRelease(releases, tag)
  const temporaryDirectory = await mkdtemp(join(process.env.RUNNER_TEMP ?? '/tmp', 'aivplayer-downloads-'))
  try {
    const localFiles = await pathExists(artifactsDirectory) ? await listReleaseArtifacts(artifactsDirectory, { includeManifest: false }) : []
    const currentAssets = selectInstallerAssets(localFiles.map((filePath) => ({ name: basename(filePath), path: filePath })))
    const currentEntry = await publishVersion({
      release: currentRelease,
      localAssets: currentAssets,
      repository,
      publicBaseUrl,
      accountId,
      bucket,
      r2ReleasePrefix,
      token,
      temporaryDirectory
    })

    const entries = [currentEntry]
    if (previousRelease) {
      const previousVersion = normalizeVersion(previousRelease.tag_name)
      const existing = await loadExistingVersionManifest({ publicBaseUrl, version: previousVersion })
      entries.push(existing ?? await publishVersion({
        release: previousRelease,
        localAssets: null,
        repository,
        publicBaseUrl,
        accountId,
        bucket,
        r2ReleasePrefix,
        token,
        temporaryDirectory
      }))
    }

    const manifest = createDownloadManifest({ repository, releases: entries })
    const releaseRootPrefix = `${r2ReleasePrefix}/`
    const keepPrefixes = entries.map((entry) => `${releaseRootPrefix}${entry.version}/`)
    const existingObjects = await listR2Objects({ accountId, bucket, prefix: releaseRootPrefix, token })
    for (const object of existingObjects) {
      if (object.key === `${r2ReleasePrefix}/download-manifest.json`) continue
      if (keepPrefixes.some((prefix) => object.key.startsWith(prefix))) continue
      await deleteR2Object({ accountId, bucket, key: object.key, token })
      console.log(`Removed stale R2 release object: ${object.key}`)
    }
    await uploadR2Json({
      accountId,
      bucket,
      key: `${r2ReleasePrefix}/download-manifest.json`,
      value: manifest,
      token,
      cacheControl: 'public, max-age=300, must-revalidate'
    })
    return manifest
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const manifest = await publishReleaseDownloads(options)
  console.log(`Published ${manifest.releases.length} release(s) to R2; retained ${manifest.retention} release slots.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
