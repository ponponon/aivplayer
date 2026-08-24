import { createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

export type ModelFileIntegrity = {
  sizeBytes?: number
  sha256?: string
}

export type RemoteModelManifestFile = {
  relativePath: string
  sha256: string
  sizeBytes: number
}

export type RemoteModelManifest = {
  revision: string
  files: RemoteModelManifestFile[]
}

export type DownloadVerifiedFileOptions = {
  url: string
  targetPath: string
  expected?: ModelFileIntegrity
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  requestInit?: RequestInit
  onProgress?: (progress: { receivedBytes: number; totalBytes: number | null }) => void
}

export type DownloadVerifiedFileResult = {
  sizeBytes: number
  sha256: string
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u
const verifiedFileCache = new Map<string, { size: number; mtimeMs: number; ctimeMs: number; expectedKey: string }>()

export async function getVerifiedFileSize(filePath: string, expected: ModelFileIntegrity): Promise<number | null> {
  const fileStat = await getFileStat(filePath)
  if (!fileStat || !fileStat.isFile() || fileStat.size <= 0 || expected.sizeBytes !== undefined && fileStat.size !== expected.sizeBytes) {
    verifiedFileCache.delete(filePath)
    return null
  }
  const expectedKey = `${expected.sizeBytes ?? ''}:${expected.sha256 ?? ''}`
  const cached = verifiedFileCache.get(filePath)
  if (cached && cached.size === fileStat.size && cached.mtimeMs === fileStat.mtimeMs && cached.ctimeMs === fileStat.ctimeMs && cached.expectedKey === expectedKey) {
    return cached.size
  }
  if (expected.sha256) {
    const actualSha256 = await hashFile(filePath)
    if (actualSha256 !== expected.sha256) {
      verifiedFileCache.delete(filePath)
      return null
    }
  }
  verifiedFileCache.set(filePath, { size: fileStat.size, mtimeMs: fileStat.mtimeMs, ctimeMs: fileStat.ctimeMs, expectedKey })
  return fileStat.size
}

export async function invalidateFileCache(filePath: string): Promise<void> {
  verifiedFileCache.delete(filePath)
  await rm(filePath, { force: true })
}

export async function downloadVerifiedFile(options: DownloadVerifiedFileOptions): Promise<DownloadVerifiedFileResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const expected = options.expected ?? {}
  const temporaryPath = `${options.targetPath}.${process.pid}.${randomUUID()}.download`
  await mkdir(dirname(options.targetPath), { recursive: true })
  await rm(temporaryPath, { force: true })

  try {
    const response = await fetchImpl(options.url, {
      redirect: 'follow',
      ...options.requestInit,
      ...(options.signal ? { signal: options.signal } : {})
    })
    if (!response.ok) throw new Error(`模型下载失败：HTTP ${response.status} ${response.statusText}`)

    const contentLength = Number(response.headers.get('content-length'))
    const totalBytes = Number.isFinite(contentLength) && contentLength > 0
      ? contentLength
      : expected.sizeBytes ?? null
    const output = await open(temporaryPath, 'w')
    const hash = createHash('sha256')
    let receivedBytes = 0

    try {
      if (!response.body) {
        const content = new Uint8Array(await response.arrayBuffer())
        await output.write(content)
        hash.update(content)
        receivedBytes = content.byteLength
        options.onProgress?.({ receivedBytes, totalBytes })
      } else {
        const reader = response.body.getReader()
        while (true) {
          if (options.signal?.aborted) throw new Error('模型下载已取消')
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue
          await output.write(value)
          hash.update(value)
          receivedBytes += value.byteLength
          options.onProgress?.({ receivedBytes, totalBytes })
        }
      }
    } finally {
      await output.close()
    }

    const actualSha256 = hash.digest('hex')
    if (receivedBytes <= 0) throw new Error('模型下载结果为空')
    if (expected.sizeBytes !== undefined && receivedBytes !== expected.sizeBytes) {
      throw new Error(`模型文件大小校验失败：期望 ${expected.sizeBytes} 字节，实际 ${receivedBytes} 字节`)
    }
    if (expected.sha256 && actualSha256 !== expected.sha256) {
      throw new Error(`模型文件 SHA-256 校验失败：期望 ${expected.sha256}，实际 ${actualSha256}`)
    }

    await rename(temporaryPath, options.targetPath)
    return { sizeBytes: receivedBytes, sha256: actualSha256 }
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

export async function fetchRemoteModelManifest(options: {
  url: string
  revision: string
  expectedRelativePaths: readonly string[]
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  label?: string
}): Promise<RemoteModelManifest> {
  const fetchImpl = options.fetchImpl ?? fetch
  const label = options.label ?? '模型'
  const response = await fetchImpl(options.url, { redirect: 'follow', signal: options.signal })
  if (!response.ok) throw new Error(`${label}清单下载失败：HTTP ${response.status} ${response.statusText}`)

  let candidate: unknown
  try {
    candidate = await response.json()
  } catch {
    throw new Error(`${label}清单不是有效 JSON`)
  }
  if (!isRecord(candidate) || candidate.revision !== options.revision || !Array.isArray(candidate.files)) {
    throw new Error(`${label}清单无效或 revision 不匹配`)
  }

  const expectedPaths = new Set(options.expectedRelativePaths)
  const seenPaths = new Set<string>()
  const files: RemoteModelManifestFile[] = []
  for (const item of candidate.files) {
    if (!isRecord(item) || typeof item.relativePath !== 'string' || !expectedPaths.has(item.relativePath) || seenPaths.has(item.relativePath)) {
      throw new Error(`${label}清单包含未知或重复文件`)
    }
    if (typeof item.sha256 !== 'string' || !SHA256_PATTERN.test(item.sha256) || typeof item.sizeBytes !== 'number' || !Number.isInteger(item.sizeBytes) || item.sizeBytes <= 0) {
      throw new Error(`${label}清单文件校验字段无效：${item.relativePath}`)
    }
    seenPaths.add(item.relativePath)
    files.push({ relativePath: item.relativePath, sha256: item.sha256, sizeBytes: item.sizeBytes })
  }
  if (files.length !== expectedPaths.size || seenPaths.size !== expectedPaths.size) {
    throw new Error(`${label}清单文件数量或文件集合不匹配`)
  }

  return {
    revision: options.revision,
    files: options.expectedRelativePaths.map((relativePath) => files.find((file) => file.relativePath === relativePath)!)
  }
}

async function getFileStat(filePath: string): Promise<{ isFile(): boolean; size: number; mtimeMs: number; ctimeMs: number } | null> {
  try {
    const fileStat = await stat(filePath)
    return fileStat
  } catch {
    return null
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  const file = await open(filePath, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    while (true) {
      const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, null)
      if (bytesRead === 0) break
      hash.update(buffer.subarray(0, bytesRead))
    }
  } finally {
    await file.close()
  }
  return hash.digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
