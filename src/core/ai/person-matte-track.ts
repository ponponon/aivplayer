import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getEditingPersonMatteCacheKey, EDITING_PERSON_MATTE_PROVIDER_ID, EDITING_PERSON_MATTE_SAMPLE_FPS } from '../editing/person-matte'
import { PersonMatteRuntime } from './person-matte-runtime'

const execFileAsync = promisify(execFile)
const PERSON_MATTE_TRACK_VERSION = 1 as const
const PERSON_MATTE_TRACK_PROVIDER_ID = `${EDITING_PERSON_MATTE_PROVIDER_ID}-cpu`

export type PersonMatteTrackFrame = {
  sourceSeconds: number
  path: string
}

export type PersonMatteTrack = {
  version: typeof PERSON_MATTE_TRACK_VERSION
  sourceFingerprint: string
  sourceStartSeconds: number
  sourceEndSeconds: number
  sampleFps: number
  providerId: string
  frames: PersonMatteTrackFrame[]
}

export type PersonMatteTrackProgress = {
  status: 'cached' | 'processing'
  processedFrames: number
  totalFrames: number
}

export type BuildPersonMatteTrackOptions = {
  ffmpegPath: string
  sourcePath: string
  sourceFingerprint: string
  sourceStartSeconds: number
  sourceEndSeconds: number
  cacheRoot: string
  runtime: Pick<PersonMatteRuntime, 'removeBackgroundToFile'>
  sampleFps?: number
  signal?: AbortSignal
  onProgress?: (progress: PersonMatteTrackProgress) => void
  extractFrame?: (timestampSeconds: number, outputPath: string) => Promise<void>
}

export function getPersonMatteTrackTimestamps(sourceStartSeconds: number, sourceEndSeconds: number, sampleFps = EDITING_PERSON_MATTE_SAMPLE_FPS): number[] {
  const start = Math.max(0, Number.isFinite(sourceStartSeconds) ? sourceStartSeconds : 0)
  const end = Math.max(start, Number.isFinite(sourceEndSeconds) ? sourceEndSeconds : start)
  const fps = Number.isFinite(sampleFps) && sampleFps > 0 ? sampleFps : EDITING_PERSON_MATTE_SAMPLE_FPS
  const step = 1 / fps
  const timestamps: number[] = []
  for (let timestamp = start; timestamp < end - 0.000001; timestamp += step) timestamps.push(Number(timestamp.toFixed(3)))
  return timestamps.length > 0 ? timestamps : [Number(start.toFixed(3))]
}

export function getPersonMatteTrackCacheDirectory(cacheRoot: string, input: { sourceFingerprint: string; sourceStartSeconds: number; sourceEndSeconds: number; sampleFps?: number }): string {
  const cacheKey = getEditingPersonMatteCacheKey({ ...input, providerId: PERSON_MATTE_TRACK_PROVIDER_ID })
  const digest = createHash('sha256').update(cacheKey).digest('hex').slice(0, 24)
  return join(resolve(cacheRoot), 'person-matte', digest)
}

export async function buildPersonMatteTrack(options: BuildPersonMatteTrackOptions): Promise<PersonMatteTrack> {
  const sampleFps = Number.isFinite(options.sampleFps) && options.sampleFps! > 0 ? options.sampleFps! : EDITING_PERSON_MATTE_SAMPLE_FPS
  const timestamps = getPersonMatteTrackTimestamps(options.sourceStartSeconds, options.sourceEndSeconds, sampleFps)
  const cacheDirectory = getPersonMatteTrackCacheDirectory(options.cacheRoot, { sourceFingerprint: options.sourceFingerprint, sourceStartSeconds: options.sourceStartSeconds, sourceEndSeconds: options.sourceEndSeconds, sampleFps })
  const cached = await readValidPersonMatteTrack(join(cacheDirectory, 'manifest.json'), cacheDirectory, { sourceFingerprint: options.sourceFingerprint, sourceStartSeconds: options.sourceStartSeconds, sourceEndSeconds: options.sourceEndSeconds, sampleFps })
  if (cached) {
    options.onProgress?.({ status: 'cached', processedFrames: cached.frames.length, totalFrames: cached.frames.length })
    return cached
  }

  throwIfAborted(options.signal)
  await mkdir(dirname(cacheDirectory), { recursive: true })
  const buildDirectory = await mkdtemp(join(dirname(cacheDirectory), `${basename(cacheDirectory)}-building-`))
  const extractFrame = options.extractFrame ?? ((timestampSeconds: number, outputPath: string) => extractVideoFrame(options.ffmpegPath, options.sourcePath, timestampSeconds, outputPath))
  const frames: PersonMatteTrackFrame[] = []
  try {
    for (let index = 0; index < timestamps.length; index += 1) {
      throwIfAborted(options.signal)
      const sourceSeconds = timestamps[index]!
      const inputPath = join(buildDirectory, `input-${String(index).padStart(6, '0')}.jpg`)
      const outputPath = join(buildDirectory, `mask-${String(index).padStart(6, '0')}.png`)
      await extractFrame(sourceSeconds, inputPath)
      await options.runtime.removeBackgroundToFile(inputPath, outputPath)
      throwIfAborted(options.signal)
      await rm(inputPath, { force: true })
      frames.push({ sourceSeconds, path: outputPath })
      options.onProgress?.({ status: 'processing', processedFrames: frames.length, totalFrames: timestamps.length })
    }

    const track: PersonMatteTrack = { version: PERSON_MATTE_TRACK_VERSION, sourceFingerprint: options.sourceFingerprint, sourceStartSeconds: options.sourceStartSeconds, sourceEndSeconds: options.sourceEndSeconds, sampleFps, providerId: PERSON_MATTE_TRACK_PROVIDER_ID, frames: frames.map((frame) => ({ ...frame, path: join(cacheDirectory, basename(frame.path)) })) }
    await writeFile(join(buildDirectory, 'manifest.json'), `${JSON.stringify(track, null, 2)}\n`, 'utf8')
    await rm(cacheDirectory, { recursive: true, force: true })
    await rename(buildDirectory, cacheDirectory)
    return track
  } catch (error) {
    await rm(buildDirectory, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function readValidPersonMatteTrack(manifestPath: string, cacheDirectory: string, expected: { sourceFingerprint: string; sourceStartSeconds: number; sourceEndSeconds: number; sampleFps: number }): Promise<PersonMatteTrack | null> {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as Partial<PersonMatteTrack>
    if (parsed.version !== PERSON_MATTE_TRACK_VERSION || parsed.providerId !== PERSON_MATTE_TRACK_PROVIDER_ID || parsed.sourceFingerprint !== expected.sourceFingerprint || parsed.sourceStartSeconds !== expected.sourceStartSeconds || parsed.sourceEndSeconds !== expected.sourceEndSeconds || parsed.sampleFps !== expected.sampleFps || !Array.isArray(parsed.frames) || parsed.frames.length === 0) return null
    const frames = parsed.frames.map((frame) => {
      if (!frame || typeof frame.sourceSeconds !== 'number' || typeof frame.path !== 'string') return null
      const path = resolve(frame.path)
      const root = resolve(cacheDirectory)
      const relativePath = relative(root, path)
      if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === '..') return null
      return { sourceSeconds: frame.sourceSeconds, path }
    })
    if (frames.some((frame): frame is null => frame === null)) return null
    await Promise.all((frames as PersonMatteTrackFrame[]).map(async (frame) => { const fileStat = await stat(frame.path); if (!fileStat.isFile() || fileStat.size <= 0) throw new Error('invalid cache') }))
    return { version: parsed.version, sourceFingerprint: parsed.sourceFingerprint, sourceStartSeconds: parsed.sourceStartSeconds, sourceEndSeconds: parsed.sourceEndSeconds, sampleFps: parsed.sampleFps, providerId: parsed.providerId, frames: frames as PersonMatteTrackFrame[] }
  } catch {
    return null
  }
}

async function extractVideoFrame(ffmpegPath: string, sourcePath: string, timestampSeconds: number, outputPath: string): Promise<void> {
  await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', timestampSeconds.toFixed(3), '-i', sourcePath, '-frames:v', '1', '-q:v', '4', outputPath], { maxBuffer: 2 * 1024 * 1024 })
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  const error = new Error('人物抠像处理已取消')
  error.name = 'AbortError'
  throw error
}
