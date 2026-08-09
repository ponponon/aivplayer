import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DEFAULT_MIN_SCENE_DURATION_SECONDS, DEFAULT_SCENE_DETECTION_THRESHOLD, parseSceneCutTimestamps } from './scene-detection'

const execFileAsync = promisify(execFile)

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('场景检测已取消')
  error.name = 'AbortError'
  throw error
}

/** Runs FFmpeg's scene filter and returns de-duplicated cut timestamps. Desktop-only runtime code. */
export async function detectSceneCutTimestamps(
  ffmpegPath: string,
  mediaPath: string,
  threshold = DEFAULT_SCENE_DETECTION_THRESHOLD,
  minSceneDurationSeconds = DEFAULT_MIN_SCENE_DURATION_SECONDS,
  signal?: AbortSignal
): Promise<number[]> {
  throwIfAborted(signal)
  const filter = `select='gt(scene,${threshold})',showinfo`
  const { stdout, stderr } = await execFileAsync(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'info',
    '-i',
    mediaPath,
    '-vf',
    filter,
    '-an',
    '-f',
    'null',
    '-'
  ], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024, signal })
  throwIfAborted(signal)
  return parseSceneCutTimestamps(`${stdout}\n${stderr}`, minSceneDurationSeconds)
}
