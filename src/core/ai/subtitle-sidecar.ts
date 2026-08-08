import { stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

export type MediaSubtitleSidecarPaths = {
  subtitlePath: string
  subtitleSrtPath?: string
  revision: number
}

export function getMediaSubtitleSidecarPaths(mediaPath: string): { subtitlePath: string; subtitleSrtPath: string } {
  const stem = join(dirname(mediaPath), basename(mediaPath, extname(mediaPath)))
  return { subtitlePath: `${stem}.vtt`, subtitleSrtPath: `${stem}.srt` }
}

export async function resolveMediaSubtitleSidecar(mediaPath: string): Promise<MediaSubtitleSidecarPaths | null> {
  if (typeof mediaPath !== 'string' || !mediaPath.trim()) return null
  const candidates = getMediaSubtitleSidecarPaths(mediaPath.trim())
  const [vttStat, srtStat] = await Promise.all([
    stat(candidates.subtitlePath).catch(() => null),
    stat(candidates.subtitleSrtPath).catch(() => null)
  ])
  if (!vttStat && !srtStat) return null

  return {
    subtitlePath: vttStat ? candidates.subtitlePath : candidates.subtitleSrtPath,
    subtitleSrtPath: srtStat ? candidates.subtitleSrtPath : undefined,
    revision: Math.round(Math.max(vttStat?.mtimeMs ?? 0, srtStat?.mtimeMs ?? 0))
  }
}
