import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type WaveformCacheResult = {
  buffer: Buffer | null
  cacheHit: boolean
  generated: boolean
  cacheKey: string | null
}

type WaveformCacheOptions = {
  cacheDirectory: string
  mediaPath: string
  width: number
  height: number
  renderWaveform: () => Promise<Buffer | null>
}

type WaveformManifest = {
  schemaVersion: 1
  media: { path: string; sizeBytes: number; mtimeMs: number }
  width: number
  height: number
  updatedAt: string
}

const cacheQueues = new Map<string, Promise<WaveformCacheResult>>()

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

export function getWaveformCacheKey(mediaPath: string, sizeBytes: number, mtimeMs: number, width: number, height: number): string {
  return hash(`${mediaPath}\n${sizeBytes}\n${mtimeMs}\n${width}\n${height}`)
}

async function readWaveform(filePath: string): Promise<Buffer | null> {
  try {
    const buffer = await readFile(filePath)
    return buffer.length > 0 ? buffer : null
  } catch {
    return null
  }
}

async function writeAtomically(filePath: string, value: Buffer | string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  await writeFile(temporaryPath, value)
  await rename(temporaryPath, filePath)
}

async function resolveWaveformCacheUnqueued(options: WaveformCacheOptions): Promise<WaveformCacheResult> {
  let mediaStat
  try {
    mediaStat = await stat(options.mediaPath)
  } catch {
    const buffer = await options.renderWaveform()
    return { buffer, cacheHit: false, generated: Boolean(buffer), cacheKey: null }
  }

  const cacheKey = getWaveformCacheKey(options.mediaPath, mediaStat.size, mediaStat.mtimeMs, options.width, options.height)
  const cachePath = join(options.cacheDirectory, 'sources', cacheKey, `w${options.width}-h${options.height}`)
  const waveformPath = join(cachePath, 'waveform.png')
  const manifestPath = join(cachePath, 'manifest.json')
  await mkdir(cachePath, { recursive: true })
  const cached = await readWaveform(waveformPath)
  if (cached) return { buffer: cached, cacheHit: true, generated: false, cacheKey }

  const buffer = await options.renderWaveform()
  if (!buffer) return { buffer: null, cacheHit: false, generated: false, cacheKey }
  await writeAtomically(waveformPath, buffer)
  const manifest: WaveformManifest = {
    schemaVersion: 1,
    media: { path: options.mediaPath, sizeBytes: mediaStat.size, mtimeMs: mediaStat.mtimeMs },
    width: options.width,
    height: options.height,
    updatedAt: new Date().toISOString()
  }
  await writeAtomically(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return { buffer, cacheHit: false, generated: true, cacheKey }
}

export function resolveWaveformCache(options: WaveformCacheOptions): Promise<WaveformCacheResult> {
  const queueKey = `${options.cacheDirectory}\n${options.mediaPath}\n${options.width}\n${options.height}`
  const previous = cacheQueues.get(queueKey) ?? Promise.resolve<WaveformCacheResult>({ buffer: null, cacheHit: false, generated: false, cacheKey: null })
  const next = previous.catch(() => ({ buffer: null, cacheHit: false, generated: false, cacheKey: null })).then(() => resolveWaveformCacheUnqueued(options))
  cacheQueues.set(queueKey, next)
  void next.then(() => {
    if (cacheQueues.get(queueKey) === next) cacheQueues.delete(queueKey)
  })
  return next
}
