import { parseVtt } from '../../../core/ai/subtitle-writer'
import type { EditingCaption } from '../../../shared/editing-types'

export type CaptionSource = {
  path: string | null
  pathCandidates?: readonly string[]
  sourceId: string
  kind: EditingCaption['kind']
}

export function createEditingCaptionPathCandidates(mediaPath: string, preferredPath: string | null, kind: EditingCaption['kind']): string[] {
  const extensionIndex = mediaPath.lastIndexOf('.')
  const separatorIndex = Math.max(mediaPath.lastIndexOf('/'), mediaPath.lastIndexOf('\\'))
  const basePath = extensionIndex > separatorIndex ? mediaPath.slice(0, extensionIndex) : mediaPath
  const suffixes = kind === 'source'
    ? ['.srt', '.vtt']
    : ['.translated.srt', '.translated.vtt', '.translation.srt', '.translation.vtt', '.zh-CN.srt', '.zh-CN.vtt', '.zh.srt', '.zh.vtt']
  return [...new Set([preferredPath, ...suffixes.map((suffix) => `${basePath}${suffix}`)].filter((path): path is string => Boolean(path)))]
}

async function loadCaptionSource(source: CaptionSource): Promise<EditingCaption[]> {
  const paths = [...new Set([source.path, ...(source.pathCandidates ?? [])].filter((path): path is string => Boolean(path)))]
  const texts = await Promise.all(paths.map(async (path) => {
    try { return await window.aiv.readFileContent(path) } catch { return null }
  }))
  const text = texts.find((candidate): candidate is string => candidate !== null)
  if (text === undefined) return []
  return parseVtt(text).flatMap((segment, index) => {
      const durationSeconds = Math.max(0, segment.endSeconds - segment.startSeconds)
      return durationSeconds > 0 ? [{ id: `${source.kind}-${source.sourceId}-${index}`, sourceId: source.sourceId, sourceStartSeconds: segment.startSeconds, sourceEndSeconds: segment.endSeconds, kind: source.kind, startSeconds: segment.startSeconds, durationSeconds, text: segment.text }] : []
    })
}

export async function loadEditingCaptions(sources: readonly CaptionSource[]): Promise<EditingCaption[]> {
  const loaded = await Promise.all(sources.map(loadCaptionSource))
  return loaded.flat().sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind))
}
