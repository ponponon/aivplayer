import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { validateSubtitleText, type SubtitleValidationReason } from './subtitle-validation'

export type MediaSubtitleSidecarPaths = {
  subtitlePath: string
  subtitleSrtPath?: string
  revision: number
}

export type MediaSubtitleSidecarReady = MediaSubtitleSidecarPaths & {
  status: 'ready'
  cueCount: number
}

export type MediaSubtitleSidecarInvalid = {
  status: 'invalid'
  path: string
  revision: number
  reason: SubtitleValidationReason
}

export type MediaSubtitleSidecarResolution = MediaSubtitleSidecarReady | MediaSubtitleSidecarInvalid | null

export function getMediaSubtitleSidecarPaths(mediaPath: string): { subtitlePath: string; subtitleSrtPath: string } {
  const stem = join(dirname(mediaPath), basename(mediaPath, extname(mediaPath)))
  return { subtitlePath: `${stem}.vtt`, subtitleSrtPath: `${stem}.srt` }
}

export async function resolveMediaSubtitleSidecar(mediaPath: string): Promise<MediaSubtitleSidecarResolution> {
  if (typeof mediaPath !== 'string' || !mediaPath.trim()) return null
  const candidates = getMediaSubtitleSidecarPaths(mediaPath.trim())
  const [vttStat, srtStat] = await Promise.all([
    stat(candidates.subtitlePath).catch(() => null),
    stat(candidates.subtitleSrtPath).catch(() => null)
  ])
  if (!vttStat && !srtStat) return null

  const invalidResults: MediaSubtitleSidecarInvalid[] = []
  const validateCandidate = async (path: string, mtimeMs: number): Promise<{ cueCount: number } | null> => {
    try {
      const validation = validateSubtitleText(await readFile(path, 'utf8'))
      if (validation.valid) return { cueCount: validation.cueCount }
      invalidResults.push({ status: 'invalid', path, revision: Math.round(mtimeMs), reason: validation.reason ?? 'no-cues' })
    } catch {
      invalidResults.push({ status: 'invalid', path, revision: Math.round(mtimeMs), reason: 'no-cues' })
    }
    return null
  }

  const vtt = vttStat ? await validateCandidate(candidates.subtitlePath, vttStat.mtimeMs) : null
  const srt = srtStat ? await validateCandidate(candidates.subtitleSrtPath, srtStat.mtimeMs) : null
  if (vtt) {
    return {
      status: 'ready',
      subtitlePath: candidates.subtitlePath,
      subtitleSrtPath: srt ? candidates.subtitleSrtPath : undefined,
      revision: Math.round(Math.max(vttStat?.mtimeMs ?? 0, srt ? srtStat?.mtimeMs ?? 0 : 0)),
      cueCount: vtt.cueCount
    }
  }
  if (srt) {
    return {
      status: 'ready',
      subtitlePath: candidates.subtitleSrtPath,
      subtitleSrtPath: candidates.subtitleSrtPath,
      revision: Math.round(srtStat?.mtimeMs ?? 0),
      cueCount: srt.cueCount
    }
  }

  return invalidResults[0] ?? null
}
