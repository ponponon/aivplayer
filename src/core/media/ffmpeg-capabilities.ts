import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { MediaFfmpegCapabilities } from '../../shared/media-types'

const execFileAsync = promisify(execFile)

export function parseFfmpegSubtitleFilter(output: string): 'subtitles' | 'ass' | null {
  const lines = output.split(/\r?\n/u)
  if (lines.some((line) => /\bsubtitles\b\s+V->V\b/u.test(line))) return 'subtitles'
  if (lines.some((line) => /\bass\b\s+V->V\b/u.test(line))) return 'ass'
  return null
}

export async function probeFfmpegCapabilities(ffmpegPath: string): Promise<MediaFfmpegCapabilities> {
  try {
    const { stdout, stderr } = await execFileAsync(ffmpegPath, ['-hide_banner', '-filters'], { timeout: 5_000, maxBuffer: 4 * 1024 * 1024 })
    const subtitleFilter = parseFfmpegSubtitleFilter(`${stdout}\n${stderr}`)
    return { available: true, subtitleBurnIn: subtitleFilter !== null, subtitleFilter }
  } catch {
    return { available: false, subtitleBurnIn: false, subtitleFilter: null }
  }
}
