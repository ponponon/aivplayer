import { parseVtt } from '../../../core/ai/subtitle-writer'
import type { EditingCaption, EditingProject } from '../../../shared/editing-types'
import { attachSubtitleWords, getSubtitleWordSidecarPath, joinSubtitleWords, parseWhisperSubtitleWords, type SubtitleWord } from '../../../shared/subtitle-timing'

export type CaptionSource = {
  path: string | null
  pathCandidates?: readonly string[]
  sourceId: string
  kind: EditingCaption['kind']
}

export type EditingCaptionSourceOptions = {
  currentMediaPath: string | null
  subtitlePath: string | null
  subtitleSrtPath: string | null
  translatedSubtitlePath: string | null
  translatedSubtitleSrtPath: string | null
}

/**
 * Builds sidecar inputs only for sources that still own a timeline clip.
 * The preferred paths belong to the actual current media path, not to the
 * first source array entry; source order can remain stable after a clip swap.
 */
export function createEditingCaptionSources(project: Pick<EditingProject, 'sources' | 'videoClips'>, options: EditingCaptionSourceOptions): CaptionSource[] {
  const activeSourceIds = new Set(project.videoClips.map((clip) => clip.sourceId))
  return project.sources.filter((source) => activeSourceIds.has(source.id)).flatMap((source) => {
    const isCurrentMedia = source.path === options.currentMediaPath
    const preferredSourcePath = isCurrentMedia ? (options.subtitleSrtPath ?? options.subtitlePath) : null
    const preferredTranslationPath = isCurrentMedia ? (options.translatedSubtitleSrtPath ?? options.translatedSubtitlePath) : null
    return [
      { path: preferredSourcePath, pathCandidates: createEditingCaptionPathCandidates(source.path, preferredSourcePath, 'source'), sourceId: source.id, kind: 'source' as const },
      { path: preferredTranslationPath, pathCandidates: createEditingCaptionPathCandidates(source.path, preferredTranslationPath, 'translation'), sourceId: source.id, kind: 'translation' as const }
    ]
  })
}

/**
 * Revision identity must include the active source set. A subtitle revision
 * from an unused/old current file must not trigger a reload for a replacement
 * source that is now the only clip on the timeline.
 */
export function createEditingCaptionSourceRevisionKey(project: Pick<EditingProject, 'sources' | 'videoClips'>, options: Pick<EditingCaptionSourceOptions, 'currentMediaPath'> & { subtitleRevision?: number; translatedSubtitleRevision?: number }): string {
  const activeSourceKey = project.sources
    .filter((source) => project.videoClips.some((clip) => clip.sourceId === source.id))
    .map((source) => `${source.id}:${source.path}`)
    .join('|') || 'none'
  const currentMediaIsActive = project.sources.some((source) => source.path === options.currentMediaPath && project.videoClips.some((clip) => clip.sourceId === source.id))
  return `sources=${activeSourceKey}|source=${currentMediaIsActive ? (options.subtitleRevision ?? 'none') : 'none'}|translation=${currentMediaIsActive ? (options.translatedSubtitleRevision ?? 'none') : 'none'}`
}

/** Prevent a stale Whisper token sidecar from rendering words from an older subtitle revision. */
export function areEditingCaptionWordsCompatible(captionText: string, words: readonly SubtitleWord[]): boolean {
  const normalize = (text: string): string => text.replace(/\s+/gu, '').trim()
  return normalize(captionText) === normalize(joinSubtitleWords(words))
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
  const wordPaths = [...new Set(paths.map(getSubtitleWordSidecarPath).filter((path): path is string => Boolean(path)))]
  const wordTexts = await Promise.all(wordPaths.map(async (path) => {
    try { return await window.aiv.readFileContent(path) } catch { return null }
  }))
  const words = parseWhisperSubtitleWords(wordTexts.find((candidate): candidate is string => candidate !== null) ?? '')
  const segments = attachSubtitleWords(parseVtt(text), words, source.kind === 'source')
  return segments.flatMap((segment, index) => {
      const durationSeconds = Math.max(0, segment.endSeconds - segment.startSeconds)
      const captionWords = source.kind === 'source' && segment.words && areEditingCaptionWordsCompatible(segment.text, segment.words)
        ? segment.words.map((word) => ({ startSeconds: Math.max(0, word.startSeconds - segment.startSeconds), endSeconds: Math.max(0, word.endSeconds - segment.startSeconds), text: word.text }))
        : undefined
      return durationSeconds > 0 ? [{ id: `${source.kind}-${source.sourceId}-${index}`, sourceId: source.sourceId, sourceStartSeconds: segment.startSeconds, sourceEndSeconds: segment.endSeconds, kind: source.kind, startSeconds: segment.startSeconds, durationSeconds, text: segment.text, ...(captionWords && captionWords.length > 0 ? { words: captionWords } : {}) }] : []
    })
}

export async function loadEditingCaptions(sources: readonly CaptionSource[]): Promise<EditingCaption[]> {
  const loaded = await Promise.all(sources.map(loadCaptionSource))
  return loaded.flat().sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind))
}
