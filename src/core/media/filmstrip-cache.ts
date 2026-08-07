import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type FilmstripCacheFrame = { sourceSeconds: number; buffer: Buffer }

export type FilmstripCacheResult = {
  frames: FilmstripCacheFrame[]
  cacheHit: boolean
  generatedFrameCount: number
  cacheKey: string | null
}

type FilmstripCacheOptions = {
  cacheDirectory: string
  mediaPath: string
  timestampsSeconds: number[]
  width: number
  quality: number
  renderFrame: (timestampSeconds: number) => Promise<Buffer | null>
}

type FilmstripManifest = {
  schemaVersion: 1
  media: { path: string; sizeBytes: number; mtimeMs: number }
  width: number
  quality: number
  frames: Array<{ sourceSeconds: number; fileName: string }>
  updatedAt: string
}

const cacheQueues = new Map<string, Promise<FilmstripCacheResult>>()

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function normalizeTimestamp(value: number): number {
  return Number(value.toFixed(3))
}

function getFrameFileName(timestampSeconds: number): string {
  return `frame-${Math.round(timestampSeconds * 1000)}.jpg`
}

export function getFilmstripCacheKey(mediaPath: string, sizeBytes: number, mtimeMs: number, width: number, quality: number): string {
  return hash(`${mediaPath}\n${sizeBytes}\n${mtimeMs}\n${width}\n${quality}`)
}

async function readFrame(filePath: string): Promise<Buffer | null> {
  try {
    const buffer = await readFile(filePath)
    return buffer.length > 0 ? buffer : null
  } catch {
    return null
  }
}

async function writeFrame(filePath: string, buffer: Buffer): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  await writeFile(temporaryPath, buffer)
  await rename(temporaryPath, filePath)
}

async function writeManifest(filePath: string, manifest: FilmstripManifest): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

async function resolveFilmstripCacheUnqueued(options: FilmstripCacheOptions): Promise<FilmstripCacheResult> {
  let mediaStat
  try {
    mediaStat = await stat(options.mediaPath)
  } catch {
    const frames: FilmstripCacheFrame[] = []
    for (let index = 0; index < options.timestampsSeconds.length; index += 3) {
      const batch = options.timestampsSeconds.slice(index, index + 3)
      const rendered = await Promise.all(batch.map((timestampSeconds) => options.renderFrame(timestampSeconds)))
      rendered.forEach((buffer, batchIndex) => {
        if (buffer) frames.push({ sourceSeconds: batch[batchIndex]!, buffer })
      })
    }
    return { frames: frames.sort((left, right) => left.sourceSeconds - right.sourceSeconds), cacheHit: false, generatedFrameCount: frames.length, cacheKey: null }
  }

  const timestampsSeconds = Array.from(new Set(options.timestampsSeconds.filter((value) => Number.isFinite(value) && value >= 0).map(normalizeTimestamp))).sort((left, right) => left - right)
  if (timestampsSeconds.length === 0) return { frames: [], cacheHit: true, generatedFrameCount: 0, cacheKey: null }

  const cacheKey = getFilmstripCacheKey(options.mediaPath, mediaStat.size, mediaStat.mtimeMs, options.width, options.quality)
  const cachePath = join(options.cacheDirectory, 'sources', cacheKey, `w${options.width}-q${options.quality}`)
  const manifestPath = join(cachePath, 'manifest.json')
  await mkdir(cachePath, { recursive: true })

  const frames = new Map<number, Buffer>()
  const missing: number[] = []
  await Promise.all(timestampsSeconds.map(async (sourceSeconds) => {
    const buffer = await readFrame(join(cachePath, getFrameFileName(sourceSeconds)))
    if (buffer) frames.set(sourceSeconds, buffer)
    else missing.push(sourceSeconds)
  }))

  let generatedFrameCount = 0
  for (let index = 0; index < missing.length; index += 3) {
    const batch = missing.slice(index, index + 3)
    const rendered = await Promise.all(batch.map((timestampSeconds) => options.renderFrame(timestampSeconds)))
    await Promise.all(rendered.map(async (buffer, batchIndex) => {
      if (!buffer) return
      const sourceSeconds = batch[batchIndex]!
      await writeFrame(join(cachePath, getFrameFileName(sourceSeconds)), buffer)
      frames.set(sourceSeconds, buffer)
      generatedFrameCount += 1
    }))
  }

  const manifest: FilmstripManifest = {
    schemaVersion: 1,
    media: { path: options.mediaPath, sizeBytes: mediaStat.size, mtimeMs: mediaStat.mtimeMs },
    width: options.width,
    quality: options.quality,
    frames: Array.from(frames.keys()).sort((left, right) => left - right).map((sourceSeconds) => ({ sourceSeconds, fileName: getFrameFileName(sourceSeconds) })),
    updatedAt: new Date().toISOString()
  }
  await writeManifest(manifestPath, manifest)

  return {
    frames: Array.from(frames.entries()).sort(([left], [right]) => left - right).map(([sourceSeconds, buffer]) => ({ sourceSeconds, buffer })),
    cacheHit: missing.length === 0,
    generatedFrameCount,
    cacheKey
  }
}

export function resolveFilmstripCache(options: FilmstripCacheOptions): Promise<FilmstripCacheResult> {
  const queueKey = `${options.cacheDirectory}\n${options.mediaPath}\n${options.width}\n${options.quality}`
  const previous = cacheQueues.get(queueKey) ?? Promise.resolve<FilmstripCacheResult>({ frames: [], cacheHit: false, generatedFrameCount: 0, cacheKey: null })
  const next = previous.catch(() => ({ frames: [], cacheHit: false, generatedFrameCount: 0, cacheKey: null })).then(() => resolveFilmstripCacheUnqueued(options))
  cacheQueues.set(queueKey, next)
  void next.then(() => {
    if (cacheQueues.get(queueKey) === next) cacheQueues.delete(queueKey)
  })
  return next
}
