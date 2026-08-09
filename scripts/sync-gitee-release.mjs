import { stat } from 'node:fs/promises'
import { openAsBlob } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { RELEASE_MANIFEST_NAME, listReleaseArtifacts } from './release-artifact-policy.mjs'
import { verifyReleaseManifest } from './release-manifest.mjs'

const apiBase = 'https://gitee.com/api/v5'
const token = process.env.GITEE_TOKEN
const owner = process.env.GITEE_OWNER ?? 'ponponon'
const repo = process.env.GITEE_REPO ?? 'aivplayer'
const tag = process.env.RELEASE_TAG
const artifactsDir = resolve(process.env.ARTIFACTS_DIR ?? 'artifacts')

if (!token) {
  console.log('GITEE_TOKEN is not configured; skipping Gitee release sync.')
  process.exit(0)
}

if (!tag) throw new Error('RELEASE_TAG is required.')

const authHeaders = { Authorization: `Bearer ${token}` }

async function request(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { ...authHeaders, ...(init.headers ?? {}) }
  })
  const text = await response.text()
  let body = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // Keep the original response text for a useful error below.
  }
  if (!response.ok) {
    throw new Error(`Gitee API ${response.status} ${response.statusText}: ${typeof body === 'string' ? body : JSON.stringify(body)}`)
  }
  return body
}

async function findRelease() {
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/tags/${encodeURIComponent(tag)}`
  const response = await fetch(`${apiBase}${path}`, { headers: authHeaders })
  if (response.status === 404) return null
  const text = await response.text()
  if (!response.ok) throw new Error(`Gitee release lookup failed (${response.status}): ${text}`)
  return JSON.parse(text)
}

async function getOrCreateRelease() {
  const existing = await findRelease()
  if (existing) return existing

  const body = new URLSearchParams({
    tag_name: tag,
    name: `AIVPlayer ${tag}`,
    body: `AIVPlayer ${tag} desktop installers and update metadata.`,
    target_commitish: process.env.GITEE_TARGET_COMMITISH ?? 'main'
  })
  return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
}

async function replaceArtifacts(release, files) {
  const releasePath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${release.id}`
  const attachments = await request(`${releasePath}/attach_files?page=1&per_page=100`)
  const names = new Set(files.map((file) => basename(file)))
  for (const attachment of attachments ?? []) {
    if (!names.has(attachment.name)) continue
    await request(`${releasePath}/attach_files/${attachment.id}`, { method: 'DELETE' })
    console.log(`Removed existing Gitee asset: ${attachment.name}`)
  }

  for (const file of files) {
    const fileName = basename(file)
    const fileInfo = await stat(file)
    const form = new FormData()
    form.append('file', await openAsBlob(file), fileName)
    const uploaded = await request(`${releasePath}/attach_files`, { method: 'POST', body: form })
    console.log(`Uploaded ${fileName} (${fileInfo.size} bytes)${uploaded?.browser_download_url ? `: ${uploaded.browser_download_url}` : ''}`)
  }
}

const files = await listReleaseArtifacts(artifactsDir)
if (files.length === 0) throw new Error(`No release artifacts found under ${artifactsDir}.`)
await verifyReleaseManifest({ artifactsDir, manifestPath: join(artifactsDir, RELEASE_MANIFEST_NAME), tag })
const release = await getOrCreateRelease()
console.log(`Syncing ${files.length} artifacts to Gitee release ${release.tag_name ?? tag}.`)
await replaceArtifacts(release, files)
