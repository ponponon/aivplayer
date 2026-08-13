import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'
import { getVisionPackDirectory, getVisionPackManifestPath, getVisionPackStatus, isVisionPackManifest, resolveVisionPackDirectory, VISION_PACK_BASE_URL, VISION_PACK_VERSION, type VisionPackStatus } from './vision-pack'

const execFileAsync = promisify(execFile)

type RemoteVisionPackManifest = {
  id: string
  version: string
  platform: NodeJS.Platform
  arch: string
  archive: string
  sha256: string
  sizeBytes: number
}

export type DownloadVisionPackOptions = {
  userDataPath: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

function getPlatformKey(): string {
  return `${process.platform}-${process.arch}`
}

function getManifestUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/u, '')}/${VISION_PACK_VERSION}/${getPlatformKey()}/manifest.json`
}

function isRemoteVisionPackManifest(value: unknown): value is RemoteVisionPackManifest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RemoteVisionPackManifest>
  return candidate.id === 'aivplayer-vision-pack'
    && candidate.version === VISION_PACK_VERSION
    && candidate.platform === process.platform
    && candidate.arch === process.arch
    && typeof candidate.archive === 'string'
    && candidate.archive === 'vision-pack.tar.gz'
    && typeof candidate.sha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(candidate.sha256)
    && typeof candidate.sizeBytes === 'number'
    && candidate.sizeBytes > 0
}

async function downloadToFile(url: string, filePath: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<{ sha256: string; sizeBytes: number }> {
  await mkdir(dirname(filePath), { recursive: true })
  const response = await fetchImpl(url, { redirect: 'follow', signal })
  if (!response.ok) throw new Error(`Vision Pack 下载失败：HTTP ${response.status} ${response.statusText}`)
  const output = await open(filePath, 'w')
  const hash = createHash('sha256')
  let sizeBytes = 0
  try {
    if (response.body) {
      const reader = response.body.getReader()
      while (true) {
        if (signal?.aborted) throw new Error('Vision Pack 下载已取消')
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        await output.write(value)
        hash.update(value)
        sizeBytes += value.byteLength
      }
    } else {
      const value = new Uint8Array(await response.arrayBuffer())
      await output.write(value)
      hash.update(value)
      sizeBytes = value.byteLength
    }
  } finally {
    await output.close()
  }
  return { sha256: hash.digest('hex'), sizeBytes }
}

export async function downloadVisionPack(options: DownloadVisionPackOptions): Promise<VisionPackStatus> {
  const baseUrl = options.baseUrl ?? process.env.VISION_PACK_BASE_URL ?? VISION_PACK_BASE_URL
  const fetchImpl = options.fetchImpl ?? fetch
  const existingDirectory = resolveVisionPackDirectory('', options.userDataPath)
  if (existingDirectory) return getVisionPackStatus('', options.userDataPath)

  const manifestResponse = await fetchImpl(getManifestUrl(baseUrl), { redirect: 'follow', signal: options.signal })
  if (!manifestResponse.ok) throw new Error(`Vision Pack 清单下载失败：HTTP ${manifestResponse.status} ${manifestResponse.statusText}`)
  const manifest = await manifestResponse.json() as unknown
  if (!isRemoteVisionPackManifest(manifest)) throw new Error('Vision Pack 清单无效或与当前平台不匹配')

  const targetDirectory = getVisionPackDirectory(options.userDataPath)
  const temporaryDirectory = `${targetDirectory}.download-${process.pid}`
  const archivePath = `${temporaryDirectory}.tar.gz`
  await rm(temporaryDirectory, { recursive: true, force: true })
  await rm(archivePath, { force: true })
  try {
    const archiveUrl = `${baseUrl.replace(/\/$/u, '')}/${VISION_PACK_VERSION}/${getPlatformKey()}/${manifest.archive}`
    const actual = await downloadToFile(archiveUrl, archivePath, fetchImpl, options.signal)
    if (actual.sha256 !== manifest.sha256 || actual.sizeBytes !== manifest.sizeBytes) throw new Error('Vision Pack 校验失败，下载内容与清单不一致')
    await mkdir(temporaryDirectory, { recursive: true })
    await execFileAsync('tar', ['-xzf', archivePath, '-C', temporaryDirectory], { timeout: 120_000 })
    const embeddedManifest = JSON.parse(await readFile(getVisionPackManifestPath(temporaryDirectory), 'utf8')) as unknown
    if (!isVisionPackManifest(embeddedManifest)) throw new Error('Vision Pack 内部清单无效')
    await stat(join(temporaryDirectory, 'package.json'))
    await rm(targetDirectory, { recursive: true, force: true })
    await mkdir(dirname(targetDirectory), { recursive: true })
    await rename(temporaryDirectory, targetDirectory)
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
    await rm(archivePath, { force: true })
  }
  return getVisionPackStatus('', options.userDataPath)
}
